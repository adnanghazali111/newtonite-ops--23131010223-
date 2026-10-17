const statusColors: Record<string, string> = {
  Open: 'bg-blue-100 text-blue-800',
  InProgress: 'bg-yellow-100 text-yellow-800',
  AwaitingApproval: 'bg-purple-100 text-purple-800',
  Resolved: 'bg-green-100 text-green-800',
  Closed: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<string, string> = {
  Open: 'Open',
  InProgress: 'In Progress',
  AwaitingApproval: 'Awaiting Approval',
  Resolved: 'Resolved',
  Closed: 'Closed',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
      {statusLabels[status] || status}
    </span>
  );
}

const priorityColors: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Medium: 'bg-blue-100 text-blue-700',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityColors[priority] || 'bg-gray-100 text-gray-600'}`}>
      {priority}
    </span>
  );
}

const typeIcons: Record<string, string> = {
  Task: '📌',
  Incident: '🔥',
  Request: '📩',
  Change: '🔄',
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-xs text-gray-500">
      {typeIcons[type] || '📌'} {type}
    </span>
  );
}
