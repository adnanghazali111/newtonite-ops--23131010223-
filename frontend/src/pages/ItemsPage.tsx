import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge, PriorityBadge, TypeBadge } from '../components/Badges';
import { useAuth } from '../auth';
import { WorkItemSuggestions } from '../components/WorkItemSuggestions';

export function ItemsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const filters: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    if (value) filters[key] = value;
  }
  if (!filters.limit) filters.limit = '25';

  useEffect(() => {
    setSearchInput(searchParams.get('q') || '');
  }, [searchParams]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['items', filters],
    queryFn: () => api.getItems(filters),
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({});
  };

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    setFilter('q', searchInput.trim());
  };

  const showNextPage = () => {
    if (!data?.nextCursor) return;
    const next = new URLSearchParams(searchParams);
    next.set('cursor', data.nextCursor);
    setSearchParams(next);
  };

  const hasFilters = [...searchParams.keys()].some((key) => key !== 'cursor');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#8a958c]">Workspace / work items</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-[#202b27] sm:text-4xl">Work that keeps things moving.</h1>
          <p className="mt-2 text-sm text-[#78817b]">Search, filter, and act on the operational queue.</p>
        </div>
        <Link to="/items/new" className="ops-primary-button ops-lime-button text-xs"><span className="text-base">+</span> New work item</Link>
      </header>

      <section className="ops-card-shadow rounded-[1.45rem] border border-[#e4e3dc] bg-white p-4 sm:p-5">
        <form onSubmit={search} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-[#99a19b]">⌕</span>
            <input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setIsSearchFocused(true); }} onFocus={() => setIsSearchFocused(true)} onKeyDown={(event) => { if (event.key === 'Escape') setIsSearchFocused(false); }} className="ops-input pl-9 text-sm" placeholder="Search work items, incidents, or requests" aria-expanded={isSearchFocused && searchInput.trim().length >= 2} aria-controls="work-item-suggestions" />
            <WorkItemSuggestions query={searchInput} visible={isSearchFocused} onSelect={() => setIsSearchFocused(false)} />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select value={searchParams.get('status') || ''} onChange={(event) => setFilter('status', event.target.value)} className="ops-input min-w-0 py-[0.64rem] text-xs font-bold text-[#59645e] sm:w-[145px]">
              <option value="">All status</option><option value="Open">Open</option><option value="InProgress">In progress</option><option value="AwaitingApproval">Awaiting approval</option><option value="Resolved">Resolved</option><option value="Closed">Closed</option>
            </select>
            <select value={searchParams.get('priority') || ''} onChange={(event) => setFilter('priority', event.target.value)} className="ops-input min-w-0 py-[0.64rem] text-xs font-bold text-[#59645e] sm:w-[135px]">
              <option value="">Priority</option><option value="Critical">Critical</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
            </select>
            <input type="date" value={searchParams.get('dueDate') || ''} onChange={(event) => setFilter('dueDate', event.target.value)} className="ops-input min-w-0 py-[0.58rem] text-xs font-bold text-[#59645e] sm:w-[145px]" aria-label="Filter by due date" />
            <select value={searchParams.get('teamId') || ''} onChange={(event) => setFilter('teamId', event.target.value)} className="ops-input col-span-2 min-w-0 py-[0.64rem] text-xs font-bold text-[#59645e] sm:w-[155px]">
              <option value="">All teams</option>{user?.memberships.map((membership) => <option key={membership.teamId} value={membership.teamId}>{membership.teamName}</option>)}
            </select>
          </div>
          <button type="submit" className="ops-primary-button hidden text-xs lg:inline-flex">Search</button>
        </form>
        <div className="mt-3 flex items-center justify-between border-t border-[#f0efea] pt-3">
          <p className="text-[11px] font-semibold text-[#98a099]">{isFetching && !isLoading ? 'Refreshing results…' : 'Filters apply to work you can access.'}</p>
          {hasFilters && <button onClick={clearFilters} className="text-[11px] font-extrabold text-[#698b42] hover:text-[#273128]">Clear filters</button>}
        </div>
      </section>

      <section className="ops-card-shadow overflow-hidden rounded-[1.55rem] border border-[#e4e3dc] bg-white">
        <div className="flex items-center justify-between border-b border-[#edede7] px-5 py-4 sm:px-6">
          <div><p className="text-sm font-black text-[#26312d]">Operations queue</p><p className="mt-0.5 text-[11px] text-[#929a93]">{data ? `${data.items.length} item${data.items.length === 1 ? '' : 's'} on this page` : 'Loading current items'}</p></div>
          <span className="rounded-lg bg-[#f1f5e8] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#718157]">Cursor view</span>
        </div>

        {isLoading ? <ItemsSkeleton /> : error ? (
          <EmptyState icon="!" title="Could not load work items" message="The queue is temporarily unavailable. Check the connection and retry." action={<button onClick={() => refetch()} className="ops-primary-button mt-4 text-xs">Retry queue</button>} />
        ) : data?.items.length === 0 ? (
          <EmptyState icon="◌" title="No work items found" message={hasFilters ? 'Try loosening a filter or clearing the search.' : 'Create the first item for your operations queue.'} action={hasFilters ? <button onClick={clearFilters} className="ops-primary-button mt-4 text-xs">Clear filters</button> : <Link to="/items/new" className="ops-primary-button ops-lime-button mt-4 text-xs">Create work item</Link>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-[#fbfbf7] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9ba19b]"><tr><th className="px-5 py-3.5 sm:px-6">Work item</th><th className="hidden px-3 py-3.5 md:table-cell">Type</th><th className="px-3 py-3.5">Status</th><th className="px-3 py-3.5">Priority</th><th className="hidden px-3 py-3.5 lg:table-cell">Assignee</th><th className="hidden px-3 py-3.5 xl:table-cell">Team</th><th className="px-5 py-3.5 text-right sm:px-6">Open</th></tr></thead>
                <tbody className="divide-y divide-[#f0f0ea]">
                  {data?.items.map((item) => (
                    <tr key={item.id} className="group transition hover:bg-[#fbfdf6]">
                      <td className="max-w-[290px] px-5 py-4 sm:px-6"><Link to={`/items/${item.id}`} className="block truncate text-sm font-extrabold text-[#29352f] transition group-hover:text-[#638a37]">{item.title}</Link><p className="mt-1 truncate text-[11px] font-medium text-[#929a94]">{item.description || 'No description provided'}</p></td>
                      <td className="hidden px-3 py-4 md:table-cell"><TypeBadge type={item.type} /></td>
                      <td className="px-3 py-4"><StatusBadge status={item.status} /></td>
                      <td className="px-3 py-4"><PriorityBadge priority={item.priority} /></td>
                      <td className="hidden px-3 py-4 text-xs font-semibold text-[#657069] lg:table-cell">{item.assigneeName || <span className="text-[#a6aca7]">Unassigned</span>}</td>
                      <td className="hidden px-3 py-4 text-xs font-semibold text-[#657069] xl:table-cell">{item.teamName}</td>
                      <td className="px-5 py-4 text-right sm:px-6"><Link to={`/items/${item.id}`} className="inline-grid h-8 w-8 place-items-center rounded-lg bg-[#eff5e0] text-sm font-bold text-[#577a36] transition group-hover:bg-[#c7f36a] group-hover:text-[#263128]">→</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data?.hasMore && <div className="flex items-center justify-between border-t border-[#edede7] px-5 py-4 sm:px-6"><p className="text-[11px] font-semibold text-[#99a19b]">More items are available in the next cursor page.</p><button onClick={showNextPage} className="ops-quiet-button text-xs">Next page <span>→</span></button></div>}
          </>
        )}
      </section>
    </div>
  );
}

function EmptyState({ icon, title, message, action }: { icon: string; title: string; message: string; action: React.ReactNode }) {
  return <div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f1f5e8] text-xl font-black text-[#718857]">{icon}</span><h2 className="mt-4 text-base font-black text-[#3a4540]">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#8b948d]">{message}</p>{action}</div>;
}

function ItemsSkeleton() {
  return <div className="animate-pulse divide-y divide-[#f0f0ea]">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-5 px-6 py-5"><div className="h-9 flex-1 rounded-xl bg-[#f0f1ec]" /><div className="h-7 w-20 rounded-lg bg-[#f0f1ec]" /><div className="h-7 w-16 rounded-lg bg-[#f0f1ec]" /></div>)}</div>;
}
