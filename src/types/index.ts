export type Priority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type LorryStatus = 'active' | 'inactive' | 'maintenance';
export type LorryAssignmentStatus = 'available' | 'assigned';
export type ShipmentStatus = 'pending' | 'active' | 'delivered' | 'unassigned';
export type DeadlineStatus = 'ON_TIME' | 'LATE' | 'AT_RISK';

export interface Lorry {
  id: string;
  lorry_id: string;
  maximum_weight_capacity_kg: number;
  maximum_volume_capacity_m3: number;
  current_location_name: string;
  current_latitude: number;
  current_longitude: number;
  fuel_efficiency_km_per_litre: number;
  driver_available: boolean;
  driver_name: string | null;
  driver_phone?: string | null;
  status: LorryStatus;
  assignment_status?: LorryAssignmentStatus;
  current_shipment_id?: string | null;
  max_driving_hours_per_day: number;
  // GPS tracking & Breakdown fields
  last_location_update?: string | null;
  speed_kmh?: number | null;
  heading_deg?: number | null;
  is_breakdown?: boolean;
  breakdown_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  created_at: string;
  entity_type: 'lorry' | 'shipment' | 'optimization';
  entity_id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor: string;
  details: string | null;
}

export interface Shipment {
  id: string;
  shipment_id: string;
  weight_kg: number;
  volume_m3: number;
  pickup_location_name: string;
  pickup_latitude: number;
  pickup_longitude: number;
  destination_name: string;
  destination_latitude: number;
  destination_longitude: number;
  delivery_deadline: string;
  earliest_delivery_time: string | null;
  priority: Priority;
  status: ShipmentStatus;
  shipment_status: ShipmentStatus;
  assigned_lorry_id: string | null;
  assigned_driver_name: string | null;
  created_at: string;
  updated_at: string;
}


export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
}

export interface OptimizationSettings {
  id: number;
  average_speed_kmh: number;
  loading_time_minutes: number;
  unloading_time_minutes: number;
  service_time_minutes: number;
  fuel_price_per_litre: number;
  driver_cost_per_hour: number;
  operating_cost_per_km: number;
  toll_cost_per_km: number;
  service_cost: number;
  sla_penalty_per_late_shipment: number;
  updated_at: string;
}

export interface OptimizationRun {
  id: string;
  created_at: string;
  total_cost: number;
  total_distance_km: number;
  total_fuel_litres: number;
  assigned_shipments: number;
  unassigned_shipments: number;
  status: string;
  input_summary: Record<string, unknown> | null;
  before_summary: Record<string, unknown> | null;
}

export interface Assignment {
  id: string;
  optimization_run_id: string;
  lorry_id: string;
  shipment_id: string;
  delivery_sequence: number;
  distance_km: number;
  travel_time_minutes: number;
  fuel_litres: number;
  fuel_cost: number;
  total_cost: number;
  eta: string;
  deadline: string;
  deadline_status: DeadlineStatus;
  group_id: string | null;
  route_summary: Record<string, unknown> | null;
  driver_name: string | null;
  split_index: number | null;
  split_total: number | null;
  parent_shipment_id?: string | null;
  split_weight_kg?: number | null;
  split_volume_m3?: number | null;
  split_portion_weight_kg: number | null;
  split_portion_volume_m3: number | null;
}

export interface RejectionReason {
  id: string;
  optimization_run_id: string;
  shipment_id: string;
  lorry_id: string;
  reason: string;
  details: string;
}

/** @deprecated Use AuditLogRow instead (points to the new audit_log table with full schema) */
export interface AuditLogEntry {
  id: string;
  created_at: string;
  event_type: string;
  message: string;
  details: Record<string, unknown> | null;
}

// ---- Optimization engine types ----

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface FeasibilityResult {
  feasible: boolean;
  reasons: string[];
}

export interface RouteStop {
  shipment_id: string;
  location: GeoPoint;
  is_pickup: boolean;
}

export interface RouteLeg {
  from: GeoPoint;
  to: GeoPoint;
  distance_km: number;
  travel_time_minutes: number;
}

export interface PlannedShipment {
  shipment: Shipment;
  sequence: number;
  cumulative_distance_km: number;
  cumulative_time_minutes: number;
  wait_time_minutes: number;
  eta: Date;
  deadline: Date;
  deadline_status: DeadlineStatus;
  earliest_delivery_time: Date | null;
}

export interface LorryPlan {
  lorry: Lorry;
  shipments: Shipment[];
  sequence: PlannedShipment[];
  total_distance_km: number;
  total_travel_time_minutes: number;
  total_wait_time_minutes: number;
  total_fuel_litres: number;
  total_fuel_cost: number;
  total_driver_cost: number;
  total_operating_cost: number;
  total_toll_cost: number;
  total_service_cost: number;
  total_cost: number;
  route: GeoPoint[];
  legs: RouteLeg[];
  latest_eta: Date | null;
  worst_deadline_status: DeadlineStatus;
  used_weight_kg: number;
  used_volume_m3: number;
  group_id: string;
  is_split?: boolean;
  split_shipment_id?: string;
  parent_shipment_id?: string | null;
  split_index?: number;
  split_total?: number;
  split_weight_kg?: number;
  split_volume_m3?: number;
  split_portion_weight_kg?: number;
  split_portion_volume_m3?: number;
}

export interface LorryCandidateComparison {
  lorry_id: string;
  feasible: boolean;
  reasons: string[];
  total_distance_km: number;
  total_fuel_litres: number;
  total_cost: number;
  deadline_ok: boolean;
  selected: boolean;
}

export interface OptimizationResult {
  run_id: string | null;
  timestamp: Date;
  plans: LorryPlan[];
  unassigned: UnassignedShipment[];
  total_cost: number;
  total_distance_km: number;
  total_fuel_litres: number;
  assigned_count: number;
  unassigned_count: number;
  on_time_count: number;
  late_count: number;
  estimated_sla_cost: number;
  comparisons: Record<string, LorryCandidateComparison[]>;
  before_summary: BeforeAfterSummary | null;
  after_summary: BeforeAfterSummary;
  savings: SavingsSummary | null;
}

export interface UnassignedShipment {
  shipment: Shipment;
  reasons: { lorry_id: string; reason: string; details: string }[];
}

export interface BeforeAfterSummary {
  lorry_count: number;
  distance_km: number;
  fuel_litres: number;
  cost: number;
  late_shipments: number;
}

export interface SavingsSummary {
  distance_km: number;
  fuel_litres: number;
  cost: number;
  lorry_count: number;
  late_shipments: number;
}

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  URGENT: 1000,
  HIGH: 100,
  MEDIUM: 10,
  LOW: 1,
};
