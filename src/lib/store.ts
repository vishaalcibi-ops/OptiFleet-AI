import { create } from 'zustand';
import type {
  Lorry,
  Shipment,
  Location,
  OptimizationSettings,
  OptimizationResult,
  OptimizationRun,
  Assignment,
  RejectionReason,
  AuditLogRow,
} from '@/types';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { optimize, computeBeforeSummary } from '@/lib/optimizer';
import { lsGet, lsSet } from '@/lib/localStorage';

// ─── Default seed data (used when Supabase is unreachable and localStorage is empty) ───

const DEFAULT_LOCATIONS: Location[] = [
  { id: 'loc1', name: 'Kangeyam', latitude: 11.0, longitude: 77.56, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'loc2', name: 'Tiruppur', latitude: 11.11, longitude: 77.23, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'loc3', name: 'Coimbatore', latitude: 11.0, longitude: 76.96, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'loc4', name: 'Erode', latitude: 11.34, longitude: 77.73, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'loc5', name: 'Salem', latitude: 11.66, longitude: 78.14, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const DEFAULT_SETTINGS: OptimizationSettings = {
  id: 1, average_speed_kmh: 50, loading_time_minutes: 30, unloading_time_minutes: 30,
  service_time_minutes: 10, fuel_price_per_litre: 95, driver_cost_per_hour: 120,
  operating_cost_per_km: 5, toll_cost_per_km: 2, service_cost: 500,
  sla_penalty_per_late_shipment: 2000, updated_at: new Date().toISOString(),
};

const _makeDlHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

const DEFAULT_LORRIES: Lorry[] = [
  { id: 'l1', lorry_id: 'L01', maximum_weight_capacity_kg: 5000, maximum_volume_capacity_m3: 30, current_location_name: 'Kangeyam', current_latitude: 11.0, current_longitude: 77.56, fuel_efficiency_km_per_litre: 4.0, driver_available: true, driver_name: 'Arun Kumar', driver_phone: '+919876543210', status: 'active', assignment_status: 'available', current_shipment_id: null, max_driving_hours_per_day: 9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'l2', lorry_id: 'L02', maximum_weight_capacity_kg: 10000, maximum_volume_capacity_m3: 40, current_location_name: 'Tiruppur', current_latitude: 11.11, current_longitude: 77.23, fuel_efficiency_km_per_litre: 6.0, driver_available: true, driver_name: 'Suresh Raj', driver_phone: '+919876543211', status: 'active', assignment_status: 'available', current_shipment_id: null, max_driving_hours_per_day: 10, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'l3', lorry_id: 'L03', maximum_weight_capacity_kg: 10000, maximum_volume_capacity_m3: 40, current_location_name: 'Coimbatore', current_latitude: 11.0, current_longitude: 76.96, fuel_efficiency_km_per_litre: 8.0, driver_available: true, driver_name: 'Karthik M', driver_phone: '+919876543212', status: 'active', assignment_status: 'available', current_shipment_id: null, max_driving_hours_per_day: 9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'l4', lorry_id: 'L04', maximum_weight_capacity_kg: 8000, maximum_volume_capacity_m3: 35, current_location_name: 'Erode', current_latitude: 11.34, current_longitude: 77.73, fuel_efficiency_km_per_litre: 5.0, driver_available: true, driver_name: 'Prakash V', driver_phone: '+919876543213', status: 'active', assignment_status: 'available', current_shipment_id: null, max_driving_hours_per_day: 8, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'l5', lorry_id: 'L05', maximum_weight_capacity_kg: 12000, maximum_volume_capacity_m3: 50, current_location_name: 'Salem', current_latitude: 11.66, current_longitude: 78.14, fuel_efficiency_km_per_litre: 7.0, driver_available: true, driver_name: 'Deepak S', driver_phone: '+919876543214', status: 'active', assignment_status: 'available', current_shipment_id: null, max_driving_hours_per_day: 9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const DEFAULT_SHIPMENTS: Shipment[] = [
  { id: 's1', shipment_id: 'S001', weight_kg: 2000, volume_m3: 8, pickup_location_name: 'Kangeyam', pickup_latitude: 11.0, pickup_longitude: 77.56, destination_name: 'Tiruppur', destination_latitude: 11.11, destination_longitude: 77.23, delivery_deadline: _makeDlHours(2), earliest_delivery_time: _makeDlHours(1), priority: 'URGENT', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's2', shipment_id: 'S002', weight_kg: 1500, volume_m3: 6, pickup_location_name: 'Tiruppur', pickup_latitude: 11.11, pickup_longitude: 77.23, destination_name: 'Coimbatore', destination_latitude: 11.0, destination_longitude: 76.96, delivery_deadline: _makeDlHours(3), earliest_delivery_time: null, priority: 'URGENT', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's3', shipment_id: 'S003', weight_kg: 3000, volume_m3: 12, pickup_location_name: 'Kangeyam', pickup_latitude: 11.0, pickup_longitude: 77.56, destination_name: 'Coimbatore', destination_latitude: 11.0, destination_longitude: 76.96, delivery_deadline: _makeDlHours(10), earliest_delivery_time: null, priority: 'HIGH', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's4', shipment_id: 'S004', weight_kg: 2500, volume_m3: 10, pickup_location_name: 'Tiruppur', pickup_latitude: 11.11, pickup_longitude: 77.23, destination_name: 'Coimbatore', destination_latitude: 11.0, destination_longitude: 76.96, delivery_deadline: _makeDlHours(12), earliest_delivery_time: _makeDlHours(8), priority: 'MEDIUM', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's5', shipment_id: 'S005', weight_kg: 18000, volume_m3: 65, pickup_location_name: 'Coimbatore', pickup_latitude: 11.0, pickup_longitude: 76.96, destination_name: 'Salem', destination_latitude: 11.66, destination_longitude: 78.14, delivery_deadline: _makeDlHours(24), earliest_delivery_time: null, priority: 'HIGH', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's6', shipment_id: 'S006', weight_kg: 4000, volume_m3: 15, pickup_location_name: 'Erode', pickup_latitude: 11.34, pickup_longitude: 77.73, destination_name: 'Salem', destination_latitude: 11.66, destination_longitude: 78.14, delivery_deadline: _makeDlHours(8), earliest_delivery_time: _makeDlHours(5), priority: 'MEDIUM', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's7', shipment_id: 'S007', weight_kg: 7000, volume_m3: 20, pickup_location_name: 'Kangeyam', pickup_latitude: 11.0, pickup_longitude: 77.56, destination_name: 'Erode', destination_latitude: 11.34, destination_longitude: 77.73, delivery_deadline: _makeDlHours(9), earliest_delivery_time: null, priority: 'HIGH', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's8', shipment_id: 'S008', weight_kg: 1000, volume_m3: 4, pickup_location_name: 'Salem', pickup_latitude: 11.66, pickup_longitude: 78.14, destination_name: 'Erode', destination_latitude: 11.34, destination_longitude: 77.73, delivery_deadline: _makeDlHours(96), earliest_delivery_time: null, priority: 'LOW', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's9', shipment_id: 'S009', weight_kg: 3500, volume_m3: 14, pickup_location_name: 'Coimbatore', pickup_latitude: 11.0, pickup_longitude: 76.96, destination_name: 'Kangeyam', destination_latitude: 11.0, destination_longitude: 77.56, delivery_deadline: _makeDlHours(6), earliest_delivery_time: _makeDlHours(3), priority: 'HIGH', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's10', shipment_id: 'S010', weight_kg: 500, volume_m3: 2, pickup_location_name: 'Tiruppur', pickup_latitude: 11.11, pickup_longitude: 77.23, destination_name: 'Erode', destination_latitude: 11.34, destination_longitude: 77.73, delivery_deadline: _makeDlHours(5), earliest_delivery_time: null, priority: 'URGENT', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

// Persist key state slices to localStorage after every write
const persist = (state: {
  lorries: Lorry[]; shipments: Shipment[]; settings: OptimizationSettings | null;
  runs: OptimizationRun[]; assignments: Assignment[]; rejections: RejectionReason[];
}) => {
  lsSet('lorries', state.lorries);
  lsSet('shipments', state.shipments);
  if (state.settings) lsSet('settings', state.settings);
  lsSet('runs', state.runs);
  lsSet('assignments', state.assignments);
  lsSet('rejections', state.rejections);
};

interface AppState {
  lorries: Lorry[];
  shipments: Shipment[];
  locations: Location[];
  settings: OptimizationSettings | null;
  currentResult: OptimizationResult | null;
  runs: OptimizationRun[];
  assignments: Assignment[];
  rejections: RejectionReason[];
  auditLog: AuditLogRow[];
  loading: boolean;
  error: string | null;
  optimizing: boolean;
  progressMessage: string;

  fetchData: () => Promise<void>;
  addLorry: (l: Partial<Lorry>) => Promise<void>;
  updateLorry: (id: string, updates: Partial<Lorry>) => Promise<void>;
  updateLorryWithMaintenanceCheck: (id: string, updates: Partial<Lorry>) => Promise<{ affectedShipmentCount: number }>;
  updateLorryGPS: (lorryId: string, lat: number, lng: number, speed?: number | null, heading?: number | null) => Promise<void>;
  subscribeToLorries: () => () => void;
  deleteLorry: (id: string) => Promise<void>;
  addShipment: (s: Partial<Shipment>) => Promise<void>;
  updateShipment: (id: string, updates: Partial<Shipment>) => Promise<void>;
  deleteShipment: (id: string) => Promise<void>;
  markShipmentDelivered: (id: string) => Promise<void>;
  unassignShipment: (id: string) => Promise<void>;
  applyScenarioResult: (result: OptimizationResult) => Promise<void>;
  addLocation: (l: Pick<Location, 'name' | 'latitude' | 'longitude'>) => Promise<Location | null>;
  updateSettings: (s: Partial<OptimizationSettings>) => Promise<void>;
  runOptimization: (opts?: { beforeSummary?: boolean; saveToDb?: boolean }) => Promise<OptimizationResult>;
  loadRunHistory: () => Promise<void>;
  loadRunDetails: (runId: string) => Promise<{ assignments: Assignment[]; rejections: RejectionReason[]; run: OptimizationRun }>;
  loadAuditLog: () => Promise<void>;
  setError: (e: string | null) => void;
  resetData: () => void;
}

const ALL_TAMIL_NADU_DISTRICTS = [
  { name: 'Ariyalur', latitude: 11.1401, longitude: 79.0786 },
  { name: 'Chengalpattu', latitude: 12.6841, longitude: 79.9836 },
  { name: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
  { name: 'Coimbatore', latitude: 11.0168, longitude: 76.9558 },
  { name: 'Cuddalore', latitude: 11.748, longitude: 79.7714 },
  { name: 'Dharmapuri', latitude: 12.1211, longitude: 78.1582 },
  { name: 'Dindigul', latitude: 10.3673, longitude: 77.9803 },
  { name: 'Erode', latitude: 11.341, longitude: 77.7172 },
  { name: 'Hosur', latitude: 12.7409, longitude: 77.8253 },
  { name: 'Kallakurichi', latitude: 11.7384, longitude: 78.9639 },
  { name: 'Kanchipuram', latitude: 12.8342, longitude: 79.7036 },
  { name: 'Kangeyam', latitude: 11.0055, longitude: 77.5614 },
  { name: 'Kanyakumari', latitude: 8.1833, longitude: 77.4119 },
  { name: 'Karur', latitude: 10.9601, longitude: 78.0766 },
  { name: 'Krishnagiri', latitude: 12.5186, longitude: 78.2138 },
  { name: 'Madurai', latitude: 9.9252, longitude: 78.1198 },
  { name: 'Mayiladuthurai', latitude: 11.1075, longitude: 79.6524 },
  { name: 'Nagapattinam', latitude: 10.7672, longitude: 79.8449 },
  { name: 'Namakkal', latitude: 11.2189, longitude: 78.1674 },
  { name: 'Nilgiris', latitude: 11.4102, longitude: 76.695 },
  { name: 'Perambalur', latitude: 11.2342, longitude: 78.882 },
  { name: 'Pudukkottai', latitude: 10.3797, longitude: 78.8208 },
  { name: 'Ramanathapuram', latitude: 9.3639, longitude: 78.8395 },
  { name: 'Ranipet', latitude: 12.9272, longitude: 79.3333 },
  { name: 'Salem', latitude: 11.6643, longitude: 78.146 },
  { name: 'Sivaganga', latitude: 9.8433, longitude: 78.4809 },
  { name: 'Tenkasi', latitude: 8.9594, longitude: 77.316 },
  { name: 'Thanjavur', latitude: 10.787, longitude: 79.1378 },
  { name: 'Theni', latitude: 10.0104, longitude: 77.4768 },
  { name: 'Thoothukudi', latitude: 8.7642, longitude: 78.1348 },
  { name: 'Tiruchirappalli', latitude: 10.7905, longitude: 78.7047 },
  { name: 'Tirunelveli', latitude: 8.7139, longitude: 77.7567 },
  { name: 'Tirupathur', latitude: 12.4964, longitude: 78.5739 },
  { name: 'Tiruppur', latitude: 11.1085, longitude: 77.3411 },
  { name: 'Tiruvallur', latitude: 13.1437, longitude: 79.9079 },
  { name: 'Tiruvannamalai', latitude: 12.2253, longitude: 79.0747 },
  { name: 'Tiruvarur', latitude: 10.7725, longitude: 79.6365 },
  { name: 'Vellore', latitude: 12.9165, longitude: 79.1325 },
  { name: 'Viluppuram', latitude: 11.9401, longitude: 79.4861 },
  { name: 'Virudhunagar', latitude: 9.568, longitude: 77.9624 },
];

const normaliseShipment = (row: Shipment): Shipment => ({
  ...row,
  shipment_status: row.shipment_status ?? ((row.status as string) === 'assigned' ? 'active' : row.status ?? 'pending'),
  assigned_lorry_id: row.assigned_lorry_id ?? null,
  assigned_driver_name: row.assigned_driver_name ?? null,
  earliest_delivery_time: row.earliest_delivery_time ?? null,
  delivery_deadline: row.delivery_deadline || new Date(Date.now() + 8 * 3600000).toISOString(),
  pickup_location_name: row.pickup_location_name || 'Unknown',
  destination_name: row.destination_name || 'Unknown',
  pickup_latitude: row.pickup_latitude ?? 0,
  pickup_longitude: row.pickup_longitude ?? 0,
  destination_latitude: row.destination_latitude ?? 0,
  destination_longitude: row.destination_longitude ?? 0,
});

const normaliseLorry = (l: Lorry, activeShipments: Shipment[]): Lorry => {
  const isAssigned = activeShipments.some(
    (s) => s.assigned_lorry_id === l.lorry_id && (s.shipment_status ?? s.status) === 'active'
  );
  return {
    ...l,
    assignment_status: isAssigned ? 'assigned' : (l.assignment_status ?? 'available'),
    driver_available: l.status === 'active',
  };
};

const fallbackLocations = (lorries: Lorry[], shipments: Shipment[]): Location[] => {
  const map = new Map<string, Location>();
  const add = (name: string, latitude: number, longitude: number) => {
    const key = name.trim().toLowerCase();
    if (!key || map.has(key)) return;
    map.set(key, {
      id: `fallback-${key.replace(/[^a-z0-9]+/g, '-')}`,
      name,
      latitude,
      longitude,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };
  ALL_TAMIL_NADU_DISTRICTS.forEach((d) => add(d.name, d.latitude, d.longitude));
  lorries.forEach((l) => add(l.current_location_name, l.current_latitude, l.current_longitude));
  shipments.forEach((s) => {
    add(s.pickup_location_name, s.pickup_latitude, s.pickup_longitude);
    add(s.destination_name, s.destination_latitude, s.destination_longitude);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

// ─── Fire-and-forget audit logger ─────────────────────────────────────────────
// Inserts a row into the `audit_log` table. Never throws or blocks the caller.
async function logAudit(
  action: string,
  details?: string | null,
  lorry_id?: string | null,
  shipment_id?: string | null,
): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    await supabase.from('audit_log').insert({
      action: action || 'UNKNOWN_ACTION',
      details: details ?? null,
      lorry_id: lorry_id ?? null,
      shipment_id: shipment_id ?? null,
    });
  } catch {
    console.warn('[logAudit] Failed to write audit log entry (non-fatal)');
  }
}

// ─── GPS update throttle tracking (module-level, per lorry_id) ────────────────
const _lastGpsWrite: Record<string, number> = {};
const GPS_THROTTLE_MS = 5000; // max 1 Supabase write per 5 seconds per lorry

export const useStore = create<AppState>((set, get) => ({
  lorries: [],
  shipments: [],
  locations: [],
  settings: null,
  currentResult: null,
  runs: [],
  assignments: [],
  rejections: [],
  auditLog: [],
  loading: false,
  error: null,
  optimizing: false,
  progressMessage: '',

  // ─── Internal fire-and-forget audit helper ───
  // Called from actions; never blocks the main operation and never throws.

  // ─── Public actions ───

  fetchData: async () => {
    set({ loading: true, error: null });

    if (!supabaseConfigured) {
      const rawShipments = DEFAULT_SHIPMENTS.map(normaliseShipment);
      const rawLorries = DEFAULT_LORRIES.map((l) => normaliseLorry(l, rawShipments));
      set({
        lorries: rawLorries,
        shipments: rawShipments,
        locations: DEFAULT_LOCATIONS,
        settings: DEFAULT_SETTINGS,
        loading: false,
      });
      return;
    }

    try {
      const [lorriesRes, shipmentsRes, settingsRes, locationsRes, assignmentsRes] = await Promise.all([
        supabase.from('lorries').select('*').order('lorry_id'),
        supabase.from('shipments').select('*').order('shipment_id'),
        supabase.from('optimization_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('locations').select('*').order('name'),
        supabase.from('assignments').select('*').order('id', { ascending: false }).limit(500),
      ]);

      if (lorriesRes.error) throw lorriesRes.error;
      if (shipmentsRes.error) throw shipmentsRes.error;
      if (settingsRes.error) throw settingsRes.error;

      let rawShipments = ((shipmentsRes.data || []) as Shipment[]).map(normaliseShipment);
      let rawLorries = ((lorriesRes.data || []) as Lorry[]).map((l) => normaliseLorry(l, rawShipments));

      // If DB has 0 rows, auto-fallback to default demo fleet & shipments
      if (rawLorries.length === 0) {
        rawLorries = DEFAULT_LORRIES;
      }
      if (rawShipments.length === 0) {
        rawShipments = DEFAULT_SHIPMENTS.map(normaliseShipment);
      }

      // Deduplicate lorries by lorry_id to prevent UI duplicates
      const lorryMap = new Map<string, Lorry>();
      rawLorries.forEach((l) => { if (!lorryMap.has(l.lorry_id)) lorryMap.set(l.lorry_id, l); });
      rawLorries = Array.from(lorryMap.values());

      const assignments = (assignmentsRes.error ? [] : (assignmentsRes.data || [])) as Assignment[];
      const dbLocations = (locationsRes.error ? [] : (locationsRes.data || [])) as Location[];
      const locations = dbLocations.length > 0 ? dbLocations : fallbackLocations(rawLorries, rawShipments);
      const settings = (settingsRes.data as OptimizationSettings) ?? DEFAULT_SETTINGS;

      const newState = { lorries: rawLorries, shipments: rawShipments, locations, assignments, settings, loading: false };
      set(newState);
      persist({ ...newState, runs: get().runs, rejections: get().rejections });
    } catch {
      // Supabase unreachable — load from localStorage or seed defaults
      const rawShipments = (lsGet<Shipment[]>('shipments') ?? DEFAULT_SHIPMENTS).map(normaliseShipment);
      const rawLorries = (lsGet<Lorry[]>('lorries') ?? DEFAULT_LORRIES).map((l) => normaliseLorry(l, rawShipments));
      const settings = lsGet<OptimizationSettings>('settings') ?? DEFAULT_SETTINGS;
      const runs = lsGet<OptimizationRun[]>('runs') ?? [];
      const assignments = lsGet<Assignment[]>('assignments') ?? [];
      const rejections = lsGet<RejectionReason[]>('rejections') ?? [];
      const locations = fallbackLocations(rawLorries, rawShipments);
      set({ lorries: rawLorries, shipments: rawShipments, settings, locations, runs, assignments, rejections, loading: false, error: null });
    }
  },

  addLorry: async (l) => {
    set({ error: null });
    const newLorry: Lorry = {
      id: l.id || `local-${Date.now()}`,
      lorry_id: l.lorry_id!,
      maximum_weight_capacity_kg: l.maximum_weight_capacity_kg!,
      maximum_volume_capacity_m3: l.maximum_volume_capacity_m3!,
      current_location_name: l.current_location_name!,
      current_latitude: l.current_latitude!,
      current_longitude: l.current_longitude!,
      fuel_efficiency_km_per_litre: l.fuel_efficiency_km_per_litre!,
      driver_available: l.driver_available ?? true,
      driver_name: l.driver_name ?? null,
      driver_phone: l.driver_phone ?? null,
      status: l.status ?? 'active',
      assignment_status: l.assignment_status ?? 'available',
      current_shipment_id: l.current_shipment_id ?? null,
      max_driving_hours_per_day: l.max_driving_hours_per_day ?? 9,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic local update — always runs, even if Supabase is offline
    set((state) => {
      const lorries = [...state.lorries, newLorry].sort((a, b) => a.lorry_id.localeCompare(b.lorry_id));
      const locations = fallbackLocations(lorries, state.shipments);
      persist({ lorries, shipments: state.shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
      return { lorries, locations };
    });

    // Try Supabase in background
    try {
      const { data, error } = await supabase.from('lorries').insert({
        lorry_id: newLorry.lorry_id, maximum_weight_capacity_kg: newLorry.maximum_weight_capacity_kg,
        maximum_volume_capacity_m3: newLorry.maximum_volume_capacity_m3, current_location_name: newLorry.current_location_name,
        current_latitude: newLorry.current_latitude, current_longitude: newLorry.current_longitude,
        fuel_efficiency_km_per_litre: newLorry.fuel_efficiency_km_per_litre, driver_available: newLorry.driver_available,
        driver_name: newLorry.driver_name, driver_phone: newLorry.driver_phone, status: newLorry.status, assignment_status: newLorry.assignment_status,
        current_shipment_id: newLorry.current_shipment_id, max_driving_hours_per_day: newLorry.max_driving_hours_per_day,
      }).select().single();
      if (!error && data) {
        set((state) => {
          const lorries = state.lorries.map((lor) => lor.id === newLorry.id ? { ...lor, id: (data as Lorry).id } : lor);
          lsSet('lorries', lorries);
          return { lorries };
        });
      }
    } catch {
      // Already persisted locally above
    }
  },

  updateLorry: async (id, updates) => {
    set({ error: null });
    const now = new Date().toISOString();

    // Capture old state for audit
    const oldLorry = get().lorries.find((l) => l.id === id);
    const oldStatus = oldLorry?.status;
    const oldAssignmentStatus = oldLorry?.assignment_status;
    const oldShipmentId = oldLorry?.current_shipment_id;

    // Breakdown cascade: if going to maintenance/inactive while assigned, free the shipment first
    const isBreakdown = (updates.status === 'maintenance' || updates.status === 'inactive')
      && oldAssignmentStatus === 'assigned'
      && !!oldShipmentId;

    if (isBreakdown && oldLorry) {
      // 1. Find and unassign the active shipment
      const activeShipment = get().shipments.find(
        (s) => s.assigned_lorry_id === oldLorry.lorry_id && (s.shipment_status ?? s.status) === 'active'
      );
      if (activeShipment) {
        // Apply shipment unassignment locally
        set((state) => ({
          shipments: state.shipments.map((s) =>
            s.id === activeShipment.id
              ? { ...s, shipment_status: 'unassigned' as const, status: 'unassigned' as const, assigned_lorry_id: null, assigned_driver_name: null, updated_at: now }
              : s
          ),
        }));
        // Persist to Supabase (DB trigger handles via session var; explicit update ensures anon client path works too)
        try {
          await supabase.from('shipments').update({
            shipment_status: 'unassigned', status: 'unassigned',
            assigned_lorry_id: null, assigned_driver_name: null, updated_at: now,
          }).eq('id', activeShipment.id);
        } catch {
          // Local already applied
        }
      }

      // 2. Update lorry with cleared assignment state
      const lorryUpdates = {
        ...updates,
        assignment_status: 'available' as const,
        current_shipment_id: null,
        driver_available: false,
        updated_at: now,
      };
      set((state) => {
        const lorries = state.lorries.map((l) => l.id === id ? { ...l, ...lorryUpdates } : l);
        persist({ lorries, shipments: state.shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
        return { lorries };
      });
      try {
        await supabase.from('lorries').update(lorryUpdates).eq('id', id);
      } catch {
        // Local already applied
      }

      // 3. Audit log
      void logAudit(
        'breakdown_reassign',
        `Lorry set to ${updates.status}; shipment ${oldShipmentId ?? ''} requeued for next optimization run`,
        oldLorry.lorry_id,
        oldShipmentId
      );
    } else {
      // Normal update path
      set((state) => {
        const lorries = state.lorries.map((l) => l.id === id ? { ...l, ...updates, updated_at: now } : l);
        persist({ lorries, shipments: state.shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
        return { lorries };
      });
      try {
        const { error } = await supabase.from('lorries').update({ ...updates, updated_at: now }).eq('id', id);
        if (error) console.warn('Supabase lorry update failed (local already applied):', error.message);
      } catch {
        // Already applied locally
      }

      // Audit: log status changes
      if (updates.status && oldStatus !== updates.status && oldLorry) {
        void logAudit(
          'status_change',
          `Status changed from ${oldStatus} to ${updates.status}`,
          oldLorry.lorry_id,
          null
        );
      }
    }
  },

  // Feature 1: Check for active shipments before status change to maintenance/inactive
  updateLorryWithMaintenanceCheck: async (id, updates) => {
    set({ error: null });
    const lorry = get().lorries.find((l) => l.id === id);
    if (!lorry) return { affectedShipmentCount: 0 };

    const activeShipments = get().shipments.filter(
      (s) => s.assigned_lorry_id === lorry.lorry_id && (s.shipment_status ?? s.status) === 'active'
    );

    // Apply locally first (always works, even offline)
    if (updates.status === 'maintenance' || updates.status === 'inactive') {
      set((state) => {
        const lorries = state.lorries.map((l) =>
          l.id === id ? { ...l, ...updates, assignment_status: 'available' as const, current_shipment_id: null, driver_available: false, updated_at: new Date().toISOString() } : l
        );
        const shipments = state.shipments.map((s) =>
          s.assigned_lorry_id === lorry.lorry_id && s.shipment_status === 'active'
            ? { ...s, shipment_status: 'unassigned' as const, status: 'unassigned' as const, assigned_lorry_id: null, assigned_driver_name: null, updated_at: new Date().toISOString() }
            : s
        );
        persist({ lorries, shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
        return { lorries, shipments };
      });
    } else {
      set((state) => {
        const lorries = state.lorries.map((l) => l.id === id ? { ...l, ...updates, updated_at: new Date().toISOString() } : l);
        persist({ lorries, shipments: state.shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
        return { lorries };
      });
    }

    // Try Supabase in background
    try {
      const { error } = await supabase.from('lorries').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) console.warn('Supabase maintenance update failed (local already applied):', error.message);
    } catch {
      // Already handled locally
    }

    return { affectedShipmentCount: activeShipments.length };
  },

  // ─── GPS location update (throttled) ───────────────────────────────────────
  updateLorryGPS: async (lorryId, lat, lng, speed, heading) => {
    const now = Date.now();
    // Throttle: max 1 Supabase write per GPS_THROTTLE_MS per lorry
    if (now - (_lastGpsWrite[lorryId] ?? 0) < GPS_THROTTLE_MS) return;
    _lastGpsWrite[lorryId] = now;

    const updateTs = new Date().toISOString();

    // Auto-match nearest location name if within ~5km
    const locations = get().locations;
    const matchedLocation = locations.find(
      (loc) => Math.hypot(loc.latitude - lat, loc.longitude - lng) < 0.06
    );
    const locationNamePatch = matchedLocation ? { current_location_name: matchedLocation.name } : {};

    // Optimistic local update immediately (no throttle for UI)
    set((state) => ({
      lorries: state.lorries.map((l) =>
        l.lorry_id === lorryId
          ? {
              ...l,
              ...locationNamePatch,
              current_latitude: lat,
              current_longitude: lng,
              speed_kmh: speed ?? null,
              heading_deg: heading ?? null,
              last_location_update: updateTs,
              updated_at: updateTs,
            }
          : l
      ),
    }));

    try {
      await supabase.from('lorries').update({
        ...locationNamePatch,
        current_latitude: lat,
        current_longitude: lng,
        speed_kmh: speed ?? null,
        heading_deg: heading ?? null,
        last_location_update: updateTs,
        updated_at: updateTs,
      }).eq('lorry_id', lorryId);
    } catch {
      // Local update already applied; Supabase will catch up on next full fetch
    }
  },

  // ─── Supabase Realtime subscription for lorries ──────────────────────────
  subscribeToLorries: () => {
    const channel = supabase
      .channel('lorries-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lorries' }, (payload) => {
        const updated = payload.new as Lorry | undefined;
        if (!updated) return;
        set((state) => {
          const exists = state.lorries.some((l) => l.id === updated.id || l.lorry_id === updated.lorry_id);
          const lorries = exists
            ? state.lorries.map((l) =>
                l.id === updated.id || l.lorry_id === updated.lorry_id
                  ? { ...l, ...updated }
                  : l
              )
            : [updated, ...state.lorries];
          return { lorries };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // ─── Load activity audit log ─────────────────────────────────────────────
  loadAuditLog: async () => {
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) {
        set({ auditLog: data as AuditLogRow[] });
      }
    } catch {
      // audit_log table may not exist yet in older deployments — fail silently
    }
  },

  deleteLorry: async (id) => {
    set({ error: null });
    // Log before deletion so we capture the row
    const lorryToDelete = get().lorries.find((l) => l.id === id);
    if (lorryToDelete) {
      void logAudit('deleted', `Lorry ${lorryToDelete.lorry_id} deleted`, lorryToDelete.lorry_id, null);
    }
    try {
      const { error } = await supabase.from('lorries').delete().eq('id', id);
      if (error) throw error;
      await get().fetchData();
    } catch (e) {
      console.warn('Supabase delete failed, applying local fallback:', e);
      set((state) => ({
        lorries: state.lorries.filter((l) => l.id !== id),
      }));
    }
  },

  addShipment: async (s) => {
    set({ error: null });
    const newShipment: Shipment = {
      id: s.id || `local-${Date.now()}`,
      shipment_id: s.shipment_id!,
      weight_kg: s.weight_kg!,
      volume_m3: s.volume_m3!,
      pickup_location_name: s.pickup_location_name!,
      pickup_latitude: s.pickup_latitude!,
      pickup_longitude: s.pickup_longitude!,
      destination_name: s.destination_name!,
      destination_latitude: s.destination_latitude!,
      destination_longitude: s.destination_longitude!,
      delivery_deadline: s.delivery_deadline!,
      earliest_delivery_time: s.earliest_delivery_time ?? null,
      priority: s.priority || 'MEDIUM',
      status: 'pending',
      shipment_status: 'pending',
      assigned_lorry_id: null,
      assigned_driver_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic local update
    set((state) => {
      const shipments = [...state.shipments, newShipment].sort((a, b) => a.shipment_id.localeCompare(b.shipment_id));
      const locations = fallbackLocations(state.lorries, shipments);
      persist({ lorries: state.lorries, shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
      return { shipments, locations };
    });

    try {
      const { data, error } = await supabase.from('shipments').insert({
        shipment_id: newShipment.shipment_id, weight_kg: newShipment.weight_kg, volume_m3: newShipment.volume_m3,
        pickup_location_name: newShipment.pickup_location_name, pickup_latitude: newShipment.pickup_latitude, pickup_longitude: newShipment.pickup_longitude,
        destination_name: newShipment.destination_name, destination_latitude: newShipment.destination_latitude, destination_longitude: newShipment.destination_longitude,
        delivery_deadline: newShipment.delivery_deadline, earliest_delivery_time: newShipment.earliest_delivery_time,
        priority: newShipment.priority, status: newShipment.status, shipment_status: newShipment.shipment_status,
      }).select().single();
      if (!error && data) {
        set((state) => {
          const shipments = state.shipments.map((sh) => sh.id === newShipment.id ? { ...sh, id: (data as Shipment).id } : sh);
          lsSet('shipments', shipments);
          return { shipments };
        });
      }
    } catch {
      // Already persisted locally
    }
  },

  updateShipment: async (id, updates) => {
    set({ error: null });
    const now = new Date().toISOString();
    set((state) => {
      const shipments = state.shipments.map((s) => s.id === id ? { ...s, ...updates, updated_at: now } : s);
      persist({ lorries: state.lorries, shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
      return { shipments };
    });
    try {
      await supabase.from('shipments').update({ ...updates, updated_at: now }).eq('id', id);
    } catch {
      // Applied locally
    }
  },

  deleteShipment: async (id) => {
    set({ error: null });
    set((state) => {
      const shipments = state.shipments.filter((s) => s.id !== id);
      persist({ lorries: state.lorries, shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
      return { shipments };
    });
    try {
      await supabase.from('shipments').delete().eq('id', id);
    } catch {
      // Already deleted locally
    }
  },

  // Feature 6: Update lorry location on delivery and set driver available ONLY when ALL assigned active shipments are delivered
  markShipmentDelivered: async (id) => {
    set({ error: null });
    const shipment = get().shipments.find((s) => s.id === id);
    if (!shipment) return;
    if ((shipment.shipment_status ?? shipment.status) === 'delivered') return;
    const now = new Date().toISOString();

    const targetLorryId = shipment.assigned_lorry_id ||
      get().assignments.find((a) => a.shipment_id === shipment.shipment_id)?.lorry_id ||
      get().lorries.find((l) => l.current_shipment_id === shipment.shipment_id)?.lorry_id;

    // Apply locally first
    set((state) => {
      const shipments = state.shipments.map((s) =>
        s.id === id ? { ...s, shipment_status: 'delivered' as const, status: 'delivered' as const, updated_at: now } : s
      );

      // Check if this lorry still has ANY OTHER active shipments assigned to it!
      const remainingActiveShipments = shipments.filter(
        (s) => s.id !== id && (s.assigned_lorry_id === targetLorryId) && (s.shipment_status ?? s.status) === 'active'
      );
      const isStillBusy = remainingActiveShipments.length > 0;
      const nextActiveShipment = remainingActiveShipments[0] || null;

      const lorries = state.lorries.map((l) =>
        l.lorry_id === targetLorryId || l.id === targetLorryId
          ? {
              ...l,
              // Keep ASSIGNED if lorry still has other active shipments in its consolidated route!
              assignment_status: isStillBusy ? ('assigned' as const) : ('available' as const),
              current_shipment_id: nextActiveShipment ? nextActiveShipment.shipment_id : null,
              driver_available: true,
              // Update location to this delivered shipment's destination!
              current_location_name: shipment.destination_name,
              current_latitude: shipment.destination_latitude,
              current_longitude: shipment.destination_longitude,
              updated_at: now,
            }
          : l
      );
      persist({ lorries, shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
      return { shipments, lorries };
    });

    // Audit: log delivery
    void logAudit(
      'delivered',
      `Shipment ${shipment.shipment_id} delivered to ${shipment.destination_name}; lorry ${targetLorryId ?? ''} location updated to ${shipment.destination_name}`,
      targetLorryId,
      shipment.shipment_id
    );

    try {
      const remainingActiveShipments = get().shipments.filter(
        (s) => s.id !== id && s.assigned_lorry_id === targetLorryId && (s.shipment_status ?? s.status) === 'active'
      );
      const isStillBusy = remainingActiveShipments.length > 0;
      const nextActiveShipment = remainingActiveShipments[0] || null;

      await supabase.from('shipments').update({ shipment_status: 'delivered', status: 'delivered', updated_at: now }).eq('id', id);
      if (targetLorryId) {
        await supabase.from('lorries').update({
          assignment_status: isStillBusy ? 'assigned' : 'available',
          current_shipment_id: nextActiveShipment ? nextActiveShipment.shipment_id : null,
          driver_available: true,
          current_location_name: shipment.destination_name,
          current_latitude: shipment.destination_latitude,
          current_longitude: shipment.destination_longitude,
          updated_at: now,
        }).eq('lorry_id', targetLorryId);
      }
    } catch {
      // Already applied locally
    }
  },

  unassignShipment: async (id) => {
    set({ error: null });
    const shipment = get().shipments.find((s) => s.id === id);
    if (!shipment) return;
    const now = new Date().toISOString();

    // Apply locally first
    set((state) => {
      const shipments = state.shipments.map((s) =>
        s.id === id ? { ...s, shipment_status: 'unassigned' as const, status: 'unassigned' as const, assigned_lorry_id: null, assigned_driver_name: null, updated_at: now } : s
      );
      // Release the lorry if it's assigned to this shipment
      const lorries = state.lorries.map((l) =>
        l.current_shipment_id === shipment.shipment_id || l.lorry_id === shipment.assigned_lorry_id
          ? { ...l, assignment_status: 'available' as const, current_shipment_id: null, driver_available: true, updated_at: now }
          : l
      );
      persist({ lorries, shipments, settings: state.settings, runs: state.runs, assignments: state.assignments, rejections: state.rejections });
      return { shipments, lorries };
    });

    try {
      await supabase.from('shipments').update({ shipment_status: 'unassigned', status: 'unassigned', assigned_lorry_id: null, assigned_driver_name: null, updated_at: now }).eq('id', id);
      if (shipment.assigned_lorry_id) {
        await supabase.from('lorries').update({
          assignment_status: 'available', current_shipment_id: null, driver_available: true, updated_at: now,
        }).eq('lorry_id', shipment.assigned_lorry_id);
      }
    } catch {
      // Already applied locally
    }
  },

  applyScenarioResult: async (result) => {
    try {
      const now = new Date().toISOString();
      // Scenario Sandbox is connected to live data for real IDs: edited operational
      // values and optimizer assignments are persisted, while lifecycle rules remain enforced.
      const liveLorries = get().lorries;
      const liveShipments = get().shipments;
      for (const l of liveLorries) {
        const scenario = result.plans.find((p) => p.lorry.lorry_id === l.lorry_id)?.lorry
          ?? (result.unassigned.find((u) => u.reasons.some((r) => r.lorry_id === l.lorry_id)) ? null : undefined);
        if (scenario) {
          const { error: lErr } = await supabase.from('lorries').update({
            maximum_weight_capacity_kg: scenario.maximum_weight_capacity_kg,
            maximum_volume_capacity_m3: scenario.maximum_volume_capacity_m3,
            current_location_name: scenario.current_location_name,
            current_latitude: scenario.current_latitude,
            current_longitude: scenario.current_longitude,
            fuel_efficiency_km_per_litre: scenario.fuel_efficiency_km_per_litre,
            driver_available: scenario.driver_available,
            driver_name: scenario.driver_name,
            updated_at: now,
          }).eq('lorry_id', l.lorry_id);
          if (lErr) throw lErr;
        }
      }
      for (const s of liveShipments) {
        const scenario = result.plans.flatMap((p) => p.sequence.map((x) => x.shipment))
          .concat(result.unassigned.map((u) => u.shipment))
          .find((x) => x.shipment_id === s.shipment_id);
        if (scenario) {
          const { error: sErr } = await supabase.from('shipments').update({
            weight_kg: scenario.weight_kg,
            volume_m3: scenario.volume_m3,
            pickup_location_name: scenario.pickup_location_name,
            pickup_latitude: scenario.pickup_latitude,
            pickup_longitude: scenario.pickup_longitude,
            destination_name: scenario.destination_name,
            destination_latitude: scenario.destination_latitude,
            destination_longitude: scenario.destination_longitude,
            delivery_deadline: scenario.delivery_deadline,
            priority: scenario.priority,
            updated_at: now,
          }).eq('shipment_id', s.shipment_id);
          if (sErr) throw sErr;
        }
      }
      for (const plan of result.plans) {
        for (const planned of plan.sequence) {
          const { error: sErr } = await supabase.from('shipments').update({
            shipment_status: 'active', status: 'assigned',
            assigned_lorry_id: plan.lorry.lorry_id,
            assigned_driver_name: plan.lorry.driver_name ?? null,
            updated_at: now,
          }).eq('shipment_id', planned.shipment.shipment_id);
          if (sErr) throw sErr;
          const { error: lErr } = await supabase.from('lorries').update({
            assignment_status: 'assigned',
            current_shipment_id: planned.shipment.shipment_id,
            driver_available: false,
            updated_at: now,
          }).eq('lorry_id', plan.lorry.lorry_id);
          if (lErr) throw lErr;
        }
      }
      for (const u of result.unassigned) {
        await supabase.from('shipments').update({
          shipment_status: 'unassigned', status: 'unassigned',
          assigned_lorry_id: null, assigned_driver_name: null, updated_at: now,
        }).eq('shipment_id', u.shipment.shipment_id);
      }
      
      void logAudit('scenario_applied', 'Scenario sandbox results applied to live data', null, null);
      
      await get().fetchData();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  addLocation: async (l) => {
    try {
      const existing = get().locations.find((x) => x.name.trim().toLowerCase() === l.name.trim().toLowerCase());
      if (existing) return existing;
      const { data, error } = await supabase
        .from('locations')
        .insert({ name: l.name.trim(), latitude: l.latitude, longitude: l.longitude })
        .select()
        .single();
      if (error) throw error;
      await get().fetchData();
      return data as Location;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  updateSettings: async (s) => {
    set({ error: null });
    const now = new Date().toISOString();
    // Apply locally first
    set((state) => {
      const settings = state.settings ? { ...state.settings, ...s, updated_at: now } : { ...DEFAULT_SETTINGS, ...s, updated_at: now };
      lsSet('settings', settings);
      return { settings };
    });
    try {
      const { error } = await supabase.from('optimization_settings').update({ ...s, updated_at: now }).eq('id', 1);
      if (error) console.warn('Supabase settings update failed (local already applied):', error.message);
    } catch {
      // Already saved locally
    }
  },

  runOptimization: async (opts) => {
    const { lorries, shipments, settings } = get();
    if (!settings) {
      set({ error: 'Settings not loaded' });
      throw new Error('Settings not loaded');
    }

    // Filter pending/unassigned shipments, or all non-delivered shipments if re-optimizing active fleet
    const pendingOrUnassigned = shipments.filter((s) => {
      const status = s.shipment_status ?? s.status;
      return status === 'pending' || status === 'unassigned';
    });
    const workShipments = pendingOrUnassigned.length > 0
      ? pendingOrUnassigned
      : shipments.filter((s) => (s.shipment_status ?? s.status) !== 'delivered');

    if (workShipments.length === 0) {
      workShipments.push(...shipments);
    }
    set({ optimizing: true, error: null, progressMessage: 'Analyzing fleet...' });

    const stages = ['Analyzing fleet...', 'Checking capacity...', 'Prioritizing by deadline...', 'Grouping compatible shipments...', 'Calculating routes...', 'Calculating fuel...', 'Checking deadlines...', 'Optimizing transportation cost...', 'Generating final plan...'];
    for (const stage of stages) {
      set({ progressMessage: stage });
      await new Promise((r) => setTimeout(r, 120));
    }

    try {
      const beforeSummary = opts?.beforeSummary ? computeBeforeSummary(lorries, workShipments, settings) : null;
      const result = optimize({ lorries, shipments: workShipments, settings, locations: get().locations, before_summary: beforeSummary });

      if (opts?.saveToDb) {
        // Always create a local run record first (works offline)
        const localRunId = `run-${Date.now()}`;
        const runRecord: OptimizationRun = {
          id: localRunId,
          created_at: new Date().toISOString(),
          total_cost: result.total_cost,
          total_distance_km: result.total_distance_km,
          total_fuel_litres: result.total_fuel_litres,
          assigned_shipments: result.assigned_count,
          unassigned_shipments: result.unassigned_count,
          status: 'completed',
          input_summary: { lorries: lorries.length, shipments: workShipments.length },
          before_summary: beforeSummary as unknown as Record<string, unknown> | null,
        };
        result.run_id = localRunId;

        const assignmentRows: Assignment[] = result.plans.flatMap((p) =>
          p.sequence.map((ps) => {
            const effectiveShipmentId = p.is_relay
              ? (p.relay_shipment_id || ps.shipment.shipment_id.replace(/-L[12]$/, ''))
              : ps.shipment.shipment_id;
            return {
              id: `a-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              optimization_run_id: localRunId,
              lorry_id: p.lorry.lorry_id,
              shipment_id: effectiveShipmentId,
              driver_name: p.lorry.driver_name ?? null,
              delivery_sequence: ps.sequence,
              distance_km: ps.cumulative_distance_km,
              travel_time_minutes: ps.cumulative_time_minutes,
              fuel_litres: p.total_fuel_litres / Math.max(1, p.sequence.length),
              fuel_cost: p.total_fuel_cost / Math.max(1, p.sequence.length),
              total_cost: p.total_cost / Math.max(1, p.sequence.length),
              eta: ps.eta.toISOString(),
              deadline: ps.deadline.toISOString(),
              deadline_status: ps.deadline_status,
              group_id: p.group_id,
              route_summary: null,
              split_index: p.split_index ?? null,
              split_total: p.split_total ?? null,
              parent_shipment_id: p.is_split
                ? (p.split_shipment_id ?? ps.shipment.shipment_id)
                : p.is_relay
                ? (p.relay_shipment_id ?? ps.shipment.shipment_id)
                : null,
              split_weight_kg: p.split_portion_weight_kg ?? null,
              split_volume_m3: p.split_portion_volume_m3 ?? null,
              split_portion_weight_kg: p.split_portion_weight_kg ?? null,
              split_portion_volume_m3: p.split_portion_volume_m3 ?? null,
              is_relay: p.is_relay ?? false,
              relay_leg: p.relay_leg ?? null,
              relay_total_legs: p.relay_total_legs ?? null,
              relay_shipment_id: p.relay_shipment_id ?? null,
              relay_point_name: p.relay_point_name ?? null,
            };
          })
        );

        const rejectionRows: RejectionReason[] = result.unassigned.flatMap((u) =>
          u.reasons.map((r) => ({
            id: `r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            optimization_run_id: localRunId,
            shipment_id: u.shipment.shipment_id,
            lorry_id: r.lorry_id,
            reason: r.reason,
            details: r.details,
          }))
        );

        // Apply shipment/lorry state changes locally
        const now = new Date().toISOString();
        set((state) => {
          let updatedShipments = [...state.shipments];
          let updatedLorries = [...state.lorries];

          const usedLorryIds = new Set(result.plans.map((p) => p.lorry.lorry_id));

          for (const plan of result.plans) {
            const isFirstSplit = !plan.is_split || plan.split_index === 1;
            const isFirstRelay = !plan.is_relay || plan.relay_leg === 1;
            for (const planned of plan.sequence) {
              const baseShipmentId = plan.is_relay
                ? (plan.relay_shipment_id || planned.shipment.shipment_id.replace(/-L[12]$/, ''))
                : planned.shipment.shipment_id;

              if (isFirstSplit && isFirstRelay) {
                updatedShipments = updatedShipments.map((s) =>
                  s.shipment_id === baseShipmentId
                    ? { ...s, shipment_status: 'active' as const, status: 'active' as const, assigned_lorry_id: plan.lorry.lorry_id, assigned_driver_name: plan.lorry.driver_name ?? null, updated_at: now }
                    : s
                );
              }
            }
          }

          updatedLorries = updatedLorries.map((l) => {
            if (usedLorryIds.has(l.lorry_id)) {
              const plan = result.plans.find((p) => p.lorry.lorry_id === l.lorry_id);
              const firstShipment = plan?.sequence[0]?.shipment;
              const effectiveId = plan?.is_relay
                ? (plan.relay_shipment_id || firstShipment?.shipment_id.replace(/-L[12]$/, '') || null)
                : (firstShipment?.shipment_id ?? null);
              return { ...l, assignment_status: 'assigned' as const, current_shipment_id: effectiveId, updated_at: now };
            }
            return l;
          });

          for (const unassigned of result.unassigned) {
            updatedShipments = updatedShipments.map((s) =>
              s.shipment_id === unassigned.shipment.shipment_id
                ? { ...s, shipment_status: 'unassigned' as const, status: 'unassigned' as const, assigned_lorry_id: null, assigned_driver_name: null, updated_at: now }
                : s
            );
          }

          const runs = [runRecord, ...state.runs].slice(0, 50);
          const assignments = [...assignmentRows, ...state.assignments].slice(0, 1000);
          const rejections = [...rejectionRows, ...state.rejections].slice(0, 1000);
          persist({ lorries: updatedLorries, shipments: updatedShipments, settings: state.settings, runs, assignments, rejections });
          return { lorries: updatedLorries, shipments: updatedShipments, runs, assignments, rejections };
        });

        // Try Supabase in background — best effort
        if (supabaseConfigured) {
          try {
            const { data: runData, error: runError } = await supabase.from('optimization_runs').insert({
              total_cost: result.total_cost, total_distance_km: result.total_distance_km, total_fuel_litres: result.total_fuel_litres,
              assigned_shipments: result.assigned_count, unassigned_shipments: result.unassigned_count, status: 'completed',
              input_summary: { lorries: lorries.length, shipments: workShipments.length }, before_summary: beforeSummary,
            }).select().maybeSingle();

            if (!runError && runData) {
              const dbRunId = (runData as OptimizationRun).id;
              result.run_id = dbRunId;
              const dbAssignRows = assignmentRows.map(({ id: _id, ...rest }) => ({ ...rest, optimization_run_id: dbRunId }));
              const dbRejectRows = rejectionRows.map(({ id: _id, ...rest }) => ({ ...rest, optimization_run_id: dbRunId }));
              if (dbAssignRows.length) await supabase.from('assignments').insert(dbAssignRows);
              if (dbRejectRows.length) await supabase.from('rejection_reasons').insert(dbRejectRows);
              const now2 = new Date().toISOString();
              const usedLorryIds = new Set(result.plans.map((p) => p.lorry.lorry_id));

              for (const plan of result.plans) {
                const isFirstSplit = !plan.is_split || plan.split_index === 1;
                for (const ps of plan.sequence) {
                  if (isFirstSplit || !plan.is_split) {
                    await supabase.from('shipments').update({ shipment_status: 'active', status: 'assigned', assigned_lorry_id: plan.lorry.lorry_id, assigned_driver_name: plan.lorry.driver_name ?? null, updated_at: now2 }).eq('shipment_id', ps.shipment.shipment_id);
                  }
                  await supabase.from('lorries').update({ assignment_status: 'assigned', current_shipment_id: ps.shipment.shipment_id, updated_at: now2 }).eq('lorry_id', plan.lorry.lorry_id);
                  // Mint a fresh tracking token per active assignment
                  void generateAssignmentToken(plan.lorry.lorry_id, ps.shipment.shipment_id);
                }
              }

              for (const u of result.unassigned) {
                await supabase.from('shipments').update({ shipment_status: 'unassigned', status: 'unassigned', assigned_lorry_id: null, assigned_driver_name: null, updated_at: now2 }).eq('shipment_id', u.shipment.shipment_id);
              }
              
              void logAudit(
                'run_completed',
                `Optimization run completed. Assigned: ${result.assigned_count}, Unassigned: ${result.unassigned_count}`,
                null,
                null
              );
            }
          } catch {
            // Supabase unavailable — local run already saved
          }
        }
      }

      set({ currentResult: result, optimizing: false, progressMessage: '' });
      return result;
    } catch (e) {
      set({ optimizing: false, progressMessage: '', error: (e as Error).message });
      throw e;
    }
  },

  loadRunHistory: async () => {
    // Always show local runs first
    const localRuns = get().runs;
    if (localRuns.length > 0) set({ runs: localRuns });

    if (supabaseConfigured) {
      try {
        const { data, error } = await supabase.from('optimization_runs').select('*').order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        const runs = data || [];
        set({ runs });
        lsSet('runs', runs);
      } catch {
        // Use local runs already loaded
      }
    }
  },

  loadRunDetails: async (runId) => {
    // Try local cache first
    const localAssignments = get().assignments.filter((a) => a.optimization_run_id === runId);
    const localRejections = get().rejections.filter((r) => r.optimization_run_id === runId);
    const localRun = get().runs.find((r) => r.id === runId);

    if (localRun && (localAssignments.length > 0 || localRejections.length > 0)) {
      return { run: localRun, assignments: localAssignments, rejections: localRejections };
    }

    if (supabaseConfigured) {
      try {
        const [runRes, assignRes, rejectRes] = await Promise.all([
          supabase.from('optimization_runs').select('*').eq('id', runId).maybeSingle(),
          supabase.from('assignments').select('*').eq('optimization_run_id', runId).order('delivery_sequence'),
          supabase.from('rejection_reasons').select('*').eq('optimization_run_id', runId),
        ]);
        if (runRes.error) throw runRes.error;
        if (assignRes.error) throw assignRes.error;
        if (rejectRes.error) throw rejectRes.error;
        return { run: runRes.data as OptimizationRun, assignments: (assignRes.data || []) as Assignment[], rejections: (rejectRes.data || []) as RejectionReason[] };
      } catch {
        if (localRun) return { run: localRun, assignments: localAssignments, rejections: localRejections };
        throw new Error('Run not found in local or remote storage');
      }
    }

    if (localRun) return { run: localRun, assignments: localAssignments, rejections: localRejections };
    throw new Error('Run not found in local or remote storage');
  },

  setError: (e) => set({ error: e }),

  resetData: () => {
    const lorries = DEFAULT_LORRIES;
    const shipments = DEFAULT_SHIPMENTS.map(normaliseShipment);
    const settings = DEFAULT_SETTINGS;
    const locations = fallbackLocations(lorries, shipments);
    const newState = {
      lorries,
      shipments,
      settings,
      locations,
      runs: [],
      assignments: [],
      rejections: [],
      currentResult: null,
      error: null,
    };
    set(newState);
  },
}));

// Helper functions for driver tracking link tokens
export async function generateAssignmentToken(lorryId: string, shipmentId: string): Promise<string> {
  const token = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `trk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  if (supabaseConfigured) {
    try {
      // Expire prior non-expired tokens for this lorry
      await supabase
        .from('driver_tracking_links')
        .update({ expired_at: now })
        .eq('lorry_id', lorryId)
        .is('expired_at', null);

      // Insert new token
      await supabase.from('driver_tracking_links').insert({
        tracking_token: token,
        lorry_id: lorryId,
        shipment_id: shipmentId,
        created_at: now,
      });
    } catch {
      // Fallback
    }
  }

  try {
    const cache = JSON.parse(localStorage.getItem('optifleet_tracking_tokens') || '{}');
    cache[lorryId] = token;
    cache[shipmentId] = token;
    cache[token] = { lorry_id: lorryId, shipment_id: shipmentId, expired_at: null };
    localStorage.setItem('optifleet_tracking_tokens', JSON.stringify(cache));
  } catch {}

  return token;
}

export async function getActiveTrackingToken(lorryId: string, shipmentId?: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('driver_tracking_links')
      .select('tracking_token')
      .eq('lorry_id', lorryId)
      .is('expired_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].tracking_token) {
      return data[0].tracking_token;
    }
  } catch {}

  try {
    const cache = JSON.parse(localStorage.getItem('optifleet_tracking_tokens') || '{}');
    if (cache[lorryId]) return cache[lorryId];
    if (shipmentId && cache[shipmentId]) return cache[shipmentId];
  } catch {}

  return await generateAssignmentToken(lorryId, shipmentId || 'S001');
}

