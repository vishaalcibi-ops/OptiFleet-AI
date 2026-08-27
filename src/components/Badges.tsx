import type { Priority, DeadlineStatus, LorryStatus } from '@/types';

export function PriorityBadge({ priority }: { priority: Priority }) {
  const styles: Record<Priority, string> = {
    URGENT: 'bg-error-50 text-error-600 border border-error-200',
    HIGH: 'bg-warning-50 text-warning-600 border border-warning-200',
    MEDIUM: 'bg-lavender-50 text-lavender-700 border border-lavender-200',
    LOW: 'bg-base-800 text-gray-500 border border-base-700',
  };
  return <span className={`badge ${styles[priority]}`}>{priority}</span>;
}

export function DeadlineBadge({ status }: { status: DeadlineStatus }) {
  const styles: Record<DeadlineStatus, string> = {
    ON_TIME: 'bg-success-50 text-success-600 border border-success-200',
    LATE: 'bg-error-50 text-error-600 border border-error-200',
    AT_RISK: 'bg-warning-50 text-warning-600 border border-warning-200',
  };
  const labels: Record<DeadlineStatus, string> = {
    ON_TIME: 'ON TIME',
    LATE: 'LATE',
    AT_RISK: 'AT RISK',
  };
  return <span className={`badge ${styles[status]}`}>{labels[status]}</span>;
}

export function LorryStatusBadge({ status }: { status: LorryStatus }) {
  const styles: Record<LorryStatus, string> = {
    active: 'bg-success-50 text-success-600 border border-success-200',
    inactive: 'bg-base-800 text-gray-500 border border-base-700',
    maintenance: 'bg-warning-50 text-warning-600 border border-warning-200',
  };
  return <span className={`badge ${styles[status]}`}>{status.toUpperCase()}</span>;
}

export function formatCurrency(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

export function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    hour12: true,
  });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
