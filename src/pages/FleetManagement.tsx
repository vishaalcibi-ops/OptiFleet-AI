import { useState } from 'react';
import { Truck, Plus, Pencil, Trash2, Search, Share2, Check, AlertOctagon, CheckCircle2, ExternalLink, MessageSquare } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useBreakdownAlarm } from '@/components/BreakdownAlarmProvider';
import { Modal } from '@/components/Modal';
import { LorryStatusBadge, formatNumber } from '@/components/Badges';
import type { Lorry, LorryStatus } from '@/types';

interface FormState {
  lorry_id: string;
  maximum_weight_capacity_kg: number;
  maximum_volume_capacity_m3: number;
  current_location_name: string;
  current_latitude: number;
  current_longitude: number;
  fuel_efficiency_km_per_litre: number;
  driver_available: boolean;
  driver_name: string;
  driver_phone: string;
  status: LorryStatus;
  max_driving_hours_per_day: number;
}

const emptyForm: FormState = {
  lorry_id: '',
  maximum_weight_capacity_kg: 10000,
  maximum_volume_capacity_m3: 40,
  current_location_name: '',
  current_latitude: 11.0,
  current_longitude: 77.0,
  fuel_efficiency_km_per_litre: 6,
  driver_available: true,
  driver_name: '',
  driver_phone: '',
  status: 'active',
  max_driving_hours_per_day: 9,
};

export function FleetManagement() {
  const { lorries, addLorry, updateLorry, deleteLorry, shipments, locations, resetData } = useStore();
  const { breakdownLorries, acknowledgeBreakdown, testSound } = useBreakdownAlarm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lorry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copiedLorryId, setCopiedLorryId] = useState<string | null>(null);

  const copyTrackingLink = async (l: Lorry) => {
    const url = `${window.location.origin}/track/${l.lorry_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLorryId(l.lorry_id);
      setTimeout(() => setCopiedLorryId(null), 3000);
    } catch {
      prompt('Copy driver tracking link:', url);
    }
  };

  const filtered = lorries.filter(
    (l) =>
      l.lorry_id.toLowerCase().includes(search.toLowerCase()) ||
      l.current_location_name.toLowerCase().includes(search.toLowerCase()) || (l.driver_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setValidationError(null);
    setModalOpen(true);
  };

  const openEdit = (l: Lorry) => {
    setEditing(l);
    setForm({
      lorry_id: l.lorry_id,
      maximum_weight_capacity_kg: l.maximum_weight_capacity_kg,
      maximum_volume_capacity_m3: l.maximum_volume_capacity_m3,
      current_location_name: l.current_location_name,
      current_latitude: l.current_latitude,
      current_longitude: l.current_longitude,
      fuel_efficiency_km_per_litre: l.fuel_efficiency_km_per_litre,
      driver_available: l.driver_available,
      driver_name: l.driver_name ?? '',
      driver_phone: l.driver_phone ?? '',
      status: l.status,
      max_driving_hours_per_day: l.max_driving_hours_per_day ?? 9,
    });
    setValidationError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.lorry_id.trim()) {
      setValidationError('Lorry ID is required.');
      return;
    }
    if (form.maximum_weight_capacity_kg <= 0) {
      setValidationError('Weight capacity must be positive.');
      return;
    }
    if (form.maximum_volume_capacity_m3 <= 0) {
      setValidationError('Volume capacity must be positive.');
      return;
    }
    if (form.fuel_efficiency_km_per_litre <= 0) {
      setValidationError('Fuel efficiency must be positive.');
      return;
    }
    if (form.max_driving_hours_per_day <= 0) {
      setValidationError('Max driving hours must be positive.');
      return;
    }
    if (!form.current_location_name.trim()) {
      setValidationError('Current location is required.');
      return;
    }

    if (editing) {
      const statusChanged = (form.status === 'maintenance' || form.status === 'inactive') && editing.status !== form.status;
      let activeShipmentsCount = 0;
      if (statusChanged) {
        const activeShipments = shipments.filter(
          (s) => s.assigned_lorry_id === editing.lorry_id && (s.shipment_status ?? s.status) === 'active'
        );
        activeShipmentsCount = activeShipments.length;
        if (activeShipmentsCount > 0) {
          const proceed = confirm(
            `Warning: Lorry ${editing.lorry_id} has ${activeShipmentsCount} active shipment(s). Changing its status to '${form.status}' will unassign these shipments and return them to the optimizer queue. Do you want to proceed?`
          );
          if (!proceed) return;
        }
      }
      
      await updateLorry(editing.id, form);
      
      if (!useStore.getState().error && activeShipmentsCount > 0) {
        alert(`${activeShipmentsCount} shipment(s) unassigned and requeued for next optimization.`);
      }
    } else {
      await addLorry(form);
    }
    if (!useStore.getState().error) setModalOpen(false);
  };

  const handleDelete = async (l: Lorry) => {
    if (confirm(`Delete lorry ${l.lorry_id}?`)) {
      await deleteLorry(l.id);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-title">Fleet Management</h2>
          <p className="text-sm text-gray-500">Manage lorries, capacities, locations, and driver availability</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} />
          Add Lorry
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="input pl-9"
          placeholder="Search by lorry ID or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-base-800/50">
              <tr>
                <th className="table-header text-left px-4 py-3">Lorry ID</th>
                <th className="table-header text-left px-4 py-3">Location</th>
                <th className="table-header text-right px-4 py-3">Max Weight</th>
                <th className="table-header text-right px-4 py-3">Max Volume</th>
                <th className="table-header text-right px-4 py-3">Fuel Eff.</th>
                <th className="table-header text-left px-4 py-3">Driver Details</th>
                <th className="table-header text-center px-4 py-3">Status</th>
                <th className="table-header text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-700/40">
              {filtered.map((l) => {
                const isLorryInBreakdown = l.is_breakdown || breakdownLorries.some((b) => b.lorry_id === l.lorry_id);
                return (
                  <tr key={l.id} className={`hover:bg-base-800/30 transition-colors ${isLorryInBreakdown ? 'bg-red-500/10' : ''}`}>
                    <td className="px-4 py-3 font-mono font-semibold text-accent-300">
                      <div className="flex items-center gap-1.5">
                        {isLorryInBreakdown && <AlertOctagon size={16} className="text-red-500 animate-pulse" />}
                        {l.lorry_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{l.current_location_name}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{formatNumber(l.maximum_weight_capacity_kg)} kg</td>
                    <td className="px-4 py-3 text-right text-gray-300">{formatNumber(l.maximum_volume_capacity_m3, 1)} m³</td>
                    <td className="px-4 py-3 text-right text-gray-300">{l.fuel_efficiency_km_per_litre} km/L</td>
                    <td className="px-4 py-3">
                       <div className="text-sm text-gray-300 font-semibold">{l.driver_name || 'Unassigned driver'}</div>
                       {l.driver_phone && <div className="text-xs text-gray-400 mt-0.5">{l.driver_phone}</div>}
                        {l.assignment_status === 'assigned' ? (
                          <span className="badge mt-1 bg-amber-500/20 text-amber-400 border border-amber-500/30">In Transit</span>
                        ) : (
                          <span className={`badge mt-1 ${l.driver_available ? 'bg-success-500/20 text-success-400 border border-success-500/30' : 'bg-error-500/20 text-error-400 border border-error-500/30'}`}>{l.driver_available ? 'Available' : 'Unavailable'}</span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="space-y-1">
                        {isLorryInBreakdown ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="badge bg-red-100 text-red-700 border border-red-300 animate-pulse font-bold flex items-center gap-1 justify-center">
                              🚨 Breakdown
                            </span>
                            <button
                              onClick={() => acknowledgeBreakdown(l.lorry_id)}
                              className="px-2 py-0.5 text-[11px] bg-red-600 hover:bg-red-700 text-white rounded font-medium shadow-sm transition-transform active:scale-95 flex items-center gap-1"
                            >
                              <CheckCircle2 size={11} /> Acknowledge
                            </button>
                          </div>
                        ) : (
                          <>
                            <LorryStatusBadge status={l.status} />
                            {l.assignment_status === 'assigned' && <span className="badge bg-warning-50 text-warning-600 border border-warning-200">ASSIGNED</span>}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => copyTrackingLink(l)}
                          className={`btn-ghost p-1.5 rounded-lg transition-colors ${copiedLorryId === l.lorry_id ? 'text-success-600 bg-success-50' : 'hover:text-accent-600'}`}
                          title="Copy driver GPS tracking link"
                        >
                          {copiedLorryId === l.lorry_id ? <Check size={15} /> : <Share2 size={15} />}
                        </button>
                        {l.driver_phone && (
                          <button
                            onClick={() => {
                              const cleanedPhone = l.driver_phone!.replace(/\D/g, '');
                              const text = `OptiFleet Driver Link: ${window.location.origin}/track/${l.lorry_id}`;
                              window.open(`https://api.whatsapp.com/send?phone=${cleanedPhone}&text=${encodeURIComponent(text)}`, '_blank');
                            }}
                            className="btn-ghost p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10"
                            title="Send Tracking Link via WhatsApp"
                          >
                            <MessageSquare size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => window.open(`/track/${l.lorry_id}`, '_blank')}
                          className="btn-ghost p-1.5 rounded-lg hover:text-sky-600"
                          title="Open Driver Phone View & SOS (New Tab)"
                        >
                          <ExternalLink size={15} />
                        </button>
                        <button onClick={() => openEdit(l)} className="btn-ghost p-1.5 rounded-lg" title="Edit">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDelete(l)} className="btn-ghost p-1.5 rounded-lg hover:text-error-400" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <Truck size={32} className="mx-auto mb-2 opacity-40" />
                    No lorries found. Click "Add Lorry" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.lorry_id}` : 'Add Lorry'}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Lorry ID</label>
            <input
              className="input"
              value={form.lorry_id}
              onChange={(e) => setForm({ ...form, lorry_id: e.target.value })}
              disabled={!!editing}
              placeholder="e.g. L06"
            />
          </div>
          <div>
            <label className="label">Current Location (District / Hub)</label>
            <input
              list="fleet-district-list"
              className="input"
              value={form.current_location_name}
              onChange={(e) => {
                const name = e.target.value;
                const match = locations.find((loc) => loc.name.toLowerCase() === name.toLowerCase());
                if (match) {
                  setForm({
                    ...form,
                    current_location_name: match.name,
                    current_latitude: match.latitude,
                    current_longitude: match.longitude,
                  });
                } else {
                  setForm({ ...form, current_location_name: name });
                }
              }}
              placeholder="Search or select district..."
            />
            <datalist id="fleet-district-list">
              {locations.map((loc) => (
                <option key={loc.id} value={loc.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Max Weight Capacity (kg)</label>
            <input
              type="number"
              className="input"
              value={form.maximum_weight_capacity_kg}
              onChange={(e) => setForm({ ...form, maximum_weight_capacity_kg: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Max Volume Capacity (m³)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={form.maximum_volume_capacity_m3}
              onChange={(e) => setForm({ ...form, maximum_volume_capacity_m3: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Latitude</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.current_latitude}
              onChange={(e) => setForm({ ...form, current_latitude: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.current_longitude}
              onChange={(e) => setForm({ ...form, current_longitude: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Driver Name</label>
            <input className="input" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} placeholder="e.g. Arun Kumar" />
          </div>
          <div>
            <label className="label">Driver Phone (WhatsApp)</label>
            <input className="input" value={form.driver_phone} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} placeholder="e.g. +919876543210" />
          </div>
          <div>
            <label className="label">Fuel Efficiency (km/L)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={form.fuel_efficiency_km_per_litre}
              onChange={(e) => setForm({ ...form, fuel_efficiency_km_per_litre: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Max Driving Hours / Day</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={form.max_driving_hours_per_day}
              onChange={(e) => setForm({ ...form, max_driving_hours_per_day: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as LorryStatus })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Driver Available</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setForm({ ...form, driver_available: !form.driver_available })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  form.driver_available ? 'bg-success-500' : 'bg-base-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
                    form.driver_available ? 'translate-x-7' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-300">
                {form.driver_available ? 'Driver is available' : 'Driver is unavailable'}
              </span>
            </div>
          </div>
        </div>

        {validationError && (
          <p className="mt-4 text-sm text-error-400 bg-error-500/10 rounded-lg px-3 py-2">{validationError}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} className="btn-primary">
            {editing ? 'Save Changes' : 'Add Lorry'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
