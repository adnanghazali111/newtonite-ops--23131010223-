import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge, PriorityBadge, TypeBadge } from '../components/Badges';
import { useAuth } from '../auth';

export function ItemsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (value) filters[key] = value;
  }
  if (!filters.limit) filters.limit = '25';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['items', filters],
    queryFn: () => api.getItems(filters),
  });

  const setFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.delete('cursor'); // Reset pagination on filter change
    setSearchParams(newParams);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter('q', searchInput);
  };

  const loadMore = () => {
    if (data?.nextCursor) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('cursor', data.nextCursor);
      setSearchParams(newParams);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Work Items</h1>
        <Link
          to="/items/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Item
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search items..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button type="submit" className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors">
              🔍
            </button>
          </form>

          <select
            value={searchParams.get('status') || ''}
            onChange={(e) => setFilter('status', e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Status</option>
            <option value="Open">Open</option>
            <option value="InProgress">In Progress</option>
            <option value="AwaitingApproval">Awaiting Approval</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>

          <select
            value={searchParams.get('priority') || ''}
            onChange={(e) => setFilter('priority', e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Priority</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            value={searchParams.get('teamId') || ''}
            onChange={(e) => setFilter('teamId', e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Teams</option>
            {user?.memberships.map((m) => (
              <option key={m.teamId} value={m.teamId}>{m.teamName}</option>
            ))}
          </select>

          {searchParams.toString() && (
            <button
              onClick={() => { setSearchParams({}); setSearchInput(''); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <ItemsSkeleton />
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 mb-2">Failed to load items</p>
            <button onClick={() => refetch()} className="text-blue-600 text-sm hover:underline">Retry</button>
          </div>
        ) : data?.items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg mb-2">No items found</p>
            <Link to="/items/new" className="text-blue-600 text-sm hover:underline">Create your first item</Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Priority</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Assignee</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Team</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden xl:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data?.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/items/${item.id}`} className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell"><TypeBadge type={item.type} /></td>
                      <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><PriorityBadge priority={item.priority} /></td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{item.assigneeName || <span className="text-gray-400">Unassigned</span>}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{item.teamName}</td>
                      <td className="px-4 py-3 text-gray-400 hidden xl:table-cell">{new Date(item.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data?.hasMore && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={loadMore}
                  className="text-blue-600 text-sm font-medium hover:underline"
                >
                  Load More →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <div className="animate-pulse p-4 space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded" />
      ))}
    </div>
  );
}
