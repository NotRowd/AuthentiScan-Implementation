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
import logo from '../../assets/logo.png';
import Avatar from './Avatar';
import ThemeSwitcher from './ThemeSwitcher';

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

  const planName = user?.plan?.scan_limit === null ? 'Pro' : user?.plan?.name || 'Free';

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Scan Image', path: '/scan', icon: Scan },
    { name: 'Scan History', path: '/history', icon: History },
    { name: 'Profile & Settings', path: '/profile', icon: User },
    { name: 'Subscription', path: '/subscription', icon: CreditCard },
  ];

  return (
    <aside aria-label="Workspace navigation" className="w-64 shrink-0 bg-surface border-r border-line flex-col hidden lg:flex sticky top-0 self-start h-dvh min-h-0 z-10 shadow-sm">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 space-y-8">
        <Link to="/dashboard" aria-label="AuthentiScan dashboard" className="flex items-center gap-3 py-2 group">
          <img src={logo} alt="" className="theme-logo w-10 h-10 object-contain shrink-0 drop-shadow-sm group-hover:scale-105 transition-transform duration-300" />
          <span className="font-bold text-xl leading-none tracking-tight text-ink">Authenti<span className="text-accent">Scan</span></span>
        </Link>
        {/* Navigation Menu */}
        <div>
          <div className="text-[11px] font-bold text-accent uppercase tracking-[0.15em] px-4 mb-3">
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
                      ? 'bg-accent-soft text-accent shadow-sm shadow-accent/50'
                      : 'text-ink-secondary hover:text-accent hover:bg-canvas'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-accent' : 'text-ink-muted'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* AI Capstone Feature Info Box */}
        <div className="p-4 rounded-2xl bg-accent-soft/50 border border-line">
          <div className="flex items-center gap-2 text-xs font-bold text-accent mb-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Read results thoughtfully
          </div>
          <p className="text-xs text-ink-muted leading-relaxed font-medium">
            AI scores are estimates, not proof. Open a saved scan to review its explanation, heatmap, and PDF report.
          </p>
        </div>
      </div>

      {/* Bottom Profile Quick View */}
      <div className="shrink-0 p-5 border-t border-line bg-canvas">
        <div className="mb-4"><ThemeSwitcher /></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-accent-soft border border-line flex items-center justify-center font-bold text-accent text-sm shrink-0">
              <Avatar user={user} initials={userInitials}/>
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold text-ink leading-snug truncate">{userFullName}</span>
              <span className="text-xs font-medium text-ink-muted truncate">{planName} Plan</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            aria-label="Log out"
            className="text-ink-muted hover:text-danger hover:bg-danger-soft p-2 rounded-xl transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
