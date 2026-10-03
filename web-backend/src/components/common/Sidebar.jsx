import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Scan, 
  History, 
  User, 
  CreditCard, 
  LogOut,
  Sparkles
} from 'lucide-react';
import { getStoredUser, clearAuthSession } from '../../services/api';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  const userInitials = user?.first_name && user?.last_name
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : 'US';

  const userFullName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : 'User Account';

  const planName = user?.plan?.name || 'Free';

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Scan Image', path: '/scan', icon: Scan },
    { name: 'Scan History', path: '/history', icon: History },
    { name: 'Profile & Settings', path: '/profile', icon: User },
    { name: 'Subscription', path: '/subscription', icon: CreditCard },
  ];

  return (
    <aside aria-label="Workspace navigation" className="w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between hidden lg:flex min-h-[calc(100vh-4rem)] relative z-10 shadow-sm">
      <div className="p-5 space-y-8">
        {/* Navigation Menu */}
        <div>
          <div className="text-[11px] font-bold text-sky-500 uppercase tracking-[0.15em] px-4 mb-3">
            Main Navigation
          </div>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || (item.path === '/history' && location.pathname.startsWith('/scans/'));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-sky-50 text-sky-600 shadow-sm shadow-sky-100/50'
                      : 'text-slate-600 hover:text-sky-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-sky-500' : 'text-slate-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* AI Capstone Feature Info Box */}
        <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-100">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-700 mb-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            Read results thoughtfully
          </div>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            AI scores are estimates, not proof. Open a saved scan to review its explanation, heatmap, and PDF report.
          </p>
        </div>
      </div>

      {/* Bottom Profile Quick View */}
      <div className="p-5 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center font-bold text-sky-600 text-sm shrink-0">
              {userInitials}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold text-slate-900 leading-snug truncate">{userFullName}</span>
              <span className="text-xs font-medium text-slate-500 truncate">{planName} Plan</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            aria-label="Log out"
            className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
