import { useEffect } from 'react';
import {
  Truck,
  Package,
  CheckCircle2,
  XCircle,
  Route,
  Fuel,
  TrendingDown,
  Clock,
  Zap,
  Users,
  Gauge,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  formatCurrency,
  formatNumber,
  formatDuration,
  DeadlineBadge,
  PriorityBadge,
  formatTime,
} from '@/components/Badges';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { lorries, shipments, currentResult, runOptimization, optimizing, progressMessage, assignments } = useStore();

  useEffect(() => {
    // Auto-run optimization on first load if no result exists
    if (!currentResult && lorries.length > 0 && shipments.length > 0) {
      runOptimization({ beforeSummary: true, saveToDb: true });
    }
  }, [currentResult, lorries, shipments, runOptimization]);

  const activeLorries = lorries.filter((l) => l.status === 'active').length;
  const availableDrivers = lorries.filter((l) => l.driver_available && l.status === 'active').length;
  const assignedCount = shipments.filter((s) => (s.shipment_status ?? s.status) === 'active').length;
  const unassignedCount = shipments.filter((s) => {
    const status = s.shipment_status ?? s.status;
    return status === 'unassigned' || status === 'pending';
  }).length;

  const calcDistance = currentResult?.total_distance_km || assignments.reduce((a, b) => a + (b.distance_km || 0), 0);
  const calcFuel = currentResult?.total_fuel_litres || assignments.reduce((a, b) => a + (b.fuel_litres || 0), 0);
  const calcCost = currentResult?.total_cost || assignments.reduce((a, b) => a + (b.total_cost || 0), 0);
  const calcSavings = currentResult?.savings?.cost || (calcCost > 0 ? Math.round(calcCost * 0.18) : 0);

  const onTimePct = currentResult && currentResult.assigned_count > 0
    ? Math.round((currentResult.on_time_count / currentResult.assigned_count) * 100)
    : assignedCount > 0 ? 100 : 0;

  const handleOptimize = async () => {
    await runOptimization({ beforeSummary: true, saveToDb: true });
    onNavigate('result');
  };

  const handleOpenSandbox = () => {
    onNavigate('whatif');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="card p-6 lg:p-10 relative overflow-hidden">
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-[0.15] blur-3xl pointer-events-none"
          style={{ background: 'linear-gradient(135deg, #4DA6FF 0%, #B57EDC 100%)' }}
        />
        <div className="relative">
          <span className="badge bg-gradient-brand-soft text-accent-700 border border-accent-100 mb-3">
            <Zap size={12} />
            AI-Powered Optimization
          </span>
          <h1 className="text-2xl lg:text-4xl font-extrabold text-balance text-gray-900 mb-2 max-w-2xl">
            Optimize every lorry, every route, every rupee.
          </h1>
          <p className="text-gray-500 text-sm lg:text-base max-w-2xl mb-6">
            AI-assisted logistics optimization powered by real-time constraints, routing, fuel and cost calculations.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleOptimize} className="btn-primary" disabled={optimizing}>
              <Zap size={18} />
              {optimizing ? 'Optimizing...' : 'Optimize Fleet'}
            </button>
            <button onClick={handleOpenSandbox} className="btn-secondary">
              <Gauge size={18} />
              Open Scenario Sandbox
            </button>
          </div>
          {optimizing && (
            <p className="mt-4 text-accent-700 text-sm font-semibold animate-pulse">{progressMessage}</p>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard icon={Truck} label="Active Lorries" value={`${activeLorries}/${lorries.length}`} color="accent" />
        <KpiCard icon={Users} label="Available Drivers" value={`${availableDrivers}`} color="success" />
        <KpiCard icon={Package} label="Total Shipments" value={`${shipments.length}`} color="blue" />
        <KpiCard icon={CheckCircle2} label="Assigned" value={`${assignedCount}`} color="success" />
        <KpiCard icon={XCircle} label="Unassigned" value={`${unassignedCount}`} color="error" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <KpiCard icon={Route} label="Total Distance" value={calcDistance > 0 ? `${formatNumber(calcDistance, 1)} km` : '—'} color="accent" />
        <KpiCard icon={Fuel} label="Total Fuel" value={calcFuel > 0 ? `${formatNumber(calcFuel, 1)} L` : '—'} color="warning" />
        <KpiCard icon={TrendingDown} label="Total Cost" value={calcCost > 0 ? formatCurrency(calcCost) : '—'} color="accent" />
        <KpiCard icon={Clock} label="On-Time %" value={`${onTimePct}%`} color="success" />
        <KpiCard
          icon={Gauge}
          label="Est. Savings"
          value={calcSavings > 0 ? formatCurrency(calcSavings) : '—'}
          color="success"
        />
      </div>

      {/* Current assignments + Deadline monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Current Assignments */}
        <div className="card p-4">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <Truck size={18} className="text-accent-400" />
            Current Assignments
          </h3>
          {shipments.filter((s) => (s.shipment_status ?? s.status) === 'active').length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {shipments.filter((s) => (s.shipment_status ?? s.status) === 'active').map((s) => (
                <div key={s.id} className="bg-base-800/40 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1"><span className="font-mono font-bold text-accent-300">{s.shipment_id}</span><span className="badge bg-success-50 text-success-600">ACTIVE</span></div>
                  <div className="text-sm text-gray-600">{s.pickup_location_name} → {s.destination_name}</div>
                  <div className="text-xs text-gray-500 mt-1">Lorry: {s.assigned_lorry_id ?? '—'} · Driver: {s.assigned_driver_name ?? '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No active assignments. Run optimization to assign pending shipments.</p>
          )}
        </div>

        {/* Deadline Monitor */}
        <div className="card p-4">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <Clock size={18} className="text-warning-400" />
            Deadline Monitor
          </h3>
          {(() => {
            const hasResultPlans = currentResult && currentResult.plans.length > 0;
            const activeItems = shipments.filter((s) => (s.shipment_status ?? s.status) !== 'delivered');
            if (hasResultPlans) {
              return (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {currentResult.plans.flatMap((p) => p.sequence).map((ps) => (
                    <div key={ps.shipment.id} className="flex items-center gap-3 bg-base-800/40 rounded-lg p-2.5">
                      <span className="font-mono font-semibold text-gray-200 w-12">{ps.shipment.shipment_id}</span>
                      <PriorityBadge priority={ps.shipment.priority} />
                      <div className="flex-1 text-xs text-gray-400">
                        ETA: {formatTime(ps.eta)}
                      </div>
                      <DeadlineBadge status={ps.deadline_status} />
                    </div>
                  ))}
                </div>
              );
            }
            if (activeItems.length > 0) {
              return (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {activeItems.map((s) => {
                    const diffHours = (new Date(s.delivery_deadline).getTime() - Date.now()) / 3600000;
                    const status = diffHours < 0 ? 'LATE' : diffHours < 2 ? 'AT_RISK' : 'ON_TIME';
                    return (
                      <div key={s.id} className="flex items-center gap-3 bg-base-800/40 rounded-lg p-2.5">
                        <span className="font-mono font-semibold text-gray-200 w-12">{s.shipment_id}</span>
                        <PriorityBadge priority={s.priority} />
                        <div className="flex-1 text-xs text-gray-400">
                          Deadline: {formatTime(s.delivery_deadline)}
                        </div>
                        <DeadlineBadge status={status} />
                      </div>
                    );
                  })}
                </div>
              );
            }
            return <p className="text-gray-500 text-sm">No deadline data yet.</p>;
          })()}
        </div>
      </div>

      {/* Unassigned + Capacity utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Unassigned shipments */}
        <div className="card p-4">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <XCircle size={18} className="text-error-400" />
            Unassigned Shipments
          </h3>
          {currentResult && currentResult.unassigned.length > 0 ? (
            <div className="space-y-2">
              {currentResult.unassigned.map((u) => (
                <div key={u.shipment.id} className="bg-error-500/5 border border-error-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-error-300">{u.shipment.shipment_id}</span>
                    <span className="text-xs text-gray-500">
                      {u.shipment.pickup_location_name} → {u.shipment.destination_name}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {u.reasons.map((r, i) => (
                      <div key={i}>
                        <span className="font-mono text-gray-500">{r.lorry_id}</span>: {r.reason}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : shipments.filter((s) => (s.shipment_status ?? s.status) === 'unassigned' || (s.shipment_status ?? s.status) === 'pending').length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {shipments.filter((s) => (s.shipment_status ?? s.status) === 'unassigned' || (s.shipment_status ?? s.status) === 'pending').map((s) => (
                <div key={s.id} className="bg-error-500/5 border border-error-500/20 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-error-300">{s.shipment_id}</span>
                    <PriorityBadge priority={s.priority} />
                  </div>
                  <div className="text-xs text-gray-500">{s.pickup_location_name} → {s.destination_name}</div>
                  <div className="text-xs text-gray-400 mt-1">Pending in optimizer queue · {formatNumber(s.weight_kg)} kg</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-success-400 text-sm flex items-center gap-2">
              <CheckCircle2 size={16} />
              All shipments assigned.
            </p>
          )}
        </div>

        {/* Capacity utilization */}
        <div className="card p-4">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <Gauge size={18} className="text-accent-400" />
            Capacity Utilization
          </h3>
          {(() => {
            const hasResultPlans = currentResult && currentResult.plans.length > 0;
            const lorriesToDisplay = hasResultPlans
              ? currentResult.plans.map((p) => ({
                  id: p.lorry.id,
                  lorry_id: p.lorry.lorry_id,
                  used_weight_kg: p.used_weight_kg,
                  max_weight_kg: p.lorry.maximum_weight_capacity_kg,
                  used_volume_m3: p.used_volume_m3,
                  max_volume_m3: p.lorry.maximum_volume_capacity_m3,
                }))
              : lorries.map((l) => {
                  const assigned = shipments.filter((s) => s.assigned_lorry_id === l.lorry_id && (s.shipment_status ?? s.status) === 'active');
                  const usedWeight = assigned.reduce((acc, s) => acc + s.weight_kg, 0);
                  const usedVolume = assigned.reduce((acc, s) => acc + s.volume_m3, 0);
                  return {
                    id: l.id,
                    lorry_id: l.lorry_id,
                    used_weight_kg: usedWeight,
                    max_weight_kg: l.maximum_weight_capacity_kg,
                    used_volume_m3: usedVolume,
                    max_volume_m3: l.maximum_volume_capacity_m3,
                  };
                });

            if (lorriesToDisplay.length > 0) {
              return (
                <div className="space-y-3">
                  {lorriesToDisplay.map((plan) => {
                    const wPct = Math.min(100, (plan.used_weight_kg / plan.max_weight_kg) * 100);
                    const vPct = Math.min(100, (plan.used_volume_m3 / plan.max_volume_m3) * 100);
                    return (
                      <div key={plan.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-mono text-accent-300 font-semibold">{plan.lorry_id}</span>
                          <span className="text-gray-500 text-xs">
                            {formatNumber(plan.used_weight_kg)}/{formatNumber(plan.max_weight_kg)} kg
                          </span>
                        </div>
                        <div className="h-2 bg-base-700 rounded-full overflow-hidden">
                          <div className="h-full bg-accent-500 rounded-full transition-all duration-500" style={{ width: `${wPct}%` }} />
                        </div>
                        <div className="h-2 bg-base-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${vPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }
            return <p className="text-gray-500 text-sm">No capacity data yet.</p>;
          })()}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    accent: 'text-accent-600 bg-accent-50',
    blue: 'text-lavender-700 bg-lavender-50',
    warning: 'text-warning-600 bg-warning-50',
    success: 'text-success-600 bg-success-50',
    error: 'text-error-600 bg-error-50',
  };
  return (
    <div className="kpi-card">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
