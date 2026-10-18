import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

const navItems = [
  { to: '/', label: 'Overview', icon: '◌' },
  { to: '/items', label: 'Work items', icon: '▦' },
  { to: '/items/new', label: 'Create item', icon: '+' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  return (
    <div className="min-h-screen p-0 md:p-5 lg:p-7">
      <div className="ops-shell-shadow flex min-h-screen w-full overflow-hidden bg-[#f7f6f1] md:min-h-[calc(100vh-2.5rem)] md:rounded-[2rem] md:border md:border-white/80 lg:min-h-[calc(100vh-3.5rem)]">
        <aside className={`hidden shrink-0 flex-col border-r border-[#e8e6df] bg-white py-5 transition-[width,padding] duration-200 md:flex ${sidebarCollapsed ? 'w-[82px] px-3' : 'w-[238px] px-4'}`}>
          <div className={`mb-10 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-2'}`}>
            <Link to="/" title="Newtonite overview" className={`flex min-w-0 items-center ${sidebarCollapsed ? '' : 'gap-3'}`}>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#202b27] text-lg font-black text-[#c7f36a] shadow-[0_4px_0_#9cce40]">N</span>
              <span className={sidebarCollapsed ? 'sr-only' : ''}>
                <span className="block text-[15px] font-extrabold tracking-tight text-[#1d2824]">Newtonite</span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#99a09b]">Operations</span>
              </span>
            </Link>
            {!sidebarCollapsed && <button onClick={() => setSidebarCollapsed(true)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg font-bold text-[#7c8680] transition hover:bg-[#f1f4e9] hover:text-[#26312d]" aria-label="Collapse navigation" title="Collapse navigation">‹</button>}
          </div>

          {sidebarCollapsed && <button onClick={() => setSidebarCollapsed(false)} className="mb-8 grid h-10 w-full place-items-center rounded-xl bg-[#f0f4e7] text-lg font-bold text-[#627655] transition hover:bg-[#e3f4bd] hover:text-[#26312d]" aria-label="Expand navigation" title="Expand navigation">›</button>}

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
                  <span className={`grid h-5 w-5 place-items-center rounded-md text-base leading-none ${active ? 'bg-[#c7f36a] text-[#202b27]' : 'bg-[#f0f1eb] text-[#68746e]'}`}>
                    {item.icon}
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
            <button onClick={logout} title="Sign out" aria-label="Sign out" className={`mt-3 rounded-lg border border-[#dfe5cf] bg-white px-2 py-1.5 text-[11px] font-bold text-[#66716b] transition hover:bg-[#fff1ed] hover:text-[#c14d43] ${sidebarCollapsed ? 'grid w-full place-items-center text-base' : 'w-full'}`}>
              {sidebarCollapsed ? <span aria-hidden="true">↪</span> : 'Sign out'}
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[74px] items-center justify-between border-b border-[#e8e6df] bg-[#fbfbf7] px-5 sm:px-7 lg:px-9">
            <Link to="/" className="flex items-center gap-2 md:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#202b27] text-sm font-black text-[#c7f36a]">N</span>
              <span className="text-sm font-extrabold text-[#202b27]">Newtonite</span>
            </Link>
            <div className="hidden max-w-sm flex-1 md:block">
              <div className="flex h-10 items-center gap-2 rounded-xl border border-[#e7e5de] bg-white px-3 text-xs font-medium text-[#9aa09b]">
                <span className="text-base leading-none">⌕</span>
                Search operations workspace
                <span className="ml-auto rounded-md bg-[#f1f3ec] px-1.5 py-0.5 text-[9px] font-bold text-[#8f9791]">⌘ K</span>
              </div>
            </div>
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

          <main className="w-full px-4 py-6 sm:px-7 lg:px-9 lg:py-8">{children}</main>
        </section>
      </div>
    </div>
  );
}
