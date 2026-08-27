import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Info } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { OptimizationSettings } from '@/types';

export function SettingsPage() {
  const { settings, updateSettings } = useStore();
  const [form, setForm] = useState<OptimizationSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  if (!form) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Loading settings...</p>
      </div>
    );
  }

  const handleSave = async () => {
    await updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fields: { key: keyof OptimizationSettings; label: string; unit: string; desc: string }[] = [
    { key: 'average_speed_kmh', label: 'Average Speed', unit: 'km/h', desc: 'Used for travel time calculation' },
    { key: 'loading_time_minutes', label: 'Loading Time', unit: 'min', desc: 'Time spent loading at each pickup' },
    { key: 'unloading_time_minutes', label: 'Unloading Time', unit: 'min', desc: 'Time spent unloading at each destination' },
    { key: 'service_time_minutes', label: 'Service Time', unit: 'min', desc: 'Additional service time per stop' },
    { key: 'fuel_price_per_litre', label: 'Fuel Price', unit: '₹/L', desc: 'Current diesel price per litre' },
    { key: 'driver_cost_per_hour', label: 'Driver Cost', unit: '₹/h', desc: 'Driver hourly wage' },
    { key: 'operating_cost_per_km', label: 'Operating Cost', unit: '₹/km', desc: 'Maintenance and operating cost per km' },
    { key: 'toll_cost_per_km', label: 'Toll Cost', unit: '₹/km', desc: 'Average toll cost per km' },
    { key: 'service_cost', label: 'Service Cost', unit: '₹', desc: 'Fixed service cost per lorry' },
    { key: 'sla_penalty_per_late_shipment', label: 'SLA Penalty per Late Shipment', unit: '₹', desc: 'SLA penalty for each shipment delivered late' },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <SettingsIcon size={20} className="text-accent-400" />
          Optimization Settings
        </h2>
        <p className="text-sm text-gray-500">
          Configure parameters that affect travel time, fuel cost, and total transportation cost calculations.
        </p>
      </div>

      <div className="card p-4 bg-blue-500/5 border-blue-500/20">
        <div className="flex gap-3">
          <Info size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-400">
            Distance is calculated using the Haversine formula (great-circle distance × 1.3 road factor) as a documented fallback.
            Travel time = distance ÷ average speed + loading + unloading + service time. All changes affect the next optimization run.
          </p>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">{field.label}</label>
              <span className="text-xs text-gray-500">{field.unit}</span>
            </div>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form[field.key] as number}
              onChange={(e) => setForm({ ...form, [field.key]: Number(e.target.value) })}
            />
            <p className="text-xs text-gray-500 mt-1">{field.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} className="btn-primary">
          <Save size={16} />
          Save Settings
        </button>
        {saved && <span className="text-sm text-success-400 animate-fade-in">Settings saved!</span>}
      </div>
    </div>
  );
}
