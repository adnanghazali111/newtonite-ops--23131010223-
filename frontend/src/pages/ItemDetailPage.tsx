import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type WorkItem } from '../api';
import { useAuth } from '../auth';
import { PriorityBadge, StatusBadge, TypeBadge } from '../components/Badges';

const statusLabels: Record<string, string> = { Open: 'Open', InProgress: 'In progress', AwaitingApproval: 'Awaiting approval', Resolved: 'Resolved', Closed: 'Closed' };

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

  const itemQuery = useQuery({ queryKey: ['item', id], queryFn: () => api.getItem(id!), enabled: !!id });
  const commentsQuery = useQuery({ queryKey: ['comments', id], queryFn: () => api.getComments(id!), enabled: !!id });
  const activityQuery = useQuery({ queryKey: ['activity', id], queryFn: () => api.getActivity(id!), enabled: !!id });
  const item = itemQuery.data?.item;
  const role = user?.memberships.find((membership) => membership.teamId === item?.teamId)?.role;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['item', id] });
    queryClient.invalidateQueries({ queryKey: ['comments', id] });
    queryClient.invalidateQueries({ queryKey: ['activity', id] });
    queryClient.invalidateQueries({ queryKey: ['items'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleError = (err: Error & { status?: number }) => {
    if (err.status === 409) {
      setShowConflict(true);
      setError('This item changed while you were viewing it. Reloading the latest version…');
      window.setTimeout(() => { invalidateAll(); setShowConflict(false); setError(''); }, 1500);
      return;
    }
    setError(err.message || 'The action could not be completed.');
  };

  const claimMutation = useMutation({ mutationFn: () => api.claimItem(id!, item!.version), onSuccess: () => { invalidateAll(); setError(''); }, onError: handleError });
  const transitionMutation = useMutation({ mutationFn: ({ to, reason }: { to: string; reason?: string }) => api.transitionItem(id!, to, item!.version, reason), onSuccess: () => { invalidateAll(); setError(''); }, onError: handleError });
  const updateMutation = useMutation({ mutationFn: () => api.updateItem(id!, { title: editTitle, description: editDescription, priority: editPriority, version: item!.version }), onSuccess: () => { invalidateAll(); setIsEditing(false); setError(''); }, onError: handleError });
  const commentMutation = useMutation({ mutationFn: () => api.addComment(id!, commentBody), onSuccess: () => { setCommentBody(''); queryClient.invalidateQueries({ queryKey: ['comments', id] }); queryClient.invalidateQueries({ queryKey: ['activity', id] }); }, onError: handleError });

  const startEditing = () => {
    if (!item) return;
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditPriority(item.priority);
    setIsEditing(true);
    setError('');
  };

  if (itemQuery.isLoading) return <DetailSkeleton />;
  if (itemQuery.error) return <section className="ops-card-shadow rounded-[1.55rem] border border-[#f2b3a7] bg-[#fff7f3] p-8 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#ffe2da] text-xl">!</span><h1 className="mt-4 text-xl font-black text-[#3a2e2b]">This work item could not load.</h1><p className="mt-2 text-sm text-[#927268]">It may have moved outside your access or the connection is unavailable.</p><div className="mt-5 flex justify-center gap-2"><button onClick={() => itemQuery.refetch()} className="ops-primary-button text-xs">Retry</button><button onClick={() => navigate('/items')} className="ops-quiet-button text-xs">Back to queue</button></div></section>;
  if (!item) return null;

  const transitions = getAvailableTransitions(item, role, user?.id);
  const canTakeAction = transitions.length > 0 || canClaim(role, item);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><Link to="/items" className="inline-flex items-center gap-1 text-xs font-extrabold text-[#73816e] transition hover:text-[#2b3731]">← Back to work items</Link><span className="rounded-lg bg-[#f0f3eb] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.09em] text-[#72826f]">Version {item.version}</span></div>
      {showConflict && <div className="rounded-xl border border-[#f3d68c] bg-[#fff7df] px-4 py-3 text-xs font-bold text-[#8c681e]">This item changed while you were viewing it. Refreshing the latest details…</div>}
      {error && !showConflict && <div role="alert" className="rounded-xl border border-[#f6b4a7] bg-[#fff1ed] px-4 py-3 text-xs font-bold text-[#ad463a]">{error}</div>}

      <section className="ops-card-shadow overflow-hidden rounded-[1.55rem] border border-[#e4e3dc] bg-white">
        <div className="border-b border-[#ecece6] px-5 py-5 sm:px-7 sm:py-6">
          {isEditing ? (
            <div className="space-y-4"><div className="flex items-center justify-between"><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#8d968e]">Edit work item</p><button onClick={() => setIsEditing(false)} className="text-xs font-bold text-[#849088] hover:text-[#2c3731]">Cancel</button></div><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="ops-input text-lg font-black tracking-[-0.03em]" /><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="ops-input min-h-28 resize-y text-sm" rows={4} /><div className="flex flex-wrap items-center justify-between gap-3"><select value={editPriority} onChange={(event) => setEditPriority(event.target.value)} className="ops-input w-auto text-sm"><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option></select><button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !editTitle.trim()} className="ops-primary-button ops-lime-button text-xs">{updateMutation.isPending ? 'Saving…' : 'Save changes'}</button></div></div>
          ) : (
            <div className="flex flex-col justify-between gap-5 sm:flex-row"><div className="max-w-3xl"><div className="mb-3 flex flex-wrap items-center gap-2"><TypeBadge type={item.type} /><StatusBadge status={item.status} /><PriorityBadge priority={item.priority} /></div><h1 className="text-2xl font-black leading-tight tracking-[-0.05em] text-[#202b27] sm:text-3xl">{item.title}</h1>{item.description ? <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-[#66716a]">{item.description}</p> : <p className="mt-4 text-sm italic text-[#a1a8a2]">No additional context was provided.</p>}</div>{canEdit(role, user?.id, item) && <button onClick={startEditing} className="ops-quiet-button h-fit shrink-0 text-xs">✦ Edit item</button>}</div>
          )}
        </div>
        {!isEditing && <div className="grid divide-y divide-[#eeeeea] bg-[#fbfbf8] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"><Meta label="Team" value={item.teamName} /><Meta label="Assignee" value={item.assigneeName || 'Unassigned'} muted={!item.assigneeName} /><Meta label="Created by" value={item.creatorName} /><Meta label="Due date" value={item.dueAt ? new Date(item.dueAt).toLocaleString() : 'No due date'} muted={!item.dueAt} /></div>}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {canTakeAction && <section className="ops-card-shadow rounded-[1.55rem] border border-[#dfe7c8] bg-[#f4f9e8] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-[#2d3a31]">Next action</p><p className="mt-1 text-xs text-[#748176]">Actions are available according to your team role.</p></div>{canClaim(role, item) && <button onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending} className="ops-primary-button ops-lime-button text-xs">{claimMutation.isPending ? 'Claiming…' : 'Claim item'} <span>→</span></button>}</div>{transitions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{transitions.map((transition) => <button key={transition.to} onClick={() => { if (transition.to === 'InProgress' && item.status === 'AwaitingApproval') { const reason = window.prompt('Rejection reason (optional):'); transitionMutation.mutate({ to: transition.to, reason: reason || undefined }); } else transitionMutation.mutate({ to: transition.to }); }} disabled={transitionMutation.isPending} className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition disabled:opacity-50 ${transition.className}`}>{transitionMutation.isPending ? 'Updating…' : `${transition.icon} ${transition.label}`}</button>)}</div>}</section>}

          <section className="ops-card-shadow rounded-[1.55rem] border border-[#e4e3dc] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-[#29342f]">Discussion</h2><p className="mt-0.5 text-[11px] text-[#929a93]">{commentsQuery.data?.comments.length || 0} comment{commentsQuery.data?.comments.length === 1 ? '' : 's'}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eff5e2] text-sm">◌</span></div><div className="mt-5 space-y-4">{commentsQuery.isLoading ? <LineSkeleton count={2} /> : commentsQuery.error ? <InlineError message="Comments are unavailable right now." retry={() => commentsQuery.refetch()} /> : commentsQuery.data?.comments.length === 0 ? <p className="rounded-xl bg-[#fafaf6] px-4 py-5 text-center text-xs font-medium text-[#929a93]">No comments yet. Add context for the team below.</p> : commentsQuery.data?.comments.map((comment) => <article key={comment.id} className="border-b border-[#f0f0ea] pb-4 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold text-[#354039]">{comment.authorName}</p><time className="shrink-0 text-[10px] font-medium text-[#9ca29d]">{new Date(comment.createdAt).toLocaleString()}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#657069]">{comment.body}</p></article>)}</div>{role && role !== 'Viewer' && <form onSubmit={(event) => { event.preventDefault(); if (commentBody.trim()) commentMutation.mutate(); }} className="mt-6 border-t border-[#efeee8] pt-5"><label className="ops-label">Add a note</label><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} className="ops-input min-h-22 resize-y text-sm" rows={3} placeholder="Share an update, a decision, or useful context…" /><div className="mt-3 flex justify-end"><button type="submit" disabled={commentMutation.isPending || !commentBody.trim()} className="ops-primary-button text-xs">{commentMutation.isPending ? 'Posting…' : 'Post comment'}</button></div></form>}</section>
        </div>

        <aside className="ops-card-shadow h-fit rounded-[1.55rem] border border-[#e4e3dc] bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-[#29342f]">Activity</h2><p className="mt-0.5 text-[11px] text-[#929a93]">Immutable timeline</p></div><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f0f3eb] text-sm">⌁</span></div><div className="mt-5 space-y-5">{activityQuery.isLoading ? <LineSkeleton count={4} /> : activityQuery.error ? <InlineError message="Activity is unavailable." retry={() => activityQuery.refetch()} /> : activityQuery.data?.events.length === 0 ? <p className="rounded-xl bg-[#fafaf6] px-3 py-5 text-center text-xs text-[#929a93]">No activity has been recorded.</p> : activityQuery.data?.events.map((event) => <div key={event.id} className="relative flex gap-3 before:absolute before:bottom-[-20px] before:left-[15px] before:top-8 before:w-px before:bg-[#e9ebe4] last:before:hidden"><span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#eff5e2] text-xs text-[#63833d]">{activityIcon(event.eventType)}</span><div className="pb-1"><p className="text-[11px] leading-5 text-[#68736c]"><strong className="font-extrabold text-[#354039]">{event.actorName}</strong> {activityLabel(event.eventType, event.payload)}</p><time className="mt-0.5 block text-[10px] font-medium text-[#a0a69f]">{new Date(event.createdAt).toLocaleString()}</time></div></div>)}</div></aside>
      </div>
    </div>
  );
}

function Meta({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-[#a0a69f]">{label}</p><p className={`mt-1 truncate text-xs font-bold ${muted ? 'text-[#a1a8a1]' : 'text-[#49554e]'}`}>{value}</p></div>;
}

function InlineError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="rounded-xl bg-[#fff4f0] px-3 py-3 text-center text-xs font-semibold text-[#b65a4b]">{message} <button onClick={retry} className="ml-1 font-black underline">Retry</button></div>;
}

function LineSkeleton({ count }: { count: number }) {
  return <div className="animate-pulse space-y-3">{Array.from({ length: count }, (_, index) => <div key={index} className="h-12 rounded-xl bg-[#f0f1ec]" />)}</div>;
}

function canClaim(role: string | undefined, item: WorkItem) {
  return !!role && role !== 'Viewer' && !item.assigneeId && item.status === 'Open';
}

function canEdit(role: string | undefined, userId: string | undefined, item: WorkItem) {
  return !!role && role !== 'Viewer' && (role === 'Lead' || role === 'Admin' || item.createdBy === userId || item.assigneeId === userId);
}

function getAvailableTransitions(item: WorkItem, role: string | undefined, userId?: string) {
  if (!role || role === 'Viewer') return [] as Array<{ to: string; label: string; icon: string; className: string }>;
  if (item.status === 'Open') return [{ to: 'InProgress', label: 'Start work', icon: '▶', className: 'bg-[#fff0be] text-[#89631a] hover:bg-[#ffe695]' }];
  if (item.status === 'InProgress' && (role === 'Lead' || role === 'Admin' || item.assigneeId === userId)) return [{ to: 'AwaitingApproval', label: 'Submit for approval', icon: '↑', className: 'bg-[#ece4ff] text-[#6d5795] hover:bg-[#dfd2ff]' }];
  if (item.status === 'AwaitingApproval') {
    const options = [] as Array<{ to: string; label: string; icon: string; className: string }>;
    if ((role === 'Lead' || role === 'Admin') && item.createdBy !== userId) options.push({ to: 'Resolved', label: 'Approve', icon: '✓', className: 'bg-[#dff5e7] text-[#397755] hover:bg-[#c9edd6]' });
    if (role === 'Lead' || role === 'Admin') options.push({ to: 'InProgress', label: 'Return to work', icon: '↩', className: 'bg-[#ffe5de] text-[#b65749] hover:bg-[#ffd5ca]' });
    return options;
  }
  if (item.status === 'Resolved' && (role === 'Lead' || role === 'Admin' || item.createdBy === userId)) return [{ to: 'Closed', label: 'Close item', icon: '✓', className: 'bg-[#edf0ed] text-[#5d6961] hover:bg-[#e1e6e1]' }];
  return [];
}

function activityIcon(type: string) { return ({ created: '+', updated: '↗', claimed: '•', transition: '→', commented: '◌' }[type] || '•'); }

function activityLabel(type: string, payload: Record<string, unknown>) {
  if (type === 'transition') return `moved from ${statusLabels[payload.from as string] || payload.from} to ${statusLabels[payload.to as string] || payload.to}${payload.reason ? ` — “${payload.reason}”` : ''}`;
  return ({ created: 'created this item', updated: 'updated item details', claimed: 'claimed this item', commented: 'left a comment' }[type] || type);
}

function DetailSkeleton() {
  return <div className="animate-pulse space-y-5"><div className="h-5 w-32 rounded bg-[#e4e6de]" /><div className="h-72 rounded-[1.55rem] bg-[#e5e7df]" /><div className="grid gap-5 lg:grid-cols-[1fr_300px]"><div className="h-80 rounded-[1.55rem] bg-[#e5e7df]" /><div className="h-80 rounded-[1.55rem] bg-[#e5e7df]" /></div></div>;
}
