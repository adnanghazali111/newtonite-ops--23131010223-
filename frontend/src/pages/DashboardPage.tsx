import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/Badges';

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboardSummary,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <section className="ops-card-shadow rounded-[1.5rem] border border-[#f2b3a7] bg-[#fff7f3] p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#ffe2da] text-xl">!</span>
        <h1 className="mt-4 text-xl font-black text-[#3a2e2b]">Your dashboard could not load.</h1>
        <p className="mt-2 text-sm text-[#927268]">Check the API connection and try again.</p>
        <button onClick={() => refetch()} className="ops-primary-button mt-5 text-xs">Retry dashboard</button>
      </section>
    );
  }

  if (!data) return null;

  const totalTracked = data.totalOpen + data.totalInProgress + data.totalResolved;
  const calendarDays = Array.from({ length: 30 }, (_, index) => index + 1);
  const activeDays = new Set([4, 8, 14, 18, 26]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#8a958c]">Operations pulse</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-[#202b27] sm:text-4xl">Good focus. Keep it moving.</h1>
          <p className="mt-2 text-sm text-[#78817b]">A clear view of the work needing attention today.</p>
        </div>
        <Link to="/items/new" className="ops-primary-button ops-lime-button text-xs"><span className="text-base">+</span> Create work item</Link>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="ops-grid relative overflow-hidden rounded-[1.55rem] bg-[#202b27] p-6 text-white sm:p-7">
          <div className="relative z-10 flex h-full flex-col justify-between gap-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#bdc7bd]">Today at a glance</p>
                <h2 className="mt-2 max-w-md text-2xl font-black leading-tight tracking-[-0.04em]">Stay ahead of work that blocks the team.</h2>
              </div>
              <span className="rounded-full bg-[#c7f36a] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.09em] text-[#1f2926]">Live</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <PulseMetric label="Assigned to me" value={data.assignedToMe} tone="lime" />
              <PulseMetric label="Urgent unassigned" value={data.unassignedUrgent} tone="coral" />
              <PulseMetric label="Needs approval" value={data.awaitingMyApproval} tone="cream" />
            </div>
          </div>
          <div className="absolute -bottom-20 -right-14 h-64 w-64 rounded-full bg-[#f9d456]/90 blur-[1px]" />
          <div className="absolute bottom-14 right-28 h-36 w-36 rounded-full bg-[#ff796b]/85 blur-[2px]" />
          <div className="absolute right-7 top-20 h-16 w-16 rounded-full border border-white/20" />
        </section>

        <section className="ops-card-shadow rounded-[1.55rem] border border-[#e5e4dd] bg-white p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-black text-[#26312d]">Work rhythm</p><p className="mt-0.5 text-[11px] font-medium text-[#909890]">This month</p></div>
            <span className="rounded-lg bg-[#f3f5eb] px-2 py-1 text-[10px] font-extrabold text-[#71806e]">Oct</span>
          </div>
          <div className="mt-5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-[#a0a6a0]">
            {'MTWTFSS'.split('').map((day, index) => <span key={`${day}-${index}`} className="pb-1">{day}</span>)}
            {calendarDays.map((day) => (
              <span key={day} className={`grid aspect-square place-items-center rounded-lg ${activeDays.has(day) ? 'bg-[#c7f36a] text-[#273128] shadow-[0_2px_0_#92bd3b]' : day === 21 ? 'border border-[#dfe2d9] text-[#354039]' : 'text-[#737d76]'}`}>{day}</span>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3 border-t border-[#f0f0eb] pt-4 text-[10px] font-semibold text-[#8b938c]">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#c7f36a]" />On track</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#ff907d]" />Urgent</span>
            <span className="ml-auto text-[#536159]">{totalTracked} tracked</span>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="ops-card-shadow rounded-[1.55rem] border border-[#e5e4dd] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-sm font-black text-[#26312d]">Workflow health</p><p className="mt-0.5 text-[11px] text-[#8d968e]">Work across your teams</p></div><Link to="/items" className="text-xs font-extrabold text-[#597b36] hover:text-[#253128]">View all →</Link></div>
          <div className="mt-7 space-y-5">
            <ProgressRow label="Open work" value={data.totalOpen} total={totalTracked} color="bg-[#c7f36a]" />
            <ProgressRow label="In progress" value={data.totalInProgress} total={totalTracked} color="bg-[#f9d456]" />
            <ProgressRow label="Resolved" value={data.totalResolved} total={totalTracked} color="bg-[#77c9a1]" />
          </div>
          <div className="mt-7 rounded-2xl bg-[#f3f5ed] p-4"><p className="text-[11px] font-bold leading-5 text-[#607067]">Keep the urgent queue small: unassigned High and Critical items are surfaced here before they become blockers.</p></div>
        </section>

        <section className="ops-card-shadow overflow-hidden rounded-[1.55rem] border border-[#e5e4dd] bg-white">
          <div className="flex items-center justify-between border-b border-[#efeee8] px-5 py-5 sm:px-6"><div><p className="text-sm font-black text-[#26312d]">Recent activity</p><p className="mt-0.5 text-[11px] text-[#8d968e]">The latest changes across your accessible teams</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f1f6e2] text-sm">⌁</span></div>
          {data.recentActivity.length === 0 ? (
            <div className="px-6 py-12 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#f2f4ec] text-xl">⌁</span><p className="mt-3 text-sm font-bold text-[#59645d]">No activity yet</p><p className="mt-1 text-xs text-[#98a098]">Create a work item to begin the operations timeline.</p></div>
          ) : (
            <div className="divide-y divide-[#f1f0eb]">
              {data.recentActivity.slice(0, 6).map((event) => (
                <Link key={event.id} to={`/items/${event.workItemId}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[#fbfdf5] sm:px-6">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#eef5df] text-sm">{eventIcon(event.eventType)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs text-[#5f6a64]"><strong className="font-extrabold text-[#28332e]">{event.actorName}</strong> {eventLabel(event.eventType)} <strong className="font-extrabold text-[#28332e]">{event.workItemTitle}</strong></span><span className="mt-1 block text-[10px] font-semibold text-[#9ba19b]">{new Date(event.createdAt).toLocaleString()}</span></span>
                  {'to' in event.payload && <StatusBadge status={event.payload.to as string} />}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PulseMetric({ label, value, tone }: { label: string; value: number; tone: 'lime' | 'coral' | 'cream' }) {
  const styles = { lime: 'bg-[#c7f36a] text-[#233027]', coral: 'bg-[#ff947f] text-[#442b27]', cream: 'bg-[#f8f4e7] text-[#374039]' };
  return <div className={`rounded-2xl p-4 ${styles[tone]}`}><p className="text-3xl font-black tracking-[-0.06em]">{String(value).padStart(2, '0')}</p><p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-70">{label}</p></div>;
}

function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = total ? Math.max((value / total) * 100, value ? 8 : 0) : 0;
  return <div><div className="mb-2 flex justify-between text-xs"><span className="font-bold text-[#5a655e]">{label}</span><span className="font-extrabold text-[#26312d]">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#eff0eb]"><div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} /></div></div>;
}

function eventIcon(type: string) {
  return ({ created: '+', updated: '↗', claimed: '•', transition: '→', commented: '◌' }[type] || '•');
}

function eventLabel(type: string) {
  return ({ created: 'created', updated: 'updated', claimed: 'claimed', transition: 'moved', commented: 'commented on' }[type] || type);
}

function DashboardSkeleton() {
  return <div className="animate-pulse space-y-5"><div className="h-20 w-80 max-w-full rounded-2xl bg-[#e7e7e0]" /><div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]"><div className="h-72 rounded-[1.55rem] bg-[#28332f]" /><div className="h-72 rounded-[1.55rem] bg-[#e7e7e0]" /></div><div className="grid gap-5 lg:grid-cols-2"><div className="h-72 rounded-[1.55rem] bg-[#e7e7e0]" /><div className="h-72 rounded-[1.55rem] bg-[#e7e7e0]" /></div></div>;
}
