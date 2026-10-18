import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const navItems = [
  { to: '/', label: 'Overview', Icon: DashboardIcon },
  { to: '/items', label: 'Work items', Icon: WorkItemsIcon },
  { to: '/items/new', label: 'Create item', Icon: CreateItemIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const initials = user?.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    if (to === '/items/new') return location.pathname === '/items/new';
    return location.pathname === '/items' || (location.pathname.startsWith('/items/') && location.pathname !== '/items/new');
  };

  useEffect(() => {
    const focusWorkspaceSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusWorkspaceSearch);
    return () => window.removeEventListener('keydown', focusWorkspaceSearch);
  }, []);

  const searchWorkspace = (event: React.FormEvent) => {
    event.preventDefault();
    const query = workspaceSearch.trim();
    navigate(query ? `/items?q=${encodeURIComponent(query)}` : '/items');
  };

  return (
    <div className="min-h-dvh bg-[#f7f6f1]">
      <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-[#f7f6f1]">
        <aside className={`hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-[#e8e6df] bg-white py-5 transition-[width,padding] duration-200 md:flex ${sidebarCollapsed ? 'w-[82px] px-3' : 'w-[238px] px-4'}`}>
          <div className={`mb-10 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-2'}`}>
            <Link to="/" title="Newtonite overview" className={`flex min-w-0 items-center ${sidebarCollapsed ? '' : 'gap-3'}`}>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#202b27] text-lg font-black text-[#c7f36a] shadow-[0_4px_0_#9cce40]">N</span>
              <span className={sidebarCollapsed ? 'sr-only' : ''}>
                <span className="block text-[15px] font-extrabold tracking-tight text-[#1d2824]">Newtonite</span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#99a09b]">Operations</span>
              </span>
            </Link>
            {!sidebarCollapsed && <button onClick={() => setSidebarCollapsed(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#7c8680] transition hover:bg-[#f1f4e9] hover:text-[#26312d]" aria-label="Collapse navigation" title="Collapse navigation"><MenuIcon className="h-5 w-5" /></button>}
          </div>

          {sidebarCollapsed && <button onClick={() => setSidebarCollapsed(false)} className="mb-8 grid h-10 w-full place-items-center rounded-xl bg-[#f0f4e7] text-[#627655] transition hover:bg-[#e3f4bd] hover:text-[#26312d]" aria-label="Expand navigation" title="Expand navigation"><ExpandPanelIcon className="h-5 w-5" /></button>}

          <p className={sidebarCollapsed ? 'sr-only' : 'mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a3a8a4]'}>Workspace</p>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  aria-label={item.label}
                  className={`flex items-center rounded-xl py-2.5 text-sm font-bold transition-colors ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${
                    active
                      ? 'bg-[#202b27] text-[#effbd1] shadow-[0_3px_0_#111a17]'
                      : 'text-[#6c7671] hover:bg-[#f4f5ee] hover:text-[#202b27]'
                  }`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-[#c7f36a] text-[#202b27]' : 'bg-[#f0f1eb] text-[#68746e]'}`}>
                    <item.Icon className="h-[17px] w-[17px]" />
                  </span>
                  <span className={sidebarCollapsed ? 'sr-only' : ''}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className={`mt-auto rounded-2xl bg-[#f4f6ed] ${sidebarCollapsed ? 'p-2' : 'p-3'}`}>
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d6edaa] text-xs font-extrabold text-[#243027]">{initials}</span>
              <div className={sidebarCollapsed ? 'sr-only' : 'min-w-0'}>
                <p className="truncate text-xs font-extrabold text-[#26312d]">{user?.displayName}</p>
                <p className="truncate text-[10px] font-semibold text-[#86908a]">{user?.memberships[0]?.role || 'Team member'}</p>
              </div>
            </div>
            <button onClick={logout} title="Sign out" aria-label="Sign out" className={`mt-3 flex items-center justify-center gap-2 rounded-lg border border-[#dfe5cf] bg-white px-2 py-1.5 text-[11px] font-bold text-[#66716b] transition hover:bg-[#fff1ed] hover:text-[#c14d43] ${sidebarCollapsed ? 'w-full' : 'w-full'}`}>
              {sidebarCollapsed && <LogOutIcon className="h-4 w-4" />}<span className={sidebarCollapsed ? 'sr-only' : ''}>Sign out</span>
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto md:flex md:min-h-0 md:flex-col md:overflow-hidden">
          <header className="flex h-[74px] shrink-0 items-center justify-between border-b border-[#e8e6df] bg-[#fbfbf7] px-5 sm:px-7 lg:px-9">
            <Link to="/" className="flex items-center gap-2 md:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#202b27] text-sm font-black text-[#c7f36a]">N</span>
              <span className="text-sm font-extrabold text-[#202b27]">Newtonite</span>
            </Link>
            <form onSubmit={searchWorkspace} className="hidden max-w-sm flex-1 md:block">
              <label className="relative block">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d9891]" />
                <input ref={searchRef} type="search" value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} className="h-10 w-full rounded-xl border border-[#e7e5de] bg-white py-2 pl-9 pr-12 text-xs font-semibold text-[#334039] outline-none transition placeholder:text-[#9aa09b] focus:border-[#9cce39] focus:ring-4 focus:ring-[#c7f36a]/25" placeholder="Search work items" aria-label="Search work items" />
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-[#f1f3ec] px-1.5 py-0.5 text-[9px] font-bold text-[#8f9791]">⌘ K</kbd>
              </label>
            </form>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="hidden rounded-lg bg-[#fff1ce] px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8a651c] sm:inline">Live workspace</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#daeeb0] text-xs font-extrabold text-[#243027] md:hidden">{initials}</span>
              <Link to="/items/new" className="ops-primary-button ops-lime-button px-3 py-2 text-xs shadow-[0_3px_0_#91be37] sm:px-4">
                <span className="text-base leading-none">+</span> <span className="hidden sm:inline">New item</span>
              </Link>
            </div>
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-[#e8e6df] bg-white px-4 py-2 md:hidden">
            {navItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link key={item.to} to={item.to} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${active ? 'bg-[#e5f8b8] text-[#263027]' : 'text-[#738078]'}`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <main className="w-full px-4 py-6 sm:px-7 md:min-h-0 md:flex-1 md:overflow-y-auto lg:px-9 lg:py-8">{children}</main>
        </section>
      </div>
    </div>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}

function WorkItemsIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></svg>;
}

function CreateItemIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className} aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}

function MenuIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>;
}

function ExpandPanelIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m13 9 3 3-3 3" /></svg>;
}

function SearchIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
}

function LogOutIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-5" /></svg>;
}
