import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Menu, X, ArrowRight, LayoutDashboard, Scan, History, User, LogOut } from 'lucide-react';
import { getAuthToken, getStoredUser, clearAuthSession } from '../../services/api';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const token = getAuthToken();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  const userFirstName = user?.first_name || 'Account';

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-brand-400" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-none tracking-tight text-white">
              Authenti<span className="text-brand-400">Scan</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-0.5">
              Capstone Project
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            to="/"
            className={`transition-colors hover:text-white ${location.pathname === '/' ? 'text-brand-400 font-semibold' : 'text-slate-300'}`}
          >
            Home
          </Link>
          {token && (
            <>
              <Link
                to="/dashboard"
                className={`transition-colors hover:text-white ${location.pathname === '/dashboard' ? 'text-brand-400 font-semibold' : 'text-slate-300'}`}
              >
                Dashboard
              </Link>
              <Link
                to="/scan"
                className={`transition-colors hover:text-white ${location.pathname === '/scan' ? 'text-brand-400 font-semibold' : 'text-slate-300'}`}
              >
                Scan Image
              </Link>
              <Link
                to="/history"
                className={`transition-colors hover:text-white ${location.pathname === '/history' ? 'text-brand-400 font-semibold' : 'text-slate-300'}`}
              >
                History
              </Link>
            </>
          )}
          <Link
            to="/subscription"
            className={`transition-colors hover:text-white ${location.pathname === '/subscription' ? 'text-brand-400 font-semibold' : 'text-slate-300'}`}
          >
            Subscription
          </Link>
        </nav>

        {/* Auth Actions */}
        <div className="hidden md:flex items-center gap-3">
          {token ? (
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-200 hover:text-white bg-slate-900 border border-slate-800"
              >
                <User className="w-4 h-4 text-brand-400" />
                <span>Hi, {userFirstName}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/10 border border-rose-500/20 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log Out
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Log In
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md shadow-brand-500/20 hover:shadow-brand-500/30 transition-all duration-200 flex items-center gap-1.5"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-panel border-t border-slate-800 px-4 pt-3 pb-6 space-y-3">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800"
          >
            Home
          </Link>
          {token ? (
            <>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </Link>
              <Link
                to="/scan"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2"
              >
                <Scan className="w-4 h-4" /> Scan Image
              </Link>
              <Link
                to="/history"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2"
              >
                <History className="w-4 h-4" /> Scan History
              </Link>
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2"
              >
                <User className="w-4 h-4" /> Profile ({userFirstName})
              </Link>
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-base font-medium text-rose-300 hover:bg-slate-800 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Log Out
                </button>
              </div>
            </>
          ) : (
            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Log In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white"
              >
                Register Account
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
