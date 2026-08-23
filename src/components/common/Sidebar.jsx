import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Scan, 
  History, 
  User, 
  CreditCard, 
  LogOut,
  Sparkles,
  HelpCircle
} from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Scan Image', path: '/scan', icon: Scan },
    { name: 'Scan History', path: '/history', icon: History },
    { name: 'Profile & Settings', path: '/profile', icon: User },
    { name: 'Subscription', path: '/subscription', icon: CreditCard },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-slate-800 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-4rem)]">
      <div className="p-4 space-y-6">
        {/* Navigation Menu */}
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
            Main Navigation
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-400' : 'text-slate-500'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* AI Capstone Feature Info Box */}
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-900 to-indigo-950/50 border border-indigo-500/20">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300 mb-1">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            AI Capstone Specs
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            EfficientNet-B0 + Grad-CAM XAI Heatmaps & Object Detection Pipeline architecture.
          </p>
        </div>
      </div>

      {/* Bottom Profile Quick View */}
      <div className="p-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 text-sm">
              CS
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-white leading-snug">Student User</span>
              <span className="text-[10px] text-slate-400">Free Capstone Tier</span>
            </div>
          </div>
          <Link to="/login" title="Logout" className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg transition-colors">
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
