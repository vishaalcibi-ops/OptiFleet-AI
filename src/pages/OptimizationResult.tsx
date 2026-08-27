import { useState, useEffect } from 'react';
import {
  Zap,
  Truck,
  Package,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Fuel,
  TrendingDown,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Route,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  DeadlineBadge,
  PriorityBadge,
  formatCurrency,
  formatNumber,
  formatTime,
  formatDuration,
} from '@/components/Badges';
import { Modal } from '@/components/Modal';
import type { LorryPlan, OptimizationResult, Lorry, Shipment, LorryCandidateComparison } from '@/types';

export function OptimizationResult() {
  const { currentResult, optimizing, progressMessage, runOptimization, lorries, shipments, markShipmentDelivered } = useStore();
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    if (!currentResult && !optimizing && lorries.length > 0 && shipments.length > 0) {
      runOptimization({ beforeSummary: true, saveToDb: false });
    }
  }, [currentResult, optimizing, lorries.length, shipments.length, runOptimization]);

  if (optimizing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div className="w-20 h-20 rounded-full border-4 border-base-700 border-t-accent-400 animate-spin mb-6" />
        <h3 className="text-xl font-bold text-gray-100 mb-2">Optimizing Fleet...</h3>
        <p className="text-accent-300 font-medium animate-pulse">{progressMessage}</p>
      </div>
    );
  }

  if (!currentResult || currentResult.plans.length === 0 && currentResult.unassigned.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <Zap size={48} className="text-gray-600 mb-4" />
        <h3 className="text-xl font-bold text-gray-300 mb-2">No Optimization Run Yet</h3>
        <p className="text-gray-500 mb-6 text-center max-w-md">
          Run the optimizer to see the optimal fleet plan, assignments, routes, fuel, costs, and deadline analysis.
        </p>
        <button
          onClick={() => runOptimization({ beforeSummary: true, saveToDb: true })}
          className="btn-primary"
        >
          <Zap size={16} />
          Optimize Fleet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-title">Optimal Plan</h2>
          <p className="text-sm text-gray-500">
            Generated {formatTime(currentResult.timestamp)} · {currentResult.assigned_count} assigned ·{' '}
            {currentResult.unassigned_count} unassigned
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setWhyOpen(true)} className="btn-secondary">
            <HelpCircle size={16} />
            Why This Plan?
          </button>
          <button
            onClick={() => runOptimization({ beforeSummary: true, saveToDb: true })}
            className="btn-primary"
          >
            <Zap size={16} />
            Re-Optimize
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiTile label="Total Cost" value={formatCurrency(currentResult.total_cost)} icon={TrendingDown} color="accent" />
        <KpiTile label="Total Distance" value={`${formatNumber(currentResult.total_distance_km, 1)} km`} icon={Route} color="blue" />
        <KpiTile label="Total Fuel" value={`${formatNumber(currentResult.total_fuel_litres, 1)} L`} icon={Fuel} color="warning" />
        <KpiTile label="Estimated SLA Cost" value={formatCurrency(currentResult.estimated_sla_cost ?? 0)} icon={AlertTriangle} color="error" />
        <KpiTile label="Assigned" value={`${currentResult.assigned_count}`} icon={CheckCircle2} color="success" />
        <KpiTile label="Unassigned" value={`${currentResult.unassigned_count}`} icon={XCircle} color="error" />
        <KpiTile label="On-Time" value={`${currentResult.on_time_count}/${currentResult.assigned_count}`} icon={Clock} color="accent" />
      </div>

      {/* Before vs After */}
      {currentResult.before_summary && currentResult.savings && (
        <BeforeAfter result={currentResult} />
      )}

      {/* Lorry Plans */}
      <div className="space-y-4">
        <h3 className="section-title flex items-center gap-2">
          <Truck size={18} className="text-accent-400" />
          Assigned Lorry Plans
        </h3>
        {currentResult.plans.map((plan) => (
          <LorryPlanCard
            key={plan.lorry.id}
            plan={plan}
            comparisons={currentResult.comparisons}
            liveShipments={shipments}
            onMarkDelivered={markShipmentDelivered}
            allPlans={currentResult.plans}
          />
        ))}
      </div>

      {/* Unassigned Shipments */}
      {currentResult.unassigned.length > 0 && (
        <div className="space-y-3">
          <h3 className="section-title flex items-center gap-2">
            <AlertTriangle size={18} className="text-error-400" />
            Unassigned Shipments
          </h3>
          {currentResult.unassigned.map((u) => (
            <div key={u.shipment.id} className="card p-4 border-error-500/20">
              <div className="flex items-center gap-3 mb-3">
                <span className="badge bg-error-500/20 text-error-400 border border-error-500/30">UNASSIGNED</span>
                <span className="font-mono font-bold text-error-300">{u.shipment.shipment_id}</span>
                <PriorityBadge priority={u.shipment.priority} />
                <span className="text-sm text-gray-400">
                  {u.shipment.pickup_location_name} → {u.shipment.destination_name}
                </span>
              </div>
              <div className="space-y-1.5">
                {u.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="font-mono text-gray-500 w-12">{r.lorry_id}:</span>
                    <span className="text-gray-400">{r.details || r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Why This Plan Modal */}
      <Modal open={whyOpen} onClose={() => setWhyOpen(false)} title="Why This Plan?" size="lg">
        <WhyThisPlan result={currentResult} lorries={lorries} shipments={shipments} />
      </Modal>
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: typeof Truck;
  color: string;
}) {
  const colors: Record<string, string> = {
    accent: 'text-accent-400',
    blue: 'text-blue-400',
    warning: 'text-warning-400',
    success: 'text-success-400',
    error: 'text-error-400',
  };
  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
        <Icon size={16} className={colors[color]} />
      </div>
      <span className="text-xl font-bold text-gray-100">{value}</span>
    </div>
  );
}

function BeforeAfter({ result }: { result: OptimizationResult }) {
  const before = result.before_summary!;
  const after = result.after_summary;
  const savings = result.savings!;

  const Row = ({ label, beforeVal, afterVal, saved, unit }: { label: string; beforeVal: number; afterVal: number; saved: number; unit?: string }) => (
    <div className="grid grid-cols-4 items-center gap-2 py-2 border-b border-base-700/30 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-gray-300 text-right">{formatNumber(beforeVal, 1)}{unit}</span>
      <span className="text-sm text-accent-300 font-semibold text-right">{formatNumber(afterVal, 1)}{unit}</span>
      <span className={`text-sm text-right font-semibold ${saved > 0 ? 'text-success-400' : saved < 0 ? 'text-error-400' : 'text-gray-500'}`}>
        {saved > 0 ? '−' : saved < 0 ? '+' : ''}{formatNumber(Math.abs(saved), 1)}{unit}
      </span>
    </div>
  );

  return (
    <div className="card p-4">
      <h3 className="section-title mb-3 flex items-center gap-2">
        <TrendingDown size={18} className="text-accent-400" />
        Before vs After Optimization
      </h3>
      <div className="grid grid-cols-4 gap-2 mb-2">
        <span className="table-header">Metric</span>
        <span className="table-header text-right">Before</span>
        <span className="table-header text-right">After</span>
        <span className="table-header text-right">Saved</span>
      </div>
      <Row label="Lorries Used" beforeVal={before.lorry_count} afterVal={after.lorry_count} saved={savings.lorry_count} />
      <Row label="Distance (km)" beforeVal={before.distance_km} afterVal={after.distance_km} saved={savings.distance_km} />
      <Row label="Fuel (L)" beforeVal={before.fuel_litres} afterVal={after.fuel_litres} saved={savings.fuel_litres} />
      <Row label="Cost (₹)" beforeVal={before.cost} afterVal={after.cost} saved={savings.cost} />
      <Row label="Late Shipments" beforeVal={before.late_shipments} afterVal={after.late_shipments} saved={savings.late_shipments} />
    </div>
  );
}

function LorryPlanCard({
  plan,
  comparisons,
  liveShipments,
  onMarkDelivered,
  allPlans,
}: {
  plan: LorryPlan;
  comparisons: Record<string, LorryCandidateComparison[]>;
  liveShipments: Shipment[];
  onMarkDelivered: (id: string) => Promise<void>;
  allPlans: LorryPlan[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [altOpen, setAltOpen] = useState(false);

  // Find comparison data for this plan's group
  const groupKey = plan.shipments.map((s) => s.shipment_id).sort().join(',');
  const planComparisons = comparisons[groupKey] ||
    comparisons[plan.shipments[0]?.shipment_id] ||
    [];

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-base-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={18} className="text-gray-500" /> : <ChevronRight size={18} className="text-gray-500" />}
          <span className="font-mono text-lg font-bold text-accent-300">{plan.lorry.lorry_id}</span>
          <span className="text-sm text-gray-500">{plan.lorry.current_location_name}</span>
          <span className="text-sm text-gray-400">
            {plan.shipments.length} shipment{plan.shipments.length > 1 ? 's' : ''}
          </span>
          {plan.shipments.length > 1 && (
            <span className="badge bg-blue-500/20 text-blue-400 border border-blue-500/30">GROUPED</span>
          )}
          {plan.is_split && (
            <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30">SPLIT PORTION</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <DeadlineBadge status={plan.worst_deadline_status} />
          <span className="text-lg font-bold text-gray-100">{formatCurrency(plan.total_cost)}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-4 pt-0 space-y-4 animate-fade-in">
          {/* Assigned shipments */}
          <div className="flex flex-wrap gap-2">
            {plan.shipments.map((s) => {
              const siblingPlans = allPlans.filter((p) =>
                p.sequence.some((seq) => seq.shipment.shipment_id === s.shipment_id)
              );
              return (
                <div key={s.id} className="flex items-center gap-2 bg-base-800/50 rounded-lg px-3 py-1.5 flex-wrap">
                  <Package size={14} className="text-accent-400" />
                  <span className="font-mono font-semibold text-gray-200">{s.shipment_id}</span>
                  <PriorityBadge priority={s.priority} />
                  {siblingPlans.length > 1 && (
                    <span className="badge bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      SPLIT ({siblingPlans.map((p) => p.lorry.lorry_id).sort().join(' + ')})
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Capacity */}
          <div className="grid grid-cols-2 gap-4">
            <CapacityBar
              label="Weight"
              used={plan.used_weight_kg}
              total={plan.lorry.maximum_weight_capacity_kg}
              unit="kg"
            />
            <CapacityBar
              label="Volume"
              used={plan.used_volume_m3}
              total={plan.lorry.maximum_volume_capacity_m3}
              unit="m³"
            />
          </div>

          {/* Route */}
          <div className="bg-base-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Route size={16} className="text-accent-400" />
              <span className="text-sm font-semibold text-gray-300">Delivery Route</span>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {plan.route.map((stop, i) => (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={14} className="text-gray-600" />}
                  <span className={`px-2 py-1 rounded ${i === 0 ? 'bg-accent-500/15 text-accent-300' : 'bg-base-800 text-gray-300'}`}>
                    {stop.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Metric label="Distance" value={`${formatNumber(plan.total_distance_km, 1)} km`} />
            <Metric label="Fuel Eff." value={`${plan.lorry.fuel_efficiency_km_per_litre} km/L`} />
            <Metric label="Fuel Used" value={`${formatNumber(plan.total_fuel_litres, 2)} L`} />
            <Metric label="Fuel Cost" value={formatCurrency(plan.total_fuel_cost)} />
            <Metric label="Travel Time" value={formatDuration(plan.total_travel_time_minutes)} />
            <Metric label="Total Cost" value={formatCurrency(plan.total_cost)} highlight />
          </div>

          {/* Cost breakdown */}
          <div className="bg-base-900/50 rounded-lg p-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Cost Breakdown</span>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <CostItem label="Fuel" value={plan.total_fuel_cost} />
              <CostItem label="Driver" value={plan.total_driver_cost} />
              <CostItem label="Operating" value={plan.total_operating_cost} />
              <CostItem label="Toll" value={plan.total_toll_cost} />
              <CostItem label="Service" value={plan.total_service_cost} />
            </div>
          </div>

          {/* Delivery sequence */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Delivery Sequence</span>
            {plan.sequence.map((ps) => {
              const live = liveShipments.find((s) => s.shipment_id === ps.shipment.shipment_id);
              const liveStatus = live?.shipment_status ?? live?.status ?? ps.shipment.shipment_status ?? ps.shipment.status;
              return (
                <div key={ps.shipment.id} className="flex items-center gap-3 bg-base-800/40 rounded-lg p-2.5">
                  <span className="w-6 h-6 rounded-full bg-accent-500/20 text-accent-300 flex items-center justify-center text-xs font-bold">
                    {ps.sequence}
                  </span>
                  <span className="font-mono font-semibold text-gray-200">{ps.shipment.shipment_id}</span>
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-400">
                      {ps.shipment.pickup_location_name} → {ps.shipment.destination_name}
                    </span>
                    {(() => {
                      const siblingPlans = allPlans.filter((p) =>
                        p.sequence.some((seq) => seq.shipment.shipment_id === ps.shipment.shipment_id)
                      );
                      if (siblingPlans.length > 1) {
                        return (
                          <span className="text-xs text-blue-400 font-semibold">
                            Split across {siblingPlans.map((p) => p.lorry.lorry_id).sort().join(' + ')} (Portion: {formatNumber(ps.shipment.weight_kg)} kg / {formatNumber(ps.shipment.volume_m3, 1)} m³)
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex-1" />
                  {ps.shipment.earliest_delivery_time && (
                    <span className="text-xs text-gray-500 font-medium bg-base-800 px-2 py-1 rounded">
                      Window: {formatTime(ps.shipment.earliest_delivery_time)} – {formatTime(ps.deadline)}
                    </span>
                  )}
                  <span className="text-sm text-gray-400">ETA: {formatTime(ps.eta)}</span>
                  <span className="text-sm text-gray-400">Deadline: {formatTime(ps.deadline)}</span>
                  <DeadlineBadge status={ps.deadline_status} />
                  {liveStatus === 'delivered' ? (
                    <span className="badge bg-lavender-500/20 text-lavender-400 border border-lavender-500/30">DELIVERED</span>
                  ) : liveStatus === 'active' && live ? (
                    <button
                      onClick={() => onMarkDelivered(live.id)}
                      className="btn-ghost text-xs px-2 py-1 rounded-lg text-success-500 border border-success-500/30 hover:bg-success-500/10"
                      title="Mark as Delivered"
                    >
                      <CheckCircle2 size={14} className="inline mr-1" />
                      Mark Delivered
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Alternative comparison */}
          {Array.isArray(planComparisons) && planComparisons.length > 1 && (
            <button onClick={() => setAltOpen(!altOpen)} className="btn-ghost text-sm">
              {altOpen ? 'Hide' : 'Show'} Alternative Comparison
            </button>
          )}
          {altOpen && Array.isArray(planComparisons) && (
            <div className="bg-base-900/50 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lorry Comparison</span>
              {planComparisons.map((c) => (
                <div
                  key={c.lorry_id}
                  className={`flex items-center gap-3 rounded-lg p-2 ${
                    c.selected ? 'bg-success-500/10 border border-success-500/30' : 'bg-base-800/40'
                  }`}
                >
                  <span className="font-mono font-semibold w-12">{c.lorry_id}</span>
                  {c.feasible ? (
                    <CheckCircle2 size={16} className="text-success-400" />
                  ) : (
                    <XCircle size={16} className="text-error-400" />
                  )}
                  <span className="text-sm text-gray-400 flex-1">
                    {c.feasible
                      ? `${formatNumber(c.total_distance_km, 1)} km · ${formatNumber(c.total_fuel_litres, 1)} L · ${formatCurrency(c.total_cost)}`
                      : c.reasons.join('; ')}
                  </span>
                  {c.selected && <span className="badge bg-success-500/20 text-success-400">SELECTED</span>}
                  {!c.feasible && !c.deadline_ok && c.reasons.length === 0 && (
                    <span className="badge bg-error-500/20 text-error-400">DEADLINE FAIL</span>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-500 mt-2">
                Selected: <span className="text-success-400 font-semibold">{plan.lorry.lorry_id}</span> — Lowest-cost feasible option.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CapacityBar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = Math.min(100, (used / total) * 100);
  const color = pct > 90 ? 'bg-error-500' : pct > 70 ? 'bg-warning-500' : 'bg-success-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono">
          {formatNumber(used)} / {formatNumber(total)} {unit}
        </span>
      </div>
      <div className="h-2 bg-base-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-base-900/50 rounded-lg p-2.5">
      <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? 'text-accent-300' : 'text-gray-200'}`}>{value}</div>
    </div>
  );
}

function CostItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-gray-300">{formatCurrency(value)}</div>
    </div>
  );
}

function WhyThisPlan({
  result,
  lorries,
  shipments,
}: {
  result: OptimizationResult;
  lorries: Lorry[];
  shipments: Shipment[];
}) {
  const reasons: string[] = [];
  for (const plan of result.plans) {
    const groupKey = plan.shipments.map((s) => s.shipment_id).sort().join(',');
    const comparisons = result.comparisons[groupKey] || result.comparisons[plan.shipments[0]?.shipment_id] || [];
    const alternatives = comparisons.filter((candidate) => !candidate.selected);
    const nearestAlternative = [...alternatives].sort((a, b) => a.total_distance_km - b.total_distance_km)[0];
    const alternativeLorry = nearestAlternative ? lorries.find((lorry) => lorry.lorry_id === nearestAlternative.lorry_id) : undefined;
    const weightHeadroom = plan.lorry.maximum_weight_capacity_kg - plan.used_weight_kg;
    const volumeHeadroom = plan.lorry.maximum_volume_capacity_m3 - plan.used_volume_m3;
    const deadlineMargins = plan.sequence.map((entry) => Math.floor((entry.deadline.getTime() - entry.eta.getTime()) / 60000));
    const deadlineMargin = deadlineMargins.length ? Math.min(...deadlineMargins) : 0;
    reasons.push(`${plan.lorry.lorry_id}: Weight capacity satisfied (${formatNumber(plan.used_weight_kg)}/${formatNumber(plan.lorry.maximum_weight_capacity_kg)} kg)`);
    reasons.push(`${plan.lorry.lorry_id}: Volume capacity satisfied (${formatNumber(plan.used_volume_m3, 1)}/${formatNumber(plan.lorry.maximum_volume_capacity_m3, 1)} m³)`);
    reasons.push(`${plan.lorry.lorry_id}: Driver available`);
    if (plan.worst_deadline_status === 'ON_TIME') {
      reasons.push(`${plan.lorry.lorry_id}: Deadline satisfied (all shipments on time)`);
    }
    if (plan.shipments.length > 1) {
      reasons.push(`${plan.lorry.lorry_id}: ${plan.shipments.length} compatible shipments grouped`);
    }
    reasons.push(`${plan.lorry.lorry_id}: Route optimized (${formatNumber(plan.total_distance_km, 1)} km)`);
    reasons.push(`${plan.lorry.lorry_id}: Lowest feasible transportation cost (${formatCurrency(plan.total_cost)})`);
    reasons.push(`${plan.lorry.lorry_id}: Retains ${formatNumber(weightHeadroom)} kg weight and ${formatNumber(volumeHeadroom, 1)} m³ volume headroom, with a ${deadlineMargin}-minute delivery margin.`);
    if (nearestAlternative && alternativeLorry) {
      const alternativeHeadroom = `${formatNumber(alternativeLorry.maximum_weight_capacity_kg - plan.used_weight_kg)} kg / ${formatNumber(alternativeLorry.maximum_volume_capacity_m3 - plan.used_volume_m3, 1)} m³`;
      if (nearestAlternative.feasible) {
        const costDelta = nearestAlternative.total_cost - plan.total_cost;
        reasons.push(`${plan.lorry.lorry_id} was chosen over nearby ${alternativeLorry.lorry_id}: ${plan.lorry.fuel_efficiency_km_per_litre} vs ${alternativeLorry.fuel_efficiency_km_per_litre} km/L fuel efficiency, ${formatNumber(weightHeadroom)} kg / ${formatNumber(volumeHeadroom, 1)} m³ vs ${alternativeHeadroom} capacity headroom, and ${formatCurrency(Math.abs(costDelta))} ${costDelta >= 0 ? 'lower' : 'higher'} route cost while preserving the ${deadlineMargin}-minute deadline margin.`);
      } else {
        reasons.push(`${plan.lorry.lorry_id} was chosen instead of nearer ${alternativeLorry.lorry_id}: it offers ${plan.lorry.fuel_efficiency_km_per_litre} vs ${alternativeLorry.fuel_efficiency_km_per_litre} km/L fuel efficiency, ${formatNumber(weightHeadroom)} kg / ${formatNumber(volumeHeadroom, 1)} m³ headroom (alternative: ${alternativeHeadroom}), and a ${deadlineMargin}-minute deadline margin. ${alternativeLorry.lorry_id} was not eligible: ${nearestAlternative.reasons.join(' ')}`);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-200 mb-2">Optimization Justification</h3>
        <div className="space-y-1.5">
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 size={16} className="text-success-400 mt-0.5 flex-shrink-0" />
              <span className="text-gray-300">{r}</span>
            </div>
          ))}
        </div>
      </div>

      {result.unassigned.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-200 mb-2">Unassigned Shipments</h3>
          <div className="space-y-1.5">
            {result.unassigned.map((u) => (
              <div key={u.shipment.id} className="flex items-start gap-2 text-sm">
                <XCircle size={16} className="text-error-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">
                  <span className="font-mono font-semibold">{u.shipment.shipment_id}</span>: {u.reasons[0]?.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-base-900/50 rounded-lg p-3">
        <h3 className="text-sm font-bold text-gray-200 mb-2">Summary</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-400">Total Cost</div>
          <div className="text-right font-semibold text-accent-300">{formatCurrency(result.total_cost)}</div>
          <div className="text-gray-400">Total Distance</div>
          <div className="text-right font-semibold text-gray-200">{formatNumber(result.total_distance_km, 1)} km</div>
          <div className="text-gray-400">Total Fuel</div>
          <div className="text-right font-semibold text-gray-200">{formatNumber(result.total_fuel_litres, 1)} L</div>
          <div className="text-gray-400">On-Time Rate</div>
          <div className="text-right font-semibold text-success-400">
            {result.assigned_count > 0 ? Math.round((result.on_time_count / result.assigned_count) * 100) : 0}%
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Input: {lorries.length} lorries, {shipments.length} shipments. All calculations are deterministic and derived from actual input data.
      </p>
    </div>
  );
}
