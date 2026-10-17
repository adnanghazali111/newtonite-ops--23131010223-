import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { to: '/items', label: 'Work Items', icon: '📋' },
    { to: '/items/new', label: 'Create Item', icon: '➕' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-bold text-blue-700 tracking-tight">
              Newtonite Ops
            </Link>
            <nav className="hidden sm:flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.to
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{user?.displayName}</span>
              <span className="text-gray-400 ml-1 hidden sm:inline">
                ({user?.memberships.map(m => `${m.teamName}: ${m.role}`).join(', ')})
              </span>
            </div>
            <button
              onClick={logout}
              className="text-sm px-3 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <nav className="sm:hidden bg-white border-b border-gray-200 flex overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`flex-shrink-0 px-4 py-2 text-sm font-medium ${
              location.pathname === item.to
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500'
            }`}
          >
            {item.icon} {item.label}
          </Link>
        ))}
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
