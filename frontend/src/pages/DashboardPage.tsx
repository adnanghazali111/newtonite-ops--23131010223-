import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/Badges';

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboardSummary,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <div className="text-red-600">Failed to load dashboard</div>;
  if (!data) return null;

  const cards = [
    { label: 'Assigned to Me', value: data.assignedToMe, color: 'bg-blue-50 text-blue-700 border-blue-200', icon: '👤' },
    { label: 'Unassigned Urgent', value: data.unassignedUrgent, color: 'bg-red-50 text-red-700 border-red-200', icon: '🔥' },
    { label: 'Awaiting My Approval', value: data.awaitingMyApproval, color: 'bg-purple-50 text-purple-700 border-purple-200', icon: '⏳' },
    { label: 'Open', value: data.totalOpen, color: 'bg-sky-50 text-sky-700 border-sky-200', icon: '📂' },
    { label: 'In Progress', value: data.totalInProgress, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: '⚙️' },
    { label: 'Resolved', value: data.totalResolved, color: 'bg-green-50 text-green-700 border-green-200', icon: '✅' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link
          to="/items/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Item
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className={`border rounded-xl p-4 ${card.color}`}>
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm opacity-80">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500">No recent activity</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.recentActivity.map((event) => (
              <Link
                key={event.id}
                to={`/items/${event.workItemId}`}
                className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="text-lg mt-0.5">{eventIcon(event.eventType)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{event.actorName}</span>{' '}
                    <span className="text-gray-500">{eventLabel(event.eventType)}</span>{' '}
                    <span className="font-medium">{event.workItemTitle}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
                {event.payload && 'status' in event.payload && (
                  <StatusBadge status={event.payload.status as string} />
                )}
                {event.payload && 'to' in event.payload && (
                  <StatusBadge status={event.payload.to as string} />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function eventIcon(type: string) {
  switch (type) {
    case 'created': return '🆕';
    case 'updated': return '✏️';
    case 'claimed': return '🙋';
    case 'transition': return '➡️';
    case 'commented': return '💬';
    default: return '📝';
  }
}

function eventLabel(type: string) {
  switch (type) {
    case 'created': return 'created';
    case 'updated': return 'updated';
    case 'claimed': return 'claimed';
    case 'transition': return 'transitioned';
    case 'commented': return 'commented on';
    default: return type;
  }
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-40 mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl p-4 h-24" />
        ))}
      </div>
      <div className="bg-gray-100 rounded-xl h-64" />
    </div>
  );
}
