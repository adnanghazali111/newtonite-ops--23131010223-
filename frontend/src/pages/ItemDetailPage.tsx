import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type WorkItem } from '../api';
import { useAuth } from '../auth';
import { StatusBadge, PriorityBadge, TypeBadge } from '../components/Badges';

const statusLabels: Record<string, string> = {
  Open: 'Open',
  InProgress: 'In Progress',
  AwaitingApproval: 'Awaiting Approval',
  Resolved: 'Resolved',
  Closed: 'Closed',
};

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [error, setError] = useState('');
  const [showConflict, setShowConflict] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('');

  const itemQuery = useQuery({
    queryKey: ['item', id],
    queryFn: () => api.getItem(id!),
    enabled: !!id,
  });

  const commentsQuery = useQuery({
    queryKey: ['comments', id],
    queryFn: () => api.getComments(id!),
    enabled: !!id,
  });

  const activityQuery = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api.getActivity(id!),
    enabled: !!id,
  });

  const item = itemQuery.data?.item;

  // User's role in this item's team
  const membership = user?.memberships.find(m => m.teamId === item?.teamId);
  const role = membership?.role;

  // ─── Mutations ────────────────────────────────────────────

  const handleError = (err: Error & { status?: number }) => {
    if (err.status === 409) {
      setShowConflict(true);
      setError('This item has been modified. Reloading...');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['item', id] });
        setShowConflict(false);
        setError('');
      }, 1500);
    } else if (err.status === 403) {
      setError(err.message || 'Permission denied');
    } else {
      setError(err.message || 'An error occurred');
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['item', id] });
    queryClient.invalidateQueries({ queryKey: ['activity', id] });
    queryClient.invalidateQueries({ queryKey: ['items'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const claimMutation = useMutation({
    mutationFn: () => api.claimItem(id!, item!.version),
    onSuccess: () => { invalidateAll(); setError(''); },
    onError: handleError,
  });

  const transitionMutation = useMutation({
    mutationFn: ({ to, reason }: { to: string; reason?: string }) =>
      api.transitionItem(id!, to, item!.version, reason),
    onSuccess: () => { invalidateAll(); setError(''); },
    onError: handleError,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateItem(id!, {
        title: editTitle,
        description: editDescription,
        priority: editPriority,
        version: item!.version,
      }),
    onSuccess: () => {
      invalidateAll();
      setIsEditing(false);
      setError('');
    },
    onError: handleError,
  });

  const commentMutation = useMutation({
    mutationFn: () => api.addComment(id!, commentBody),
    onSuccess: () => {
      setCommentBody('');
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      queryClient.invalidateQueries({ queryKey: ['activity', id] });
    },
    onError: handleError,
  });

  const startEditing = () => {
    if (item) {
      setEditTitle(item.title);
      setEditDescription(item.description);
      setEditPriority(item.priority);
      setIsEditing(true);
    }
  };

  if (itemQuery.isLoading) return <DetailSkeleton />;
  if (itemQuery.error) return (
    <div className="text-center py-12">
      <p className="text-red-600 mb-2">Failed to load item</p>
      <button onClick={() => navigate('/items')} className="text-blue-600 text-sm hover:underline">Back to items</button>
    </div>
  );
  if (!item) return null;

  // ─── Transition Buttons ────────────────────────────────────

  const transitions = getAvailableTransitions(item, role, user?.id);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Conflict banner */}
      {showConflict && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg mb-4 text-sm">
          ⚠️ This item changed while you were viewing it. Reloading to show the latest version...
        </div>
      )}

      {error && !showConflict && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        {isEditing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setIsEditing(false)} className="px-4 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h1>
                <div className="flex flex-wrap gap-2 items-center mb-3">
                  <StatusBadge status={item.status} />
                  <PriorityBadge priority={item.priority} />
                  <TypeBadge type={item.type} />
                  <span className="text-xs text-gray-400">v{item.version}</span>
                </div>
              </div>
              {canEdit(role, user?.id, item) && (
                <button
                  onClick={startEditing}
                  className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                >
                  ✏️ Edit
                </button>
              )}
            </div>

            {item.description && (
              <p className="text-gray-700 text-sm whitespace-pre-wrap mb-4">{item.description}</p>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Team</span>
                <p className="font-medium">{item.teamName}</p>
              </div>
              <div>
                <span className="text-gray-500">Assignee</span>
                <p className="font-medium">{item.assigneeName || <span className="text-gray-400">Unassigned</span>}</p>
              </div>
              <div>
                <span className="text-gray-500">Created by</span>
                <p className="font-medium">{item.creatorName}</p>
              </div>
              <div>
                <span className="text-gray-500">Created</span>
                <p className="font-medium">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
              {item.dueAt && (
                <div>
                  <span className="text-gray-500">Due</span>
                  <p className="font-medium">{new Date(item.dueAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {(transitions.length > 0 || canClaim(role, item)) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {canClaim(role, item) && (
              <button
                onClick={() => claimMutation.mutate()}
                disabled={claimMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {claimMutation.isPending ? 'Claiming...' : '🙋 Claim'}
              </button>
            )}
            {transitions.map((t) => (
              <button
                key={t.to}
                onClick={() => {
                  if (t.to === 'InProgress' && item.status === 'AwaitingApproval') {
                    const reason = prompt('Rejection reason (optional):');
                    transitionMutation.mutate({ to: t.to, reason: reason || undefined });
                  } else {
                    transitionMutation.mutate({ to: t.to });
                  }
                }}
                disabled={transitionMutation.isPending}
                className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${t.color}`}
              >
                {transitionMutation.isPending ? '...' : `${t.icon} ${t.label}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Comments ({commentsQuery.data?.comments.length || 0})</h3>

        {commentsQuery.data?.comments.map((comment) => (
          <div key={comment.id} className="border-b border-gray-50 pb-3 mb-3 last:border-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900">{comment.authorName}</span>
              <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
          </div>
        ))}

        {role && role !== 'Viewer' && (
          <form onSubmit={(e) => { e.preventDefault(); if (commentBody.trim()) commentMutation.mutate(); }} className="mt-4">
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={2}
              placeholder="Add a comment..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y mb-2"
            />
            <button
              type="submit"
              disabled={commentMutation.isPending || !commentBody.trim()}
              className="bg-gray-800 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {commentMutation.isPending ? 'Posting...' : 'Post Comment'}
            </button>
          </form>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Activity Timeline</h3>
        {activityQuery.data?.events.map((event) => (
          <div key={event.id} className="flex gap-3 mb-3 last:mb-0">
            <div className="text-lg">{activityIcon(event.eventType)}</div>
            <div className="flex-1">
              <p className="text-sm">
                <span className="font-medium text-gray-900">{event.actorName}</span>{' '}
                <span className="text-gray-500">{activityLabel(event.eventType, event.payload)}</span>
              </p>
              <p className="text-xs text-gray-400">{new Date(event.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function canClaim(role: string | undefined, item: WorkItem): boolean {
  if (!role || role === 'Viewer') return false;
  if (item.assigneeId) return false;
  if (item.status !== 'Open') return false;
  return true;
}

function canEdit(role: string | undefined, userId: string | undefined, item: WorkItem): boolean {
  if (!role || role === 'Viewer') return false;
  if (role === 'Lead' || role === 'Admin') return true;
  if (role === 'Member') return item.createdBy === userId || item.assigneeId === userId;
  return false;
}

interface TransitionOption {
  to: string;
  label: string;
  icon: string;
  color: string;
}

function getAvailableTransitions(item: WorkItem, role: string | undefined, userId?: string): TransitionOption[] {
  if (!role || role === 'Viewer') return [];
  const options: TransitionOption[] = [];

  switch (item.status) {
    case 'Open':
      if (role !== 'Viewer') {
        options.push({ to: 'InProgress', label: 'Start', icon: '▶️', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' });
      }
      break;
    case 'InProgress':
      if (role === 'Lead' || role === 'Admin' || (role === 'Member' && item.assigneeId === userId)) {
        options.push({ to: 'AwaitingApproval', label: 'Submit for Approval', icon: '📤', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200' });
      }
      break;
    case 'AwaitingApproval':
      if ((role === 'Lead' || role === 'Admin') && item.createdBy !== userId) {
        options.push({ to: 'Resolved', label: 'Approve', icon: '✅', color: 'bg-green-100 text-green-800 hover:bg-green-200' });
      }
      if (role === 'Lead' || role === 'Admin') {
        options.push({ to: 'InProgress', label: 'Reject', icon: '↩️', color: 'bg-red-100 text-red-800 hover:bg-red-200' });
      }
      break;
    case 'Resolved':
      if (role === 'Lead' || role === 'Admin' || (role === 'Member' && item.createdBy === userId)) {
        options.push({ to: 'Closed', label: 'Close', icon: '🏁', color: 'bg-gray-200 text-gray-800 hover:bg-gray-300' });
      }
      break;
  }

  return options;
}

function activityIcon(type: string) {
  switch (type) {
    case 'created': return '🆕';
    case 'updated': return '✏️';
    case 'claimed': return '🙋';
    case 'transition': return '➡️';
    case 'commented': return '💬';
    default: return '📝';
  }
}

function activityLabel(type: string, payload: Record<string, unknown>) {
  switch (type) {
    case 'created': return 'created this item';
    case 'updated': {
      const changes = payload.changes as Record<string, { from: string; to: string }>;
      if (changes) {
        const fields = Object.keys(changes);
        return `updated ${fields.join(', ')}`;
      }
      return 'updated this item';
    }
    case 'claimed': return 'claimed this item';
    case 'transition': {
      const from = statusLabels[payload.from as string] || payload.from;
      const to = statusLabels[payload.to as string] || payload.to;
      const reason = payload.reason ? ` — "${payload.reason}"` : '';
      return `changed status from ${from} to ${to}${reason}`;
    }
    case 'commented': return 'commented';
    default: return type;
  }
}


function DetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse space-y-4">
      <div className="bg-gray-100 rounded-xl h-48" />
      <div className="bg-gray-100 rounded-xl h-16" />
      <div className="bg-gray-100 rounded-xl h-32" />
      <div className="bg-gray-100 rounded-xl h-40" />
    </div>
  );
}
