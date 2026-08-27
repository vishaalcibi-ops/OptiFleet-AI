import { useMemo, useState, type ReactNode } from 'react';
import { Package, Plus, Pencil, Trash2, Search, CheckCircle2, XCircle, CircleDot, MapPin } from 'lucide-react';
import { useStore } from '@/lib/store';
import { evaluateShipmentCompatibility, effectiveUrgencyScore } from '@/lib/optimizer';
import { Modal } from '@/components/Modal';
import { PriorityBadge, formatCurrency, formatNumber, formatTime } from '@/components/Badges';
import type { Location, Shipment, Priority, ShipmentStatus } from '@/types';

interface FormState {
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
  earliest_delivery_time: string;
  priority: Priority;
}

function defaultDeadline(hours: number) { return new Date(Date.now() + hours * 3600000).toISOString().slice(0, 16); }

const emptyForm: FormState = {
  shipment_id: '', weight_kg: 2000, volume_m3: 8,
  pickup_location_name: '', pickup_latitude: 11, pickup_longitude: 77,
  destination_name: '', destination_latitude: 11, destination_longitude: 77,
  delivery_deadline: defaultDeadline(8), earliest_delivery_time: '', priority: 'MEDIUM',
};

const statusMeta: Record<ShipmentStatus, { label: string; cls: string }> = {
  pending: { label: 'PENDING', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  active: { label: 'ACTIVE', cls: 'bg-success-50 text-success-700 border border-success-200' },
  delivered: { label: 'DELIVERED', cls: 'bg-lavender-50 text-lavender-700 border border-lavender-200' },
  unassigned: { label: 'UNASSIGNED', cls: 'bg-error-50 text-error-700 border border-error-200' },
};

function StatusBadge({ status }: { status: ShipmentStatus }) {
  const meta = statusMeta[status];
  return <span className={`badge ${meta.cls}`}><CircleDot size={11} />{meta.label}</span>;
}

function UrgencyBadge({ shipment }: { shipment: Shipment }) {
  const score = effectiveUrgencyScore(shipment);
  const hoursRemaining = (new Date(shipment.delivery_deadline).getTime() - Date.now()) / 3600000;
  const label = hoursRemaining < 0
    ? 'OVERDUE'
    : hoursRemaining < 1
    ? `${Math.max(0, Math.round(hoursRemaining * 60))}m left`
    : `${hoursRemaining < 48 ? Math.round(hoursRemaining) + 'h' : Math.round(hoursRemaining / 24) + 'd'} left`;
  const cls = score >= 2000
    ? 'bg-error-50 text-error-600 border border-error-200'
    : score >= 700
    ? 'bg-warning-50 text-warning-600 border border-warning-200'
    : 'bg-base-800 text-gray-500 border border-base-700';
  return <span className={`badge ${cls}`} title={`Effective urgency score: ${Math.round(score)} (combines stated priority + deadline pressure)`}>{label}</span>;
}

function LocationCombobox({ label, value, locations, onChange }: { label: string; value: string; locations: Location[]; onChange: (location: Location) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const matches = locations.filter((l) => l.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <div className="relative">
    <label className="label">{label}</label>
    <div className="relative">
      <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input className="input pl-9" value={query} placeholder="Search known locations..." onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
    </div>
    {open && <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-base-700 bg-white shadow-xl">
      {matches.map((l) => <button key={l.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-base-100" onMouseDown={() => { setQuery(l.name); onChange(l); setOpen(false); }}><div className="text-sm font-semibold text-gray-800">{l.name}</div><div className="text-[11px] text-gray-500">{l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}</div></button>)}
      {!matches.length && <div className="px-3 py-3 text-xs text-gray-500">No saved location. Use “Add location” below.</div>}
    </div>}
  </div>;
}

export function ShipmentManagement() {
  const { shipments, lorries, locations, settings, addShipment, updateShipment, deleteShipment, markShipmentDelivered, unassignShipment, addLocation, assignments, resetData } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationTarget, setLocationTarget] = useState<'pickup' | 'destination'>('pickup');
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState({ name: '', latitude: 11, longitude: 77 });

  const filtered = shipments.filter((s) => `${s.shipment_id} ${s.pickup_location_name} ${s.destination_name} ${s.assigned_lorry_id ?? ''} ${s.assigned_driver_name ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const compatibility = useMemo(() => {
    if (!settings || !form.delivery_deadline || !form.pickup_location_name || !form.destination_name) return [];
    const draft: Shipment = { id: editing?.id ?? 'draft', shipment_id: form.shipment_id || 'Draft shipment', weight_kg: form.weight_kg, volume_m3: form.volume_m3, pickup_location_name: form.pickup_location_name, pickup_latitude: form.pickup_latitude, pickup_longitude: form.pickup_longitude, destination_name: form.destination_name, destination_latitude: form.destination_latitude, destination_longitude: form.destination_longitude, delivery_deadline: new Date(form.delivery_deadline).toISOString(), earliest_delivery_time: form.earliest_delivery_time ? new Date(form.earliest_delivery_time).toISOString() : null, priority: form.priority, status: 'pending', shipment_status: 'pending', assigned_lorry_id: null, assigned_driver_name: null, created_at: '', updated_at: '' };
    return lorries.map((lorry) => ({ lorry, assessment: evaluateShipmentCompatibility(lorry, draft, settings) }));
  }, [editing?.id, form, lorries, settings]);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, delivery_deadline: defaultDeadline(8) }); setValidationError(null); setModalOpen(true); };
  const openEdit = (s: Shipment) => { setEditing(s); setForm({ shipment_id: s.shipment_id, weight_kg: s.weight_kg, volume_m3: s.volume_m3, pickup_location_name: s.pickup_location_name, pickup_latitude: s.pickup_latitude, pickup_longitude: s.pickup_longitude, destination_name: s.destination_name, destination_latitude: s.destination_latitude, destination_longitude: s.destination_longitude, delivery_deadline: s.delivery_deadline.slice(0, 16), earliest_delivery_time: s.earliest_delivery_time ? s.earliest_delivery_time.slice(0, 16) : '', priority: s.priority }); setValidationError(null); setModalOpen(true); };

  const handleSubmit = async () => {
    if (!form.shipment_id.trim() || form.weight_kg <= 0 || form.volume_m3 <= 0 || !form.pickup_location_name || !form.destination_name || !form.delivery_deadline) { setValidationError('Enter a valid shipment ID, positive weight/volume, both saved locations, and a deadline.'); return; }
    const payload = { ...form, delivery_deadline: new Date(form.delivery_deadline).toISOString(), earliest_delivery_time: form.earliest_delivery_time ? new Date(form.earliest_delivery_time).toISOString() : null };
    if (editing) await updateShipment(editing.id, payload); else await addShipment(payload);
    if (!useStore.getState().error) setModalOpen(false);
  };

  const selectLocation = (target: 'pickup' | 'destination', l: Location) => setForm((f) => target === 'pickup' ? { ...f, pickup_location_name: l.name, pickup_latitude: l.latitude, pickup_longitude: l.longitude } : { ...f, destination_name: l.name, destination_latitude: l.latitude, destination_longitude: l.longitude });
  const createLocation = async () => { if (!newLocation.name.trim()) return; const created = await addLocation(newLocation); if (created) { selectLocation(locationTarget, created); setLocationModalOpen(false); setNewLocation({ name: '', latitude: 11, longitude: 77 }); } };

  return <div className="space-y-4 animate-fade-in">
    <div className="flex items-center justify-between flex-wrap gap-3"><div><h2 className="section-title">Shipment Management</h2><p className="text-sm text-gray-500">Live shipment lifecycle, optimizer assignment, deadlines and delivery confirmation.</p></div><div className="flex gap-2"><button onClick={() => { if (confirm('Are you sure you want to reset all data and load the 10 demo shipments?')) resetData(); }} className="btn-secondary flex items-center gap-1.5"><CircleDot size={14} className="text-accent-500" />Reload 10 Demo Shipments</button><button onClick={openAdd} className="btn-primary"><Plus size={16} />Add Shipment</button></div></div>
    <div className="relative max-w-xl"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" /><input className="input pl-9" placeholder="Search shipment, route, lorry or driver..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1250px]"><thead className="bg-base-800/50"><tr>{['Shipment ID','Route','Load','Deadline','Priority','Urgency','Status','Assigned Lorry','Driver','Actions'].map((h) => <th key={h} className="table-header text-left px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-base-700/40">
      {filtered.map((s) => {
        const status = s.shipment_status ?? s.status;
        const matchingAssignments = assignments.filter((a) => a.shipment_id === s.shipment_id);
        const uniqueLorries = Array.from(new Set(matchingAssignments.map((a) => a.lorry_id))).sort();
        const uniqueDrivers = Array.from(new Set(matchingAssignments.map((a) => a.driver_name).filter(Boolean))).sort();

        const lorryDisplay = uniqueLorries.length > 1
          ? `Split: ${uniqueLorries.join(' + ')}`
          : s.assigned_lorry_id ?? '—';

        const driverDisplay = uniqueDrivers.length > 1
          ? uniqueDrivers.join(' + ')
          : s.assigned_driver_name ?? '—';

        return <tr key={s.id} className="hover:bg-base-800/30"><td className="px-4 py-3 font-mono font-semibold text-accent-300">{s.shipment_id}</td><td className="px-4 py-3"><div className="text-gray-800 font-medium">{s.pickup_location_name}</div><div className="text-xs text-gray-500">→ {s.destination_name}</div></td><td className="px-4 py-3 text-sm text-gray-600">{formatNumber(s.weight_kg)} kg<br />{formatNumber(s.volume_m3, 1)} m³</td><td className="px-4 py-3 text-sm text-gray-500">{formatTime(s.delivery_deadline)}</td><td className="px-4 py-3"><PriorityBadge priority={s.priority} /></td><td className="px-4 py-3"><UrgencyBadge shipment={s} /></td><td className="px-4 py-3"><StatusBadge status={status} /></td><td className="px-4 py-3 font-mono text-sm text-gray-700">{lorryDisplay}</td><td className="px-4 py-3 text-sm text-gray-700">{driverDisplay}</td><td className="px-4 py-3"><div className="flex items-center gap-1"><button onClick={() => openEdit(s)} className="btn-ghost p-1.5 rounded-lg" title="Edit"><Pencil size={15} /></button>{status === 'active' && <><button onClick={() => markShipmentDelivered(s.id)} className="btn-ghost p-1.5 rounded-lg text-success-600" title="Mark as Delivered"><CheckCircle2 size={16} /></button><button onClick={() => { if (confirm(`Unassign shipment ${s.shipment_id}?`)) unassignShipment(s.id); }} className="btn-ghost p-1.5 rounded-lg text-warning-600" title="Unassign Shipment"><XCircle size={16} /></button></>}{status !== 'active' && status !== 'delivered' && <button onClick={() => { if (confirm(`Delete shipment ${s.shipment_id}?`)) deleteShipment(s.id); }} className="btn-ghost p-1.5 rounded-lg hover:text-error-400" title="Delete"><Trash2 size={15} /></button>}</div></td></tr>;
      })}
      {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-500"><Package size={32} className="mx-auto mb-2 opacity-40" />No shipments found.</td></tr>}
    </tbody></table></div></div>

    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.shipment_id}` : 'Add Shipment'} size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Shipment ID"><input className="input" value={form.shipment_id} disabled={!!editing} onChange={(e) => setForm({ ...form, shipment_id: e.target.value })} placeholder="e.g. S011" /></Field>
        <Field label="Priority"><select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}><option>URGENT</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></Field>
        <Field label="Weight (kg)"><input type="number" min="0.1" className="input" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: Number(e.target.value) })} /></Field>
        <Field label="Volume (m³)"><input type="number" min="0.1" step="0.1" className="input" value={form.volume_m3} onChange={(e) => setForm({ ...form, volume_m3: Number(e.target.value) })} /></Field>
        <div><LocationCombobox label="Pickup Location" value={form.pickup_location_name} locations={locations} onChange={(l) => selectLocation('pickup', l)} /><button type="button" className="btn-ghost text-xs mt-1" onClick={() => { setLocationTarget('pickup'); setLocationModalOpen(true); }}><Plus size={13} />Add location</button></div>
        <div><LocationCombobox label="Destination" value={form.destination_name} locations={locations} onChange={(l) => selectLocation('destination', l)} /><button type="button" className="btn-ghost text-xs mt-1" onClick={() => { setLocationTarget('destination'); setLocationModalOpen(true); }}><Plus size={13} />Add location</button></div>
        <Field label="Earliest Delivery Time"><input type="datetime-local" className="input" value={form.earliest_delivery_time} onChange={(e) => setForm({ ...form, earliest_delivery_time: e.target.value })} /></Field>
        <Field label="Delivery Deadline"><input type="datetime-local" className="input" value={form.delivery_deadline} onChange={(e) => setForm({ ...form, delivery_deadline: e.target.value })} /></Field>
      </div>
      <div className="mt-5 border-t border-base-700 pt-4"><div className="flex justify-between mb-2"><div><h3 className="text-sm font-bold text-gray-800">Optimizer compatibility</h3><p className="text-xs text-gray-500">Diagnostic only. Assignment is never selectable here.</p></div><span className="text-xs text-gray-500">{compatibility.filter((x) => x.assessment.feasible).length} qualify</span></div><div className="space-y-2 max-h-52 overflow-y-auto">{compatibility.map(({ lorry, assessment }) => <div key={lorry.id} className={`rounded-lg p-2.5 flex gap-2 ${assessment.feasible ? 'bg-success-500/5 border border-success-500/20' : 'bg-base-800/40'}`}>{assessment.feasible ? <CheckCircle2 size={16} className="text-success-500" /> : <XCircle size={16} className="text-error-500" />}<div><span className="font-mono font-semibold text-gray-700">{lorry.lorry_id}</span><span className="text-xs text-gray-500 ml-2">{lorry.driver_name || 'Driver not named'}</span><p className="text-xs text-gray-500">{assessment.feasible ? `${formatNumber(assessment.total_distance_km, 1)} km · ${formatCurrency(assessment.total_cost)} · ${assessment.deadline_margin_minutes ?? 0} min margin` : assessment.reasons.join(' ')}</p></div></div>)}</div></div>
      {validationError && <p className="mt-4 text-sm text-error-600 bg-error-500/10 rounded-lg px-3 py-2">{validationError}</p>}
      <div className="mt-6 flex justify-end gap-2"><button onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button><button onClick={handleSubmit} className="btn-primary">{editing ? 'Save Changes' : 'Add Shipment'}</button></div>
    </Modal>

    <Modal open={locationModalOpen} onClose={() => setLocationModalOpen(false)} title="Add Shared Location" size="sm"><p className="text-xs text-gray-500 mb-4">This location becomes available in Shipment Management and Scenario Sandbox.</p><div className="space-y-3"><Field label="Location name"><input className="input" value={newLocation.name} onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })} placeholder="e.g. Chennai" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Latitude"><input type="number" step="any" className="input" value={newLocation.latitude} onChange={(e) => setNewLocation({ ...newLocation, latitude: Number(e.target.value) })} /></Field><Field label="Longitude"><input type="number" step="any" className="input" value={newLocation.longitude} onChange={(e) => setNewLocation({ ...newLocation, longitude: Number(e.target.value) })} /></Field></div></div><div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setLocationModalOpen(false)}>Cancel</button><button className="btn-primary" onClick={createLocation}>Save Location</button></div></Modal>
  </div>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) { return <div className={className}><label className="label">{label}</label>{children}</div>; }
