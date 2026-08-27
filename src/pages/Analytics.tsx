import { BarChart3, TrendingDown, Fuel, Gauge, Route, Clock, Package, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/store';
import { formatCurrency } from '@/components/Badges';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';


// Shared, light-theme chart styling (no dark tooltip / dark grid lines)
const GRID_STROKE = '#E4E9F2';
const AXIS_STROKE = '#5C6B85';
const TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid #E4E9F2',
  borderRadius: '10px',
  color: '#0F1B2D',
  boxShadow: '0 8px 24px rgba(20, 60, 130, 0.12)',
};

export function Analytics() {
  const { currentResult, shipments, assignments, settings } = useStore();

  if (!currentResult || currentResult.plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <BarChart3 size={48} className="text-gray-600 mb-4" />
        <h3 className="text-xl font-bold text-gray-300 mb-2">No Analytics Data</h3>
        <p className="text-gray-500">Run an optimization to see analytics charts.</p>
      </div>
    );
  }

  // Cost by lorry
  const costByLorry = currentResult.plans.map((p) => ({
    name: p.lorry.lorry_id,
    cost: Math.round(p.total_cost),
    fuel: Math.round(p.total_fuel_cost),
    distance: Math.round(p.total_distance_km),
    fuelLitres: Math.round(p.total_fuel_litres * 10) / 10,
  }));

  // Capacity utilization
  const capacityData = currentResult.plans.map((p) => ({
    name: p.lorry.lorry_id,
    weight: Math.round((p.used_weight_kg / p.lorry.maximum_weight_capacity_kg) * 100),
    volume: Math.round((p.used_volume_m3 / p.lorry.maximum_volume_capacity_m3) * 100),
  }));

  // On-time vs late
  const onTimeData = [
    { name: 'On Time', value: currentResult.on_time_count, color: '#15803D' },
    { name: 'Late', value: currentResult.late_count, color: '#B91C1C' },
  ];

  // Shipments by priority
  const priorityCounts = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  shipments.forEach((s) => { priorityCounts[s.priority]++; });
  const priorityData = [
    { name: 'Urgent', value: priorityCounts.URGENT, color: '#B91C1C' },
    { name: 'High', value: priorityCounts.HIGH, color: '#F59E0B' },
    { name: 'Medium', value: priorityCounts.MEDIUM, color: '#B57EDC' },
    { name: 'Low', value: priorityCounts.LOW, color: '#94A3B8' },
  ];

  // Assigned vs unassigned
  const assignedData = [
    { name: 'Assigned', value: currentResult.assigned_count, color: '#15803D' },
    { name: 'Unassigned', value: currentResult.unassigned_count, color: '#B91C1C' },
  ];

  // Before vs after
  const beforeAfterData = currentResult.before_summary
    ? [
        { name: 'Before', distance: Math.round(currentResult.before_summary.distance_km), fuel: Math.round(currentResult.before_summary.fuel_litres), cost: Math.round(currentResult.before_summary.cost) },
        { name: 'After', distance: Math.round(currentResult.after_summary.distance_km), fuel: Math.round(currentResult.after_summary.fuel_litres), cost: Math.round(currentResult.after_summary.cost) },
      ]
    : [];

  const penalty = settings?.sla_penalty_per_late_shipment ?? 500;
  const lateAssignments = assignments.filter((a) => a.deadline_status === 'LATE');
  const slaPenaltyExposure = lateAssignments.length * penalty;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <BarChart3 size={20} className="text-accent-400" />
            Analytics
          </h2>
          <p className="text-sm text-gray-500">Charts derived from actual optimization calculations.</p>
        </div>
      </div>

      {/* SLA Penalty Exposure KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wider">SLA Penalty Exposure</span>
            <AlertTriangle size={16} className="text-error-400" />
          </div>
          <span className="text-2xl font-bold text-gray-100">{formatCurrency(slaPenaltyExposure)}</span>
          <p className="text-xs text-gray-500 mt-1">{lateAssignments.length} late assignments × {formatCurrency(penalty)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost by lorry */}
        <ChartCard title="Transportation Cost by Lorry" icon={TrendingDown}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costByLorry}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" stroke={AXIS_STROKE} fontSize={12} />
              <YAxis stroke={AXIS_STROKE} fontSize={12} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Cost']}
              />
              <Bar dataKey="cost" fill="#4DA6FF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Fuel consumption */}
        <ChartCard title="Fuel Consumption by Lorry" icon={Fuel}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costByLorry}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" stroke={AXIS_STROKE} fontSize={12} />
              <YAxis stroke={AXIS_STROKE} fontSize={12} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [`${value} L`, 'Fuel']}
              />
              <Bar dataKey="fuelLitres" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Distance by lorry */}
        <ChartCard title="Distance by Lorry" icon={Route}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costByLorry}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" stroke={AXIS_STROKE} fontSize={12} />
              <YAxis stroke={AXIS_STROKE} fontSize={12} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [`${value} km`, 'Distance']}
              />
              <Bar dataKey="distance" fill="#B57EDC" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Capacity utilization */}
        <ChartCard title="Capacity Utilization" icon={Gauge}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={capacityData}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" stroke={AXIS_STROKE} fontSize={12} />
              <YAxis stroke={AXIS_STROKE} fontSize={12} unit="%" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [`${value}%`, '']}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="weight" name="Weight %" fill="#4DA6FF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="volume" name="Volume %" fill="#B57EDC" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* On-time vs late */}
        <ChartCard title="On-Time vs Late" icon={Clock}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={onTimeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {onTimeData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Shipments by priority */}
        <ChartCard title="Shipments by Priority" icon={Package}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {priorityData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Assigned vs unassigned */}
        <ChartCard title="Assigned vs Unassigned" icon={CheckCircle2}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={assignedData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {assignedData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Before vs After */}
        {beforeAfterData.length > 0 && (
          <ChartCard title="Before vs After Optimization" icon={TrendingDown}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={beforeAfterData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" stroke={AXIS_STROKE} fontSize={12} />
                <YAxis stroke={AXIS_STROKE} fontSize={12} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="distance" name="Distance (km)" fill="#B57EDC" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fuel" name="Fuel (L)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Cost (₹)" fill="#4DA6FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: typeof BarChart3; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">
        <Icon size={16} className="text-accent-400" />
        {title}
      </h3>
      {children}
    </div>
  );
}
