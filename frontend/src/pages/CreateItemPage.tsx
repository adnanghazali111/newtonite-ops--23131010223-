import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';

export function CreateItemPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Task');
  const [priority, setPriority] = useState('Medium');
  const [teamId, setTeamId] = useState(user?.memberships.find((membership) => membership.role !== 'Viewer')?.teamId || '');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const creatableTeams = user?.memberships.filter((membership) => membership.role !== 'Viewer') || [];

  const createMutation = useMutation({
    mutationFn: () => api.createItem({ title: title.trim(), description: description.trim(), type, priority, teamId, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined }, `create-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/items/${data.item.id}`);
    },
    onError: (err: Error) => setError(err.message || 'The work item could not be created. Please try again.'),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!title.trim()) return setError('Give this work item a clear, specific title.');
    if (!teamId) return setError('Choose the team responsible for this item.');
    createMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-[940px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#8a958c]">Work items / new</p><h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-[#202b27] sm:text-4xl">Create a clear next step.</h1><p className="mt-2 text-sm text-[#78817b]">Give your team just enough context to take action confidently.</p></div>
        <button type="button" onClick={() => navigate(-1)} className="ops-quiet-button text-xs">← Back</button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_270px]">
        <form onSubmit={submit} className="ops-card-shadow rounded-[1.55rem] border border-[#e4e3dc] bg-white p-5 sm:p-7">
          <div className="mb-7 flex items-center gap-3 border-b border-[#efeee8] pb-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#202b27] text-lg font-black text-[#c7f36a]">+</span><div><h2 className="text-base font-black text-[#26312d]">Work item details</h2><p className="mt-0.5 text-[11px] text-[#909890]">Fields marked with an asterisk are required.</p></div></div>
          <div className="space-y-5">
            <label><span className="ops-label">Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="ops-input text-sm" maxLength={500} placeholder="What needs to happen?" required /></label>
            <label><span className="ops-label">Context</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="ops-input min-h-32 resize-y text-sm" rows={5} placeholder="Add useful context, the impact, or a short handoff note." /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="ops-label">Responsible team *</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="ops-input text-sm" required><option value="">Select a team</option>{creatableTeams.map((membership) => <option key={membership.teamId} value={membership.teamId}>{membership.teamName} · {membership.role}</option>)}</select></label>
              <label><span className="ops-label">Item type</span><select value={type} onChange={(event) => setType(event.target.value)} className="ops-input text-sm"><option value="Task">Task</option><option value="Incident">Incident</option><option value="Request">Request</option><option value="Change">Change</option></select></label>
              <label><span className="ops-label">Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)} className="ops-input text-sm"><option value="Low">Low — when time allows</option><option value="Medium">Medium — normal queue</option><option value="High">High — important</option><option value="Critical">Critical — immediate attention</option></select></label>
              <label><span className="ops-label">Due date</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="ops-input text-sm" /></label>
            </div>
          </div>
          {error && <div role="alert" className="mt-5 rounded-xl border border-[#f7b6aa] bg-[#fff1ed] px-4 py-3 text-xs font-semibold text-[#ad463a]">{error}</div>}
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[#efeee8] pt-5"><button type="submit" disabled={createMutation.isPending} className="ops-primary-button ops-lime-button text-sm">{createMutation.isPending ? 'Creating item…' : 'Create work item'} <span>→</span></button><button type="button" onClick={() => navigate(-1)} className="ops-quiet-button text-xs">Cancel</button></div>
        </form>

        <aside className="ops-card-shadow h-fit rounded-[1.55rem] border border-[#e2e3d9] bg-[#eef6dc] p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#c7f36a] text-lg text-[#263128]">✦</span><h2 className="mt-5 text-lg font-black tracking-[-0.03em] text-[#2c392f]">A good handoff is brief and useful.</h2><ul className="mt-4 space-y-3 text-xs font-medium leading-5 text-[#617063]"><li className="flex gap-2"><span className="font-black text-[#6e9c35]">01</span><span>Use a specific, action-led title.</span></li><li className="flex gap-2"><span className="font-black text-[#6e9c35]">02</span><span>Choose the team that owns the next move.</span></li><li className="flex gap-2"><span className="font-black text-[#6e9c35]">03</span><span>Set priority by operational impact, not urgency alone.</span></li></ul></aside>
      </div>
    </div>
  );
}
