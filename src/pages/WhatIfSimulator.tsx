import { useState, type ReactNode } from 'react';
import { Play, Plus, RotateCcw, Truck, Package, XCircle, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { computeBeforeSummary, optimize } from '@/lib/optimizer';
import type { Lorry, LorryStatus, OptimizationResult, Priority, Shipment } from '@/types';
import { formatCurrency, formatNumber } from '@/components/Badges';

const timestamp = () => new Date().toISOString();
const makeLorry = (n: number): Lorry => ({ id: `sandbox-lorry-${n}`, lorry_id: `SAN-L${n}`, maximum_weight_capacity_kg: 10000, maximum_volume_capacity_m3: 40, current_location_name: 'Depot', current_latitude: 11, current_longitude: 77, fuel_efficiency_km_per_litre: 6, driver_available: true, driver_name: `Sandbox Driver ${n}`, status: 'active', max_driving_hours_per_day: 9, created_at: timestamp(), updated_at: timestamp() });
const makeShipment = (n: number): Shipment => ({ id: `sandbox-shipment-${n}`, shipment_id: `SAN-S${n}`, weight_kg: 2000, volume_m3: 8, pickup_location_name: 'Pickup', pickup_latitude: 11, pickup_longitude: 77, destination_name: 'Destination', destination_latitude: 11.1, destination_longitude: 77.1, delivery_deadline: new Date(Date.now() + 8 * 3600000).toISOString(), earliest_delivery_time: null, priority: 'MEDIUM', status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: timestamp(), updated_at: timestamp() });

export function WhatIfSimulator() {
  const { lorries, shipments, locations, settings, applyScenarioResult } = useStore();

  // Only load shipments that are NOT yet active/assigned and NOT delivered
  const getUnassignedShipments = () =>
    shipments
      .filter((s) => (s.shipment_status ?? s.status) !== 'active' && (s.shipment_status ?? s.status) !== 'delivered')
      .map((s) => ({ ...s }));

  // Only load lorries that are active and available (or all active if none available)
  const getAvailableLorries = () => {
    const available = lorries.filter((l) => l.status === 'active' && l.assignment_status !== 'assigned');
    return (available.length > 0 ? available : lorries.filter((l) => l.status === 'active')).map((l) => ({ ...l }));
  };

  const [sandboxLorries, setSandboxLorries] = useState<Lorry[]>(getAvailableLorries);
  const [sandboxShipments, setSandboxShipments] = useState<Shipment[]>(getUnassignedShipments);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState(false);

  const resetToLiveData = () => {
    setSandboxLorries(getAvailableLorries());
    setSandboxShipments(getUnassignedShipments());
    setResult(null);
  };
  const updateLorry = (id: string, field: keyof Lorry, value: unknown) => { setSandboxLorries((xs) => xs.map((x) => x.id === id ? { ...x, [field]: value } : x)); setResult(null); };
  const updateShipment = (id: string, updates: Partial<Shipment>) => { setSandboxShipments((xs) => xs.map((x) => x.id === id ? { ...x, ...updates } : x)); setResult(null); };
  const runSandbox = async () => {
    if (!settings) return;
    setRunning(true); setApplied(false);
    try {
      await new Promise((r) => setTimeout(r, 150));
      const next = optimize({ lorries: sandboxLorries, shipments: sandboxShipments, settings, before_summary: computeBeforeSummary(sandboxLorries, sandboxShipments, settings) });
      setResult(next);
      // Persist real shipment/lorry assignments so every dashboard module stays synchronized.
      await applyScenarioResult(next);
      setApplied(!useStore.getState().error);
    } finally { setRunning(false); }
  };

  return <div className="space-y-6 animate-fade-in">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="section-title">Scenario Sandbox</h2><p className="text-sm text-gray-500">Run the scenario with real shipment/lorry IDs to synchronize optimizer assignments with Fleet and Shipment Management.</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={resetToLiveData}><RotateCcw size={16} />Load live data</button><button className="btn-primary" onClick={runSandbox} disabled={!settings || running}><Play size={16} />{running ? 'Optimizing...' : 'Run & Apply scenario'}</button></div></div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <SandboxSection title="Hypothetical lorries" icon={Truck} onAdd={() => setSandboxLorries((xs) => [...xs, makeLorry(xs.length + 1)])}>{sandboxLorries.map((l) => <LorryEditor key={l.id} lorry={l} onChange={updateLorry} onRemove={() => { setSandboxLorries((xs) => xs.filter((x) => x.id !== l.id)); setResult(null); }} />)}</SandboxSection>
      <SandboxSection title="Hypothetical shipments" icon={Package} onAdd={() => setSandboxShipments((xs) => [...xs, makeShipment(xs.length + 1)])}>{sandboxShipments.map((s) => <ShipmentEditor key={s.id} shipment={s} locations={locations} onChange={updateShipment} onRemove={() => { setSandboxShipments((xs) => xs.filter((x) => x.id !== s.id)); setResult(null); }} />)}</SandboxSection>
    </div>
    {result && <><SandboxResults result={result} />{applied && <div className="card p-3 text-sm text-success-600 bg-success-50 border-success-200">Scenario assignments saved. Fleet Management and Shipment Management now show the same live state.</div>}</>}
  </div>;
}

function SandboxSection({ title, icon: Icon, onAdd, children }: { title: string; icon: typeof Truck; onAdd: () => void; children: ReactNode }) { return <div className="card p-4"><div className="flex justify-between mb-3"><h3 className="section-title flex items-center gap-2"><Icon size={18} className="text-accent-400" />{title}</h3><button className="btn-ghost text-xs" onClick={onAdd}><Plus size={15} />Add</button></div><div className="space-y-3 max-h-[36rem] overflow-y-auto">{children}</div></div>; }
function Field({ label, value, onChange, type = 'number', step }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; step?: string }) { return <label className="text-xs text-gray-500">{label}<input className="input text-sm mt-1" type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) { return <label className="text-xs text-gray-500">{label}<select className="input text-sm mt-1" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((x) => <option key={x}>{x}</option>)}</select></label>; }
function LorryEditor({ lorry: l, onChange, onRemove }: { lorry: Lorry; onChange: (id: string, field: keyof Lorry, value: unknown) => void; onRemove: () => void }) { return <div className="bg-base-800/40 rounded-lg p-3 space-y-2"><div className="flex gap-2"><input className="input text-sm font-mono" value={l.lorry_id} onChange={(e) => onChange(l.id, 'lorry_id', e.target.value)} /><button className="btn-ghost p-2 hover:text-error-400" onClick={onRemove}><XCircle size={16} /></button></div><div className="grid grid-cols-2 gap-2"><Field label="Weight kg" value={l.maximum_weight_capacity_kg} onChange={(v) => onChange(l.id, 'maximum_weight_capacity_kg', Number(v))} /><Field label="Volume m³" value={l.maximum_volume_capacity_m3} step="0.1" onChange={(v) => onChange(l.id, 'maximum_volume_capacity_m3', Number(v))} /><Field label="Fuel km/L" value={l.fuel_efficiency_km_per_litre} step="0.1" onChange={(v) => onChange(l.id, 'fuel_efficiency_km_per_litre', Number(v))} /><Select label="Driver" value={l.driver_available ? 'available' : 'unavailable'} onChange={(v) => onChange(l.id, 'driver_available', v === 'available')} options={['available', 'unavailable']} /><Select label="Status" value={l.status} onChange={(v) => onChange(l.id, 'status', v as LorryStatus)} options={['active', 'inactive', 'maintenance']} /><Field label="Location" type="text" value={l.current_location_name} onChange={(v) => onChange(l.id, 'current_location_name', v)} /><Field label="Latitude" value={l.current_latitude} step="any" onChange={(v) => onChange(l.id, 'current_latitude', Number(v))} /><Field label="Longitude" value={l.current_longitude} step="any" onChange={(v) => onChange(l.id, 'current_longitude', Number(v))} /></div></div>; }
function ShipmentEditor({ shipment: s, locations, onChange, onRemove }: { shipment: Shipment; locations: import('@/types').Location[]; onChange: (id: string, updates: Partial<Shipment>) => void; onRemove: () => void }) {
  const setLocation = (field: 'pickup' | 'destination', name: string) => {
    const loc = locations.find((x) => x.name === name);
    if (!loc) return;
    if (field === 'pickup') {
      onChange(s.id, { pickup_location_name: loc.name, pickup_latitude: loc.latitude, pickup_longitude: loc.longitude });
    } else {
      onChange(s.id, { destination_name: loc.name, destination_latitude: loc.latitude, destination_longitude: loc.longitude });
    }
  };
  return <div className="bg-base-800/40 rounded-lg p-3 space-y-2"><div className="flex gap-2"><input className="input text-sm font-mono" value={s.shipment_id} onChange={(e) => onChange(s.id, { shipment_id: e.target.value })} /><button className="btn-ghost p-2 hover:text-error-400" onClick={onRemove}><XCircle size={16} /></button></div><div className="grid grid-cols-2 gap-2"><Field label="Weight kg" value={s.weight_kg} onChange={(v) => onChange(s.id, { weight_kg: Number(v) })} /><Field label="Volume m³" value={s.volume_m3} step="0.1" onChange={(v) => onChange(s.id, { volume_m3: Number(v) })} /><Select label="Priority" value={s.priority} onChange={(v) => onChange(s.id, { priority: v as Priority })} options={['URGENT', 'HIGH', 'MEDIUM', 'LOW']} /><Field label="Deadline" type="datetime-local" value={s.delivery_deadline.slice(0, 16)} onChange={(v) => onChange(s.id, { delivery_deadline: new Date(v).toISOString() })} /><Select label="Pickup location" value={s.pickup_location_name} onChange={(v) => setLocation('pickup', v)} options={locations.map((x) => x.name)} /><Select label="Destination" value={s.destination_name} onChange={(v) => setLocation('destination', v)} options={locations.map((x) => x.name)} /></div></div>; }
function SandboxResults({ result }: { result: OptimizationResult }) { return <div className="card p-4 space-y-4"><h3 className="section-title flex items-center gap-2"><CheckCircle2 size={18} className="text-success-400" />Scenario diagnostics</h3><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Assigned" value={String(result.assigned_count)} /><Stat label="Unassigned" value={String(result.unassigned_count)} /><Stat label="Cost" value={formatCurrency(result.total_cost)} /><Stat label="Distance" value={`${formatNumber(result.total_distance_km, 1)} km`} /></div>{result.plans.map((p) => <div className="bg-base-800/40 rounded-lg p-3" key={p.lorry.id}><b className="font-mono text-accent-300">{p.lorry.lorry_id}</b><span className="text-sm text-gray-400"> · {p.shipments.map((s) => s.shipment_id).join(', ')} · {formatCurrency(p.total_cost)}</span></div>)}{result.unassigned.map((u) => <div className="bg-error-500/5 border border-error-500/20 rounded-lg p-3" key={u.shipment.id}><b className="font-mono text-error-300">{u.shipment.shipment_id}</b><div className="text-sm text-gray-400 mt-1">{u.reasons.map((r) => `${r.lorry_id}: ${r.reason}`).join(' · ')}</div></div>)}</div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="kpi-card"><span className="text-xs text-gray-500 uppercase">{label}</span><span className="text-lg font-bold text-gray-100">{value}</span></div>; }
