import type {
  Lorry,
  Shipment,
  OptimizationSettings,
  GeoPoint,
  FeasibilityResult,
  RouteLeg,
  PlannedShipment,
  LorryPlan,
  OptimizationResult,
  UnassignedShipment,
  LorryCandidateComparison,
  BeforeAfterSummary,
  DeadlineStatus,
  Priority,
} from '@/types';
import { PRIORITY_WEIGHT } from '@/types';

// ============ GEOGRAPHIC DISTANCE (Haversine) ============
// Fallback calculation when no routing API is available.
// Uses the great-circle distance between two lat/lng points.

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Road distance factor: straight-line * 1.3 to approximate road winding
  return EARTH_RADIUS_KM * c * 1.3;
}

export function distanceBetween(a: GeoPoint, b: GeoPoint): number {
  return haversineDistance(a.lat, a.lng, b.lat, b.lng);
}

// ============ TRAVEL TIME ============

export function travelTimeMinutes(distance_km: number, settings: OptimizationSettings): number {
  return (distance_km / settings.average_speed_kmh) * 60;
}

// ============ FUEL & COST ============

export function fuelLitres(distance_km: number, fuelEfficiency_kmpl: number): number {
  return distance_km / fuelEfficiency_kmpl;
}

export function fuelCost(fuel_litres: number, fuel_price_per_litre: number): number {
  return fuel_litres * fuel_price_per_litre;
}

export function totalCostBreakdown(
  fuel_cost: number,
  travel_time_minutes: number,
  distance_km: number,
  settings: OptimizationSettings,
  wait_time_minutes: number = 0
) {
  // Driver cost includes both travel time AND wait time (they are on the clock)
  const driver_cost = ((travel_time_minutes + wait_time_minutes) / 60) * settings.driver_cost_per_hour;
  const operating_cost = distance_km * settings.operating_cost_per_km;
  const toll_cost = distance_km * settings.toll_cost_per_km;
  const service_cost = settings.service_cost;
  // Fuel does NOT accrue during wait time — only during travel
  const total = fuel_cost + driver_cost + operating_cost + toll_cost + service_cost;
  return { fuel_cost, driver_cost, operating_cost, toll_cost, service_cost, total };
}

// ============ FEASIBILITY ENGINE ============

export function checkFeasibility(
  lorry: Lorry,
  shipments: Shipment[],
  estimated_eta: Date | null,
  settings: OptimizationSettings,
  total_travel_time_minutes?: number
): FeasibilityResult {
  const reasons: string[] = [];
  void settings;

  // Driver availability
  if (!lorry.driver_available) {
    reasons.push('Driver unavailable.');
  }

  // Lorry status
  if (lorry.status !== 'active') {
    reasons.push(`Lorry is ${lorry.status}, not available for assignment.`);
  }

  // Weight capacity
  const totalWeight = sum(shipments.map((s) => s.weight_kg));
  if (totalWeight > lorry.maximum_weight_capacity_kg) {
    const excess = totalWeight - lorry.maximum_weight_capacity_kg;
    reasons.push(`Weight capacity exceeded by ${formatNumber(excess)} kg.`);
  }

  // Volume capacity
  const totalVolume = sum(shipments.map((s) => s.volume_m3));
  if (totalVolume > lorry.maximum_volume_capacity_m3) {
    const excess = totalVolume - lorry.maximum_volume_capacity_m3;
    reasons.push(`Volume capacity exceeded by ${formatNumber(excess, 1)} m³.`);
  }

  // Deadline feasibility
  if (estimated_eta) {
    for (const s of shipments) {
      const deadline = new Date(s.delivery_deadline);
      if (estimated_eta > deadline) {
        const lateBy = Math.ceil((estimated_eta.getTime() - deadline.getTime()) / 60000);
        reasons.push(
          `Delivery deadline cannot be met for ${s.shipment_id} (late by ${lateBy} min).`
        );
      }
    }
  }

  // Driver working-hour limit (Feature 4)
  if (total_travel_time_minutes !== undefined) {
    const maxMinutes = (lorry.max_driving_hours_per_day ?? 9) * 60;
    if (total_travel_time_minutes > maxMinutes) {
      const limitH = lorry.max_driving_hours_per_day ?? 9;
      const routeH = Math.round((total_travel_time_minutes / 60) * 10) / 10;
      reasons.push(`Assignment would exceed driver's max working hours (${limitH}h limit, route requires ${routeH}h).`);
    }
  }

  return { feasible: reasons.length === 0, reasons };
}

/**
 * The same end-to-end feasibility calculation used by optimization, exposed
 * for live shipment-entry diagnostics. It includes capacity, availability and
 * the route-derived delivery deadline rather than relying on form validation.
 */
export function evaluateShipmentCompatibility(
  lorry: Lorry,
  shipment: Shipment,
  settings: OptimizationSettings
): {
  feasible: boolean;
  reasons: string[];
  total_distance_km: number;
  total_cost: number;
  deadline_margin_minutes: number | null;
} {
  const base = checkFeasibility(lorry, [shipment], null, settings);
  if (!base.feasible) {
    return { feasible: false, reasons: base.reasons, total_distance_km: 0, total_cost: 0, deadline_margin_minutes: null };
  }

  const plan = buildLorryPlan(lorry, [shipment], settings);

  // Check driver hours
  const maxMinutes = (lorry.max_driving_hours_per_day ?? 9) * 60;
  if (plan.total_travel_time_minutes > maxMinutes) {
    const limitH = lorry.max_driving_hours_per_day ?? 9;
    const routeH = Math.round((plan.total_travel_time_minutes / 60) * 10) / 10;
    return {
      feasible: false,
      reasons: [`Assignment would exceed driver's max working hours (${limitH}h limit, route requires ${routeH}h).`],
      total_distance_km: plan.total_distance_km,
      total_cost: plan.total_cost,
      deadline_margin_minutes: null,
    };
  }

  const eta = plan.sequence[0]?.eta;
  const deadline = new Date(shipment.delivery_deadline);
  const margin = eta ? Math.floor((deadline.getTime() - eta.getTime()) / 60000) : null;
  const reasons = margin !== null && margin < 0
    ? [`Delivery deadline cannot be met (late by ${Math.abs(margin)} min).`]
    : [];
  return {
    feasible: reasons.length === 0,
    reasons,
    total_distance_km: plan.total_distance_km,
    total_cost: plan.total_cost,
    deadline_margin_minutes: margin,
  };
}

// ============ ROUTE & SEQUENCE ============

function geoPoint(name: string, lat: number, lng: number): GeoPoint {
  return { name, lat, lng };
}

function lorryLocation(l: Lorry): GeoPoint {
  return geoPoint(l.current_location_name, l.current_latitude, l.current_longitude);
}

function shipmentPickup(s: Shipment): GeoPoint {
  return geoPoint(s.pickup_location_name, s.pickup_latitude, s.pickup_longitude);
}

function shipmentDestination(s: Shipment): GeoPoint {
  return geoPoint(s.destination_name, s.destination_latitude, s.destination_longitude);
}

// For a lorry delivering a set of shipments, the route is:
// lorry_location -> pickup_1 -> destination_1 -> pickup_2 -> destination_2 -> ...
// We evaluate permutations of shipment delivery order (for small groups).
// For groups > 6 shipments, use nearest-neighbor heuristic.

function evaluateSequence(
  lorry: Lorry,
  shipments: Shipment[],
  order: number[],
  settings: OptimizationSettings
): { legs: RouteLeg[]; planned: PlannedShipment[]; total_distance: number; total_time: number; total_wait: number } {
  const start = lorryLocation(lorry);
  let current = start;
  let totalDistance = 0;
  let cumulativeTime = 0;
  let totalWait = 0;
  const legs: RouteLeg[] = [];
  const planned: PlannedShipment[] = [];

  // For simplicity, each shipment is picked up at its pickup location then delivered at destination.
  // In a grouped scenario, the lorry visits each pickup then each destination in sequence.
  for (let idx = 0; idx < order.length; idx++) {
    const s = shipments[order[idx]];
    const pickup = shipmentPickup(s);
    const dest = shipmentDestination(s);

    // Travel to pickup
    const d1 = distanceBetween(current, pickup);
    const t1 = travelTimeMinutes(d1, settings);
    totalDistance += d1;
    cumulativeTime += t1;
    legs.push({ from: current, to: pickup, distance_km: d1, travel_time_minutes: t1 });

    // Loading time at pickup
    cumulativeTime += settings.loading_time_minutes;

    // Travel to destination
    const d2 = distanceBetween(pickup, dest);
    const t2 = travelTimeMinutes(d2, settings);
    totalDistance += d2;
    cumulativeTime += t2;
    legs.push({ from: pickup, to: dest, distance_km: d2, travel_time_minutes: t2 });

    // Service + unloading time at destination
    cumulativeTime += settings.unloading_time_minutes + settings.service_time_minutes;

    let eta = new Date(Date.now() + cumulativeTime * 60000);
    let waitTime = 0;

    // Feature 3: Earliest delivery time window
    // If we arrive before the earliest acceptable time, add wait time
    const earliestTime = s.earliest_delivery_time ? new Date(s.earliest_delivery_time) : null;
    if (earliestTime && eta < earliestTime) {
      waitTime = (earliestTime.getTime() - eta.getTime()) / 60000;
      cumulativeTime += waitTime;
      totalWait += waitTime;
      eta = earliestTime;
    }

    const deadline = new Date(s.delivery_deadline);
    const deadline_status: DeadlineStatus = eta <= deadline ? 'ON_TIME' : 'LATE';

    planned.push({
      shipment: s,
      sequence: idx + 1,
      cumulative_distance_km: totalDistance,
      cumulative_time_minutes: cumulativeTime,
      wait_time_minutes: waitTime,
      eta,
      deadline,
      deadline_status,
      earliest_delivery_time: earliestTime,
    });

    current = dest;
  }

  return { legs, planned, total_distance: totalDistance, total_time: cumulativeTime, total_wait: totalWait };
}

function permute(arr: number[]): number[][] {
  if (arr.length <= 1) return [arr];
  const result: number[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permute(rest)) {
      result.push([arr[i], ...p]);
    }
  }
  return result;
}

function nearestNeighborOrder(
  lorry: Lorry,
  shipments: Shipment[]
): number[] {
  const start = lorryLocation(lorry);
  const remaining = shipments.map((_, i) => i);
  const order: number[] = [];
  let current = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = shipments[remaining[i]];
      const pickup = shipmentPickup(s);
      const d = distanceBetween(current, pickup);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const idx = remaining.splice(bestIdx, 1)[0];
    order.push(idx);
    current = shipmentDestination(shipments[idx]);
  }

  return order;
}

function bestSequence(
  lorry: Lorry,
  shipments: Shipment[],
  settings: OptimizationSettings
): { legs: RouteLeg[]; planned: PlannedShipment[]; total_distance: number; total_time: number; total_wait: number } {
  if (shipments.length === 0) {
    return { legs: [], planned: [], total_distance: 0, total_time: 0, total_wait: 0 };
  }

  const n = shipments.length;
  const indices = shipments.map((_, i) => i);

  // For small groups (<=6), evaluate all permutations
  if (n <= 6) {
    const perms = permute(indices);
    let best = evaluateSequence(lorry, shipments, perms[0], settings);
    let bestCost = best.total_distance;
    for (let i = 1; i < perms.length; i++) {
      const candidate = evaluateSequence(lorry, shipments, perms[i], settings);
      // Prefer routes that meet all deadlines, then lower distance
      const candidateLate = candidate.planned.filter((p) => p.deadline_status === 'LATE').length;
      const bestLate = best.planned.filter((p) => p.deadline_status === 'LATE').length;
      if (candidateLate < bestLate || (candidateLate === bestLate && candidate.total_distance < bestCost)) {
        best = candidate;
        bestCost = candidate.total_distance;
      }
    }
    return best;
  }

  // For larger groups, use nearest-neighbor heuristic
  const order = nearestNeighborOrder(lorry, shipments);
  return evaluateSequence(lorry, shipments, order, settings);
}

// ============ BUILD A LORRY PLAN ============

function buildLorryPlan(
  lorry: Lorry,
  shipments: Shipment[],
  settings: OptimizationSettings
): LorryPlan {
  const { legs, planned, total_distance, total_time, total_wait } = bestSequence(lorry, shipments, settings);

  const fuel_litres = fuelLitres(total_distance, lorry.fuel_efficiency_km_per_litre);
  const f_cost = fuelCost(fuel_litres, settings.fuel_price_per_litre);
  // Pass wait time so driver cost accrues during wait but fuel does not
  const costs = totalCostBreakdown(f_cost, total_time - total_wait, total_distance, settings, total_wait);

  const route: GeoPoint[] = [lorryLocation(lorry)];
  for (const leg of legs) {
    route.push(leg.to);
  }

  const worstStatus: DeadlineStatus = planned.some((p) => p.deadline_status === 'LATE')
    ? 'LATE'
    : planned.some((p) => p.deadline_status === 'AT_RISK')
    ? 'AT_RISK'
    : 'ON_TIME';

  const latest_eta = planned.length > 0
    ? planned.reduce((max, p) => (p.eta > max ? p.eta : max), planned[0].eta)
    : null;

  const used_weight = sum(shipments.map((s) => s.weight_kg));
  const used_volume = sum(shipments.map((s) => s.volume_m3));

  return {
    lorry,
    shipments,
    sequence: planned,
    total_distance_km: total_distance,
    total_travel_time_minutes: total_time,
    total_wait_time_minutes: total_wait,
    total_fuel_litres: fuel_litres,
    total_fuel_cost: costs.fuel_cost,
    total_driver_cost: costs.driver_cost,
    total_operating_cost: costs.operating_cost,
    total_toll_cost: costs.toll_cost,
    total_service_cost: costs.service_cost,
    total_cost: costs.total,
    route,
    legs,
    latest_eta,
    worst_deadline_status: worstStatus,
    used_weight_kg: used_weight,
    used_volume_m3: used_volume,
    group_id: shipments.length > 1 ? shipments.map((s) => s.shipment_id).sort().join('+') : shipments[0]?.shipment_id || 'single',
  };
}

// ============ GROUPING ============
// Try to group shipments with the same or nearby destinations.
// A group is feasible only when total weight/volume fit, driver available, and all deadlines met.

function canGroup(s1: Shipment, s2: Shipment): boolean {
  // Group if same destination or destinations are within 30km
  const d1 = shipmentDestination(s1);
  const d2 = shipmentDestination(s2);
  return distanceBetween(d1, d2) <= 30;
}

function generateGroups(shipments: Shipment[]): Shipment[][] {
  // Start with each shipment as its own group
  const groups: Shipment[][] = shipments.map((s) => [s]);

  // Merge groups that can be combined
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        // Check if every shipment in group i can group with every shipment in group j
        const canMerge = groups[i].every((a) =>
          groups[j].every((b) => canGroup(a, b))
        );
        if (canMerge) {
          groups[i] = [...groups[i], ...groups[j]];
          groups.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return groups;
}

// ============ SPLIT SHIPMENT LOGIC (Feature 2) ============

interface SplitAssignment {
  lorry: Lorry;
  portion_weight_kg: number;
  portion_volume_m3: number;
  plan: LorryPlan;
  split_index: number;
  split_total: number;
}

/**
 * Attempt to split an oversized shipment across multiple lorries.
 * Returns null if no valid split is possible.
 */
function trySplitShipment(
  shipment: Shipment,
  availableLorries: Lorry[],
  settings: OptimizationSettings
): SplitAssignment[] | null {
  // Only attempt split if the shipment doesn't fit on ANY single lorry
  const fitsOnOne = availableLorries.some(
    (l) => l.maximum_weight_capacity_kg >= shipment.weight_kg && l.maximum_volume_capacity_m3 >= shipment.volume_m3
  );
  if (fitsOnOne) return null; // No split needed

  // Sort lorries by cost-effectiveness (lower operating cost per capacity unit first)
  const sorted = availableLorries
    .filter((l) => l.status === 'active' && (l.driver_available ?? true))
    .sort((a, b) => {
      const capA = a.maximum_weight_capacity_kg + a.maximum_volume_capacity_m3;
      const capB = b.maximum_weight_capacity_kg + b.maximum_volume_capacity_m3;
      return capB - capA;
    });

  if (sorted.length === 0) return null;

  // Greedy allocation: assign as much as possible to the largest-capacity lorries
  let remainingWeight = shipment.weight_kg;
  let remainingVolume = shipment.volume_m3;
  const assignments: SplitAssignment[] = [];

  for (const lorry of sorted) {
    if (remainingWeight <= 0 && remainingVolume <= 0) break;

    // How much can this lorry carry?
    const weightPortion = Math.min(remainingWeight, lorry.maximum_weight_capacity_kg);
    const volumePortion = Math.min(remainingVolume, lorry.maximum_volume_capacity_m3);

    if (weightPortion <= 0 && volumePortion <= 0) continue;

    // We need to determine which constraint is binding
    // The portion must respect BOTH weight and volume ratios
    const weightRatio = lorry.maximum_weight_capacity_kg / shipment.weight_kg;
    const volumeRatio = lorry.maximum_volume_capacity_m3 / shipment.volume_m3;
    const bindingRatio = Math.min(weightRatio, volumeRatio, 1);

    const actualWeight = Math.min(remainingWeight, bindingRatio * shipment.weight_kg);
    const actualVolume = Math.min(remainingVolume, bindingRatio * shipment.volume_m3);

    if (actualWeight <= 0 && actualVolume <= 0) continue;

    // Check driver hours for this partial shipment
    const partialShipment: Shipment = {
      ...shipment,
      weight_kg: actualWeight,
      volume_m3: actualVolume,
    };
    const plan = buildLorryPlan(lorry, [partialShipment], settings);

    // Check driver hours
    const maxMinutes = (lorry.max_driving_hours_per_day ?? 9) * 60;
    if (plan.total_travel_time_minutes > maxMinutes) continue;

    assignments.push({
      lorry,
      portion_weight_kg: actualWeight,
      portion_volume_m3: actualVolume,
      plan,
      split_index: 0, // Will be set after
      split_total: 0,
    });

    remainingWeight -= actualWeight;
    remainingVolume -= actualVolume;
  }

  // Check if the full shipment is covered
  if (remainingWeight > 0.01 || remainingVolume > 0.01) {
    return null; // Cannot cover the full shipment
  }

  // Set split indices
  const total = assignments.length;
  for (let i = 0; i < total; i++) {
    assignments[i].split_index = i + 1;
    assignments[i].split_total = total;
  }

  return assignments;
}

// ============ GLOBAL OPTIMIZATION ============
//
// Strategy:
// 1. Generate candidate groups from shipments.
// 2. For each group, find the best feasible lorry (lowest cost, all constraints met).
// 3. Use a greedy + improvement approach: sort groups by priority-weighted urgency,
//    assign best lorry, skip if no feasible lorry.
// 4. Compare against single-shipment assignment to ensure grouping is beneficial.
//
// For hackathon-sized datasets (<= ~15 shipments, <= ~8 lorries), this is reliable.

export interface OptimizationInput {
  lorries: Lorry[];
  shipments: Shipment[];
  settings: OptimizationSettings;
  before_summary?: BeforeAfterSummary | null;
}

export function optimize(input: OptimizationInput): OptimizationResult {
  const { lorries, shipments, settings, before_summary } = input;

  if (shipments.length === 0) {
    return emptyResult(before_summary, settings);
  }

  // Active lorries must also not be currently assigned
  const activeLorries = lorries.filter((l) => l.status === 'active' && (l.driver_available ?? true) && l.assignment_status !== 'assigned');

  // Generate candidate groups
  const groups = generateGroups(shipments);

  // A single effective urgency score combines stated priority and time-to-deadline.
  // Deadline pressure is intentionally dominant so a medium-priority shipment due in 2h
  // outranks a high-priority shipment due in several days.
  const effectiveUrgencyScore = (s: Shipment, now = Date.now()): number => {
    const hoursRemaining = Math.max(0.25, (new Date(s.delivery_deadline).getTime() - now) / 3600000);
    const deadlinePressure = 10000 / hoursRemaining;
    const priorityBonus: Record<Priority, number> = { URGENT: 400, HIGH: 300, MEDIUM: 200, LOW: 100 };
    return deadlinePressure + priorityBonus[s.priority];
  };

  const groupPriority = (g: Shipment[]): number =>
    Math.max(...g.map((s) => effectiveUrgencyScore(s)));

  groups.sort((a, b) => groupPriority(b) - groupPriority(a));

  const usedLorries = new Set<string>();
  const assignedShipments = new Set<string>();
  const plans: LorryPlan[] = [];
  const unassigned: UnassignedShipment[] = [];
  const comparisons: Record<string, LorryCandidateComparison[]> = {};

  // For each group, find the best feasible lorry
  for (const group of groups) {
    let bestPlan: LorryPlan | null = null;
    let bestCost = Infinity;
    const groupComparisons: LorryCandidateComparison[] = [];

    for (const lorry of activeLorries) {
      if (usedLorries.has(lorry.lorry_id)) continue;

      // Check capacity constraints first (without route)
      const totalWeight = sum(group.map((s) => s.weight_kg));
      const totalVolume = sum(group.map((s) => s.volume_m3));
      const reasons: string[] = [];

      if (totalWeight > lorry.maximum_weight_capacity_kg) {
        reasons.push(`Weight capacity exceeded by ${formatNumber(totalWeight - lorry.maximum_weight_capacity_kg)} kg.`);
      }
      if (totalVolume > lorry.maximum_volume_capacity_m3) {
        reasons.push(`Volume capacity exceeded by ${formatNumber(totalVolume - lorry.maximum_volume_capacity_m3, 1)} m³.`);
      }

      if (reasons.length > 0) {
        groupComparisons.push({
          lorry_id: lorry.lorry_id,
          feasible: false,
          reasons,
          total_distance_km: 0,
          total_fuel_litres: 0,
          total_cost: 0,
          deadline_ok: false,
          selected: false,
        });
        continue;
      }

      // Build plan and check deadlines
      const plan = buildLorryPlan(lorry, group, settings);
      const deadlineOk = plan.worst_deadline_status !== 'LATE';

      // Feature 4: Check driver working-hour limit
      const maxMinutes = (lorry.max_driving_hours_per_day ?? 9) * 60;
      if (plan.total_travel_time_minutes > maxMinutes) {
        const limitH = lorry.max_driving_hours_per_day ?? 9;
        const routeH = Math.round((plan.total_travel_time_minutes / 60) * 10) / 10;
        groupComparisons.push({
          lorry_id: lorry.lorry_id,
          feasible: false,
          reasons: [`Assignment would exceed driver's max working hours (${limitH}h limit, route requires ${routeH}h).`],
          total_distance_km: plan.total_distance_km,
          total_fuel_litres: plan.total_fuel_litres,
          total_cost: plan.total_cost,
          deadline_ok: deadlineOk,
          selected: false,
        });
        continue;
      }

      if (!deadlineOk) {
        groupComparisons.push({
          lorry_id: lorry.lorry_id,
          feasible: false,
          reasons: ['Delivery deadline cannot be met.'],
          total_distance_km: plan.total_distance_km,
          total_fuel_litres: plan.total_fuel_litres,
          total_cost: plan.total_cost,
          deadline_ok: false,
          selected: false,
        });
        continue;
      }

      groupComparisons.push({
        lorry_id: lorry.lorry_id,
        feasible: true,
        reasons: [],
        total_distance_km: plan.total_distance_km,
        total_fuel_litres: plan.total_fuel_litres,
        total_cost: plan.total_cost,
        deadline_ok: true,
        selected: false,
      });

      // Tie-breaking: lower cost, then lower distance, then better fuel efficiency, then lorry_id
      if (plan.total_cost < bestCost ||
          (plan.total_cost === bestCost && bestPlan && (
            plan.total_distance_km < bestPlan.total_distance_km ||
            (plan.total_distance_km === bestPlan.total_distance_km &&
             (lorry.fuel_efficiency_km_per_litre > bestPlan.lorry.fuel_efficiency_km_per_litre ||
              (lorry.fuel_efficiency_km_per_litre === bestPlan.lorry.fuel_efficiency_km_per_litre &&
               lorry.lorry_id < bestPlan.lorry.lorry_id)))
          ))) {
        bestPlan = plan;
        bestCost = plan.total_cost;
      }
    }

    // Mark selected in comparisons
    if (bestPlan) {
      const comp = groupComparisons.find((c) => c.lorry_id === bestPlan!.lorry.lorry_id);
      if (comp) comp.selected = true;
    }

    // Store comparisons keyed by group's shipment IDs
    const groupKey = group.map((s) => s.shipment_id).sort().join(',');
    comparisons[groupKey] = groupComparisons;

    if (bestPlan) {
      usedLorries.add(bestPlan.lorry.lorry_id);
      for (const s of group) {
        assignedShipments.add(s.shipment_id);
      }
      plans.push(bestPlan);
    } else {
      // Group couldn't be assigned — try individual shipments
      for (const s of group) {
        if (assignedShipments.has(s.shipment_id)) continue;

        let bestSingle: LorryPlan | null = null;
        let bestSingleCost = Infinity;
        const singleComparisons: LorryCandidateComparison[] = [];

        for (const lorry of activeLorries) {
          if (usedLorries.has(lorry.lorry_id)) continue;

          if (s.weight_kg > lorry.maximum_weight_capacity_kg) {
            singleComparisons.push({
              lorry_id: lorry.lorry_id, feasible: false,
              reasons: [`Weight capacity exceeded by ${formatNumber(s.weight_kg - lorry.maximum_weight_capacity_kg)} kg.`],
              total_distance_km: 0, total_fuel_litres: 0, total_cost: 0, deadline_ok: false, selected: false,
            });
            continue;
          }
          if (s.volume_m3 > lorry.maximum_volume_capacity_m3) {
            singleComparisons.push({
              lorry_id: lorry.lorry_id, feasible: false,
              reasons: [`Volume capacity exceeded by ${formatNumber(s.volume_m3 - lorry.maximum_volume_capacity_m3, 1)} m³.`],
              total_distance_km: 0, total_fuel_litres: 0, total_cost: 0, deadline_ok: false, selected: false,
            });
            continue;
          }

          const plan = buildLorryPlan(lorry, [s], settings);
          const deadlineOk = plan.worst_deadline_status !== 'LATE';

          // Feature 4: Driver hours check
          const maxMinutes = (lorry.max_driving_hours_per_day ?? 9) * 60;
          if (plan.total_travel_time_minutes > maxMinutes) {
            const limitH = lorry.max_driving_hours_per_day ?? 9;
            const routeH = Math.round((plan.total_travel_time_minutes / 60) * 10) / 10;
            singleComparisons.push({
              lorry_id: lorry.lorry_id, feasible: false,
              reasons: [`Assignment would exceed driver's max working hours (${limitH}h limit, route requires ${routeH}h).`],
              total_distance_km: plan.total_distance_km, total_fuel_litres: plan.total_fuel_litres,
              total_cost: plan.total_cost, deadline_ok: deadlineOk, selected: false,
            });
            continue;
          }

          if (!deadlineOk) {
            singleComparisons.push({
              lorry_id: lorry.lorry_id, feasible: false,
              reasons: ['Delivery deadline cannot be met.'],
              total_distance_km: plan.total_distance_km, total_fuel_litres: plan.total_fuel_litres,
              total_cost: plan.total_cost, deadline_ok: false, selected: false,
            });
            continue;
          }

          singleComparisons.push({
            lorry_id: lorry.lorry_id, feasible: true, reasons: [],
            total_distance_km: plan.total_distance_km, total_fuel_litres: plan.total_fuel_litres,
            total_cost: plan.total_cost, deadline_ok: true, selected: false,
          });

          if (plan.total_cost < bestSingleCost) {
            bestSingle = plan;
            bestSingleCost = plan.total_cost;
          }
        }

        if (bestSingle) {
          usedLorries.add(bestSingle.lorry.lorry_id);
          assignedShipments.add(s.shipment_id);
          plans.push(bestSingle);
          const singleKey = s.shipment_id;
          comparisons[singleKey] = singleComparisons;
          const comp = singleComparisons.find((c) => c.lorry_id === bestSingle.lorry.lorry_id);
          if (comp) comp.selected = true;
        } else {
          // Feature 2: Try split shipment before giving up
          const availableForSplit = activeLorries.filter((l) => !usedLorries.has(l.lorry_id));
          const splitResult = trySplitShipment(s, availableForSplit, settings);

          if (splitResult && splitResult.length > 0) {
            // Successfully split across multiple lorries
            for (const split of splitResult) {
              const splitPlan: LorryPlan = {
                ...split.plan,
                is_split: true,
                split_shipment_id: s.shipment_id,
                split_index: split.split_index,
                split_total: split.split_total,
                split_portion_weight_kg: split.portion_weight_kg,
                split_portion_volume_m3: split.portion_volume_m3,
                used_weight_kg: split.portion_weight_kg,
                used_volume_m3: split.portion_volume_m3,
                group_id: `${s.shipment_id}-split-${split.split_index}`,
              };
              usedLorries.add(split.lorry.lorry_id);
              plans.push(splitPlan);
            }
            assignedShipments.add(s.shipment_id);
          } else {
            // Truly unassigned — collect rejection reasons from ALL lorries (including non-active)
            const reasons: UnassignedShipment['reasons'] = [];

            // Check if it's an oversized shipment that couldn't be split
            const fitsOnNone = lorries.every(
              (l) => s.weight_kg > l.maximum_weight_capacity_kg || s.volume_m3 > l.maximum_volume_capacity_m3
            );
            if (fitsOnNone && !splitResult) {
              reasons.push({
                lorry_id: '—',
                reason: 'No combination of available lorries has enough combined capacity.',
                details: `Shipment requires ${formatNumber(s.weight_kg)} kg / ${formatNumber(s.volume_m3, 1)} m³. No single lorry or split combination can cover it.`,
              });
            }

            for (const lorry of lorries) {
              const r = checkFeasibility(lorry, [s], null, settings);
              if (!r.feasible) {
                reasons.push({
                  lorry_id: lorry.lorry_id,
                  reason: r.reasons[0] || 'Infeasible',
                  details: r.reasons.join('; '),
                });
              }
            }
            if (reasons.length === 0) {
              reasons.push({ lorry_id: '—', reason: 'No feasible lorry.', details: 'No available lorry can carry this shipment.' });
            }
            unassigned.push({ shipment: s, reasons });
          }
        }
      }
    }
  }

  // Calculate totals
  const total_cost = sum(plans.map((p) => p.total_cost));
  const total_distance_km = sum(plans.map((p) => p.total_distance_km));
  const total_fuel_litres = sum(plans.map((p) => p.total_fuel_litres));
  const allPlanned = plans.flatMap((p) => p.sequence);
  const on_time_count = allPlanned.filter((p) => p.deadline_status === 'ON_TIME').length;
  const late_count = allPlanned.filter((p) => p.deadline_status === 'LATE').length;

  // Feature 5: SLA penalty cost
  const estimated_sla_cost = late_count * (settings.sla_penalty_per_late_shipment ?? 500);

  const after_summary: BeforeAfterSummary = {
    lorry_count: plans.length,
    distance_km: total_distance_km,
    fuel_litres: total_fuel_litres,
    cost: total_cost,
    late_shipments: late_count,
  };

  const savings = before_summary
    ? {
        distance_km: before_summary.distance_km - after_summary.distance_km,
        fuel_litres: before_summary.fuel_litres - after_summary.fuel_litres,
        cost: before_summary.cost - after_summary.cost,
        lorry_count: before_summary.lorry_count - after_summary.lorry_count,
        late_shipments: before_summary.late_shipments - after_summary.late_shipments,
      }
    : null;

  return {
    run_id: null,
    timestamp: new Date(),
    plans,
    unassigned,
    total_cost,
    total_distance_km,
    total_fuel_litres,
    assigned_count: assignedShipments.size,
    unassigned_count: unassigned.length,
    on_time_count,
    late_count,
    estimated_sla_cost,
    comparisons,
    before_summary: before_summary ?? null,
    after_summary,
    savings,
  };
}

// ============ BEFORE (unoptimized) SUMMARY ============
// "Before" = naive assignment: each shipment to nearest feasible lorry, no grouping.

export function computeBeforeSummary(
  lorries: Lorry[],
  shipments: Shipment[],
  settings: OptimizationSettings
): BeforeAfterSummary {
  const activeLorries = lorries.filter((l) => l.status === 'active' && (l.driver_available ?? true));
  const usedLorries = new Set<string>();
  let totalDistance = 0;
  let totalFuel = 0;
  let totalCost = 0;
  let lateCount = 0;
  let lorryCount = 0;

  for (const s of shipments) {
    let bestLorry: Lorry | null = null;
    let bestDist = Infinity;

    for (const lorry of activeLorries) {
      if (usedLorries.has(lorry.lorry_id)) continue;
      if (s.weight_kg > lorry.maximum_weight_capacity_kg) continue;
      if (s.volume_m3 > lorry.maximum_volume_capacity_m3) continue;

      const pickup = shipmentPickup(s);
      const lorryLoc = lorryLocation(lorry);
      const d = distanceBetween(lorryLoc, pickup);
      if (d < bestDist) {
        bestDist = d;
        bestLorry = lorry;
      }
    }

    if (bestLorry) {
      usedLorries.add(bestLorry.lorry_id);
      lorryCount++;
      const plan = buildLorryPlan(bestLorry, [s], settings);
      totalDistance += plan.total_distance_km;
      totalFuel += plan.total_fuel_litres;
      totalCost += plan.total_cost;
      if (plan.worst_deadline_status === 'LATE') lateCount++;
    }
  }

  return {
    lorry_count: lorryCount,
    distance_km: totalDistance,
    fuel_litres: totalFuel,
    cost: totalCost,
    late_shipments: lateCount,
  };
}

// ============ HELPERS ============

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function formatNumber(n: number, decimals = 0): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function emptyResult(before_summary: BeforeAfterSummary | null | undefined, settings?: OptimizationSettings): OptimizationResult {
  void settings;
  return {
    run_id: null,
    timestamp: new Date(),
    plans: [],
    unassigned: [],
    total_cost: 0,
    total_distance_km: 0,
    total_fuel_litres: 0,
    assigned_count: 0,
    unassigned_count: 0,
    on_time_count: 0,
    late_count: 0,
    estimated_sla_cost: 0,
    comparisons: {},
    before_summary: before_summary ?? null,
    after_summary: { lorry_count: 0, distance_km: 0, fuel_litres: 0, cost: 0, late_shipments: 0 },
    savings: before_summary
      ? { distance_km: before_summary.distance_km, fuel_litres: before_summary.fuel_litres, cost: before_summary.cost, lorry_count: before_summary.lorry_count, late_shipments: before_summary.late_shipments }
      : null,
  };
}

// ============ PRIORITY HELPER ============

export function priorityRank(p: Priority): number {
  return PRIORITY_WEIGHT[p];
}

export function effectiveUrgencyScore(shipment: Shipment, now = Date.now()): number {
  const hoursRemaining = Math.max(0.25, (new Date(shipment.delivery_deadline).getTime() - now) / 3600000);
  const deadlinePressure = 10000 / hoursRemaining;
  const priorityBonus: Record<Priority, number> = { URGENT: 400, HIGH: 300, MEDIUM: 200, LOW: 100 };
  return deadlinePressure + priorityBonus[shipment.priority];
}
