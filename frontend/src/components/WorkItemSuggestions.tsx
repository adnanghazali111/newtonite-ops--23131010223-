import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PriorityBadge, StatusBadge, TypeBadge } from './Badges';

interface WorkItemSuggestionsProps {
  query: string;
  visible: boolean;
  onSelect?: () => void;
}

export function WorkItemSuggestions({ query, visible, onSelect }: WorkItemSuggestionsProps) {
  const deferredQuery = useDeferredValue(query.trim());
  const enabled = visible && deferredQuery.length >= 1;
  const { data, isFetching, isError } = useQuery({
    queryKey: ['work-item-suggestions', deferredQuery],
    queryFn: () => api.getItems({ q: deferredQuery, limit: '6' }),
    enabled,
    staleTime: 15_000,
  });

  if (!visible || query.trim().length < 1) return null;

  return (
    <div id="work-item-suggestions" role="listbox" aria-label="Matching work items" className="ops-card-shadow absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-xl border border-[#dde4ce] bg-white text-left">
      <div className="flex items-center justify-between border-b border-[#f0f0eb] px-3 py-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-[#7d8a80]">Matching work items</p>
        {isFetching && <span className="text-[10px] font-bold text-[#77914f]">Searching…</span>}
      </div>

      {isError ? (
        <p className="px-3 py-3 text-xs font-semibold text-[#b05246]">Suggestions are unavailable. Press Enter to search the queue.</p>
      ) : data?.items.length === 0 && !isFetching ? (
        <p className="px-3 py-3 text-xs font-semibold text-[#7c8780]">No work items match “{query.trim()}”.</p>
      ) : data?.items.length ? (
        <div className="max-h-80 overflow-y-auto py-1">
          {data.items.map((item) => (
            <Link key={item.id} role="option" to={`/items/${item.id}`} onMouseDown={(event) => event.preventDefault()} onClick={onSelect} className="block border-b border-[#f4f3ef] px-3 py-2.5 last:border-b-0 transition hover:bg-[#f7fbed] focus:bg-[#f7fbed] focus:outline-none">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-[#29352f]">{item.title}</span>
                <TypeBadge type={item.type} />
              </div>
              <div className="mt-1.5 flex items-center gap-2"><StatusBadge status={item.status} /><PriorityBadge priority={item.priority} /><span className="ml-auto truncate text-[10px] font-semibold text-[#89938c]">{item.teamName}</span></div>
            </Link>
          ))}
        </div>
      ) : null}
      <p className="border-t border-[#f0f0eb] px-3 py-2 text-[10px] font-semibold text-[#879187]">Press Enter to view every result in the queue.</p>
    </div>
  );
}
