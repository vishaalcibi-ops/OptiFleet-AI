import { useState, useEffect } from 'react';
import { History, Eye, Activity } from 'lucide-react';
import { useStore } from '@/lib/store';
import { formatCurrency, formatNumber, formatTime, DeadlineBadge } from '@/components/Badges';
import { Modal } from '@/components/Modal';
import type { Assignment, RejectionReason, OptimizationRun } from '@/types';

export function AuditLog() {
  const { runs, loadRunHistory, loadRunDetails, auditLog, loadAuditLog } = useStore();
  const [activeTab, setActiveTab] = useState<'ACTIVITY' | 'OPTIMIZATION'>('ACTIVITY');
  const [selectedRun, setSelectedRun] = useState<OptimizationRun | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rejections, setRejections] = useState<RejectionReason[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRunHistory();
    loadAuditLog();
  }, [loadRunHistory, loadAuditLog]);

  const viewRun = async (run: OptimizationRun) => {
    setSelectedRun(run);
    setLoading(true);
    try {
      const details = await loadRunDetails(run.id);
      setAssignments(details.assignments);
      setRejections(details.rejections);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <History size={20} className="text-accent-400" />
          Audit Logs
        </h2>
        <p className="text-sm text-gray-500">Inspect system activity and past optimization runs.</p>
      </div>

      <div className="flex gap-4 border-b border-base-700/50 pb-2">
        <button
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'ACTIVITY' ? 'text-accent-400 border-b-2 border-accent-400' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('ACTIVITY')}
        >
          <Activity size={16} /> Activity Log
        </button>
        <button
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'OPTIMIZATION' ? 'text-accent-400 border-b-2 border-accent-400' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('OPTIMIZATION')}
        >
          <History size={16} /> Optimization Runs
        </button>
      </div>

      {activeTab === 'ACTIVITY' && (
      <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-base-800/50">
              <tr>
                <th className="table-header text-left px-4 py-3 w-[160px]">Timestamp</th>
                <th className="table-header text-left px-4 py-3 w-[160px]">Action</th>
                <th className="table-header text-left px-4 py-3 w-[100px]">Lorry</th>
                <th className="table-header text-left px-4 py-3 w-[100px]">Shipment</th>
                <th className="table-header text-left px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-700/40">
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    <Activity size={32} className="mx-auto mb-2 opacity-40" />
                    No activity logs yet. Actions will appear here.
                  </td>
                </tr>
              )}
              {auditLog.map((log) => (
                <tr key={log.id} className="hover:bg-base-800/30 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{log.created_at ? formatTime(log.created_at) : '-'}</td>
                  <td className="px-4 py-3 text-accent-400 text-sm font-semibold uppercase">{log.action || '-'}</td>
                  <td className="px-4 py-3 font-mono text-gray-300 text-sm">{log.lorry_id || '-'}</td>
                  <td className="px-4 py-3 font-mono text-gray-300 text-sm">{log.shipment_id || '-'}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{log.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'OPTIMIZATION' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-base-800/50">
              <tr>
                <th className="table-header text-left px-4 py-3">Run ID</th>
                <th className="table-header text-left px-4 py-3">Timestamp</th>
                <th className="table-header text-right px-4 py-3">Cost</th>
                <th className="table-header text-right px-4 py-3">Distance</th>
                <th className="table-header text-right px-4 py-3">Fuel</th>
                <th className="table-header text-center px-4 py-3">Assigned</th>
                <th className="table-header text-center px-4 py-3">Unassigned</th>
                <th className="table-header text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-700/40">
              {runs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <History size={32} className="mx-auto mb-2 opacity-40" />
                    No optimization runs yet. Run the optimizer to create audit records.
                  </td>
                </tr>
              )}
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-base-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{run.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{formatTime(run.created_at)}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(run.total_cost)}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{formatNumber(run.total_distance_km, 1)} km</td>
                  <td className="px-4 py-3 text-right text-gray-300">{formatNumber(run.total_fuel_litres, 1)} L</td>
                  <td className="px-4 py-3 text-center text-success-400">{run.assigned_shipments}</td>
                  <td className="px-4 py-3 text-center text-error-400">{run.unassigned_shipments}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => viewRun(run)} className="btn-ghost text-xs">
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selectedRun} onClose={() => setSelectedRun(null)} title="Run Details" size="xl">
        {selectedRun && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="kpi-card">
                <span className="text-xs text-gray-500 uppercase">Total Cost</span>
                <span className="text-lg font-bold text-accent-300">{formatCurrency(selectedRun.total_cost)}</span>
              </div>
              <div className="kpi-card">
                <span className="text-xs text-gray-500 uppercase">Distance</span>
                <span className="text-lg font-bold text-gray-100">{formatNumber(selectedRun.total_distance_km, 1)} km</span>
              </div>
              <div className="kpi-card">
                <span className="text-xs text-gray-500 uppercase">Fuel</span>
                <span className="text-lg font-bold text-gray-100">{formatNumber(selectedRun.total_fuel_litres, 1)} L</span>
              </div>
              <div className="kpi-card">
                <span className="text-xs text-gray-500 uppercase">Assigned / Unassigned</span>
                <span className="text-lg font-bold text-gray-100">{selectedRun.assigned_shipments} / {selectedRun.unassigned_shipments}</span>
              </div>
            </div>

            {loading ? (
              <p className="text-gray-500 text-center py-8">Loading...</p>
            ) : (
              <>
                {/* Assignments */}
                <div>
                  <h4 className="text-sm font-bold text-gray-200 mb-2">Assignments</h4>
                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-base-800/50">
                        <tr>
                          <th className="table-header text-left px-3 py-2">Lorry</th>
                          <th className="table-header text-left px-3 py-2">Shipment</th>
                          <th className="table-header text-center px-3 py-2">Seq</th>
                          <th className="table-header text-right px-3 py-2">Distance</th>
                          <th className="table-header text-right px-3 py-2">Fuel</th>
                          <th className="table-header text-right px-3 py-2">Cost</th>
                          <th className="table-header text-left px-3 py-2">ETA</th>
                          <th className="table-header text-center px-3 py-2">Deadline</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-base-700/40">
                        {assignments.map((a) => (
                          <tr key={a.id}>
                            <td className="px-3 py-2 font-mono text-accent-300 text-sm">{a.lorry_id}</td>
                            <td className="px-3 py-2 font-mono text-gray-300 text-sm">
                              {a.shipment_id}
                              {a.split_index && a.split_total ? (
                                <span className="text-[10px] text-blue-400 font-semibold block">
                                  Split ({a.split_index}/{a.split_total})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-400 text-sm">{a.delivery_sequence}</td>
                            <td className="px-3 py-2 text-right text-gray-300 text-sm">{formatNumber(a.distance_km, 1)} km</td>
                            <td className="px-3 py-2 text-right text-gray-300 text-sm">{formatNumber(a.fuel_litres, 1)} L</td>
                            <td className="px-3 py-2 text-right text-gray-300 text-sm">{formatCurrency(a.total_cost)}</td>
                            <td className="px-3 py-2 text-gray-400 text-sm">{formatTime(a.eta)}</td>
                            <td className="px-3 py-2 text-center"><DeadlineBadge status={a.deadline_status} /></td>
                          </tr>
                        ))}
                        {assignments.length === 0 && (
                          <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-500 text-sm">No assignments</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Rejections */}
                {rejections.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-error-400 mb-2">Rejected Assignments</h4>
                    <div className="card overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-base-800/50">
                          <tr>
                            <th className="table-header text-left px-3 py-2">Shipment</th>
                            <th className="table-header text-left px-3 py-2">Lorry</th>
                            <th className="table-header text-left px-3 py-2">Reason</th>
                            <th className="table-header text-left px-3 py-2">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-base-700/40">
                          {rejections.map((r) => (
                            <tr key={r.id}>
                              <td className="px-3 py-2 font-mono text-gray-300 text-sm">{r.shipment_id}</td>
                              <td className="px-3 py-2 font-mono text-gray-400 text-sm">{r.lorry_id}</td>
                              <td className="px-3 py-2 text-error-400 text-sm">{r.reason}</td>
                              <td className="px-3 py-2 text-gray-400 text-sm">{r.details}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
