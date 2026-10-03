import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ArrowRight, LayoutDashboard, Scan, History, User, LogOut } from 'lucide-react';
import { getAuthToken, getStoredUser, clearAuthSession } from '../../services/api';
import logo from '../../assets/logo.png';

export default function Header({ workspace = false }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const token = getAuthToken();
  const user = getStoredUser();

  const isLandingPage = location.pathname === '/';

  useEffect(() => {
    if (!isLandingPage) {
      setScrolled(false);
      return;
    }
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLandingPage]);

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  const userFirstName = user?.first_name || 'Account';

  return (
    <>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header onKeyDown={(event) => { if (event.key === 'Escape') { setMobileMenuOpen(false); document.getElementById('navigation-toggle')?.focus(); } }} 
      className={
        isLandingPage
          ? `fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-2' : 'bg-transparent py-4'}`
          : 'relative z-30 w-full bg-white border-b border-slate-200 py-3.5'
      }>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <img src={logo} alt="AuthentiScan Logo" className="w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-300" />
          <div className="flex flex-col">
            <span className="font-bold text-xl leading-none tracking-tight text-slate-900">
              Authenti<span className="text-sky-500">Scan</span>
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav aria-label="Main navigation" className={`${workspace ? 'hidden' : 'hidden lg:flex'} items-center gap-8 text-sm font-semibold`}>
          <Link
            to="/"
            className={`transition-colors hover:text-sky-500 ${location.pathname === '/' ? 'text-sky-500' : 'text-slate-600'}`}
          >
            Home
          </Link>
          {token && (
            <>
              <Link
                to="/dashboard"
                className={`transition-colors hover:text-sky-500 ${location.pathname === '/dashboard' ? 'text-sky-500' : 'text-slate-600'}`}
              >
                Dashboard
              </Link>
              <Link
                to="/scan"
                className={`transition-colors hover:text-sky-500 ${location.pathname === '/scan' ? 'text-sky-500' : 'text-slate-600'}`}
              >
                Scan Image
              </Link>
              <Link
                to="/history"
                className={`transition-colors hover:text-sky-500 ${location.pathname === '/history' ? 'text-sky-500' : 'text-slate-600'}`}
              >
                History
              </Link>
            </>
          )}
          {!token && <><a href="/#how-it-works" className="text-slate-600 hover:text-sky-500 transition-colors">How it works</a><a href="/#faq" className="text-slate-600 hover:text-sky-500 transition-colors">FAQ</a></>}
        </nav>

        {/* Auth Actions */}
        <div className="hidden lg:flex items-center gap-4">
          {token ? (
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:text-sky-600 bg-sky-50 hover:bg-sky-100 transition-colors"
              >
                <User className="w-4 h-4 text-sky-500" />
                <span className="max-w-32 truncate" title={userFirstName}>Hi, {userFirstName}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-semibold text-slate-600 hover:text-sky-500 transition-colors"
              >
                Log In
              </Link>
              <Link
                to="/register"
                className="px-5 py-2.5 rounded-full text-sm font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/30 hover:shadow-sky-500/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          id="navigation-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-sky-500 hover:bg-sky-50 transition-colors"
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <nav aria-label="Mobile navigation" id="mobile-navigation" className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-slate-100 px-4 pt-3 pb-6 space-y-3 absolute top-full left-0 right-0 shadow-lg max-h-[calc(100dvh-5rem)] overflow-y-auto">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-4 py-3 rounded-xl text-base font-bold text-slate-700 hover:text-sky-600 hover:bg-sky-50"
          >
            Home
          </Link>
          {token ? (
            <>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-700 hover:text-sky-600 hover:bg-sky-50"
              >
                <LayoutDashboard className="w-5 h-5" /> Dashboard
              </Link>
              <Link
                to="/scan"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-700 hover:text-sky-600 hover:bg-sky-50"
              >
                <Scan className="w-5 h-5" /> Scan Image
              </Link>
              <Link
                to="/history"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-700 hover:text-sky-600 hover:bg-sky-50"
              >
                <History className="w-5 h-5" /> Scan History
              </Link>
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-700 hover:text-sky-600 hover:bg-sky-50"
              >
                <User className="w-5 h-5 shrink-0" /><span className="min-w-0 truncate">Profile ({userFirstName})</span>
              </Link>
              <div className="pt-3 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-3"
                >
                  <LogOut className="w-5 h-5" /> Log Out
                </button>
              </div>
            </>
          ) : (
            <div className="pt-3 mt-2 border-t border-slate-100 flex flex-col gap-3">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center px-5 py-3 rounded-xl text-base font-bold text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                Log In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center px-5 py-3 rounded-xl text-base font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20"
              >
                Register Account
              </Link>
            </div>
          )}
        </nav>
      )}
    </header>
    </>
  );
}
