import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ArrowRight, LayoutDashboard, Scan, History, User, LogOut, CreditCard } from 'lucide-react';
import { getAuthToken, getStoredUser, clearAuthSession } from '../../services/api';
import logo from '../../assets/logo.png';
import ThemeSwitcher from './ThemeSwitcher';

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
          ? `fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-surface/90 backdrop-blur-md shadow-sm py-2' : 'bg-transparent py-4'}`
          : `relative z-30 w-full bg-surface border-b border-line py-3.5 ${workspace ? 'lg:hidden' : ''}`
      }>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <img src={logo} alt="AuthentiScan Logo" className="theme-logo w-10 h-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-300" />
          <div className="flex flex-col">
            <span className="font-bold text-xl leading-none tracking-tight text-ink">
              Authenti<span className="text-accent">Scan</span>
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav aria-label="Main navigation" className={`${workspace ? 'hidden' : 'hidden lg:flex'} items-center gap-8 text-sm font-semibold`}>
          <Link
            to="/"
            className={`transition-colors hover:text-accent ${location.pathname === '/' ? 'text-accent' : 'text-ink-secondary'}`}
          >
            Home
          </Link>
          {token && (
            <>
              <Link
                to="/dashboard"
                className={`transition-colors hover:text-accent ${location.pathname === '/dashboard' ? 'text-accent' : 'text-ink-secondary'}`}
              >
                Dashboard
              </Link>
              <Link
                to="/scan"
                className={`transition-colors hover:text-accent ${location.pathname === '/scan' ? 'text-accent' : 'text-ink-secondary'}`}
              >
                Scan Image
              </Link>
              <Link
                to="/history"
                className={`transition-colors hover:text-accent ${location.pathname === '/history' ? 'text-accent' : 'text-ink-secondary'}`}
              >
                History
              </Link>
            </>
          )}
          {!token && <><a href="/#how-it-works" className="text-ink-secondary hover:text-accent transition-colors">How it works</a><a href="/#faq" className="text-ink-secondary hover:text-accent transition-colors">FAQ</a></>}
        </nav>

        {/* Auth Actions */}
        <div className="hidden lg:flex items-center gap-4">
          <ThemeSwitcher compact />
          {token ? (
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-ink-secondary hover:text-accent bg-accent-soft hover:bg-accent-soft transition-colors"
              >
                <User className="w-4 h-4 text-accent" />
                <span className="max-w-32 truncate" title={userFirstName}>Hi, {userFirstName}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-xl text-xs font-bold text-danger hover:text-danger bg-danger-soft hover:bg-danger-soft transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-semibold text-ink-secondary hover:text-accent transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="theme-action px-5 py-2.5 rounded-full text-sm font-bold bg-action hover:bg-action-hover text-ink shadow-md shadow-accent/30 hover:shadow-accent/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
              >
                Create account
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>

        <div className="lg:hidden ml-auto mr-2"><ThemeSwitcher compact /></div>
        {/* Mobile Hamburger Button */}
        <button
          id="navigation-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
          className="lg:hidden p-2 rounded-xl text-ink-muted hover:text-accent hover:bg-accent-soft transition-colors"
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <nav aria-label="Mobile navigation" id="mobile-navigation" className="lg:hidden bg-surface/95 backdrop-blur-xl border-t border-line px-4 pt-3 pb-6 space-y-3 absolute top-full left-0 right-0 shadow-lg max-h-[calc(100dvh-5rem)] overflow-y-auto">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-4 py-3 rounded-xl text-base font-bold text-ink-secondary hover:text-accent hover:bg-accent-soft"
          >
            Home
          </Link>
          {token ? (
            <>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-ink-secondary hover:text-accent hover:bg-accent-soft"
              >
                <LayoutDashboard className="w-5 h-5" /> Dashboard
              </Link>
              <Link
                to="/scan"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-ink-secondary hover:text-accent hover:bg-accent-soft"
              >
                <Scan className="w-5 h-5" /> Scan Image
              </Link>
              <Link
                to="/history"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-ink-secondary hover:text-accent hover:bg-accent-soft"
              >
                <History className="w-5 h-5" /> Scan History
              </Link>
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-ink-secondary hover:text-accent hover:bg-accent-soft"
              >
                <User className="w-5 h-5 shrink-0" /><span className="min-w-0 truncate">Profile ({userFirstName})</span>
              </Link>
              <Link
                to="/subscription"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-ink-secondary hover:text-accent hover:bg-accent-soft"
              >
                <CreditCard className="w-5 h-5" /> Subscription
              </Link>
              <div className="pt-3 mt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-danger hover:bg-danger-soft flex items-center gap-3"
                >
                  <LogOut className="w-5 h-5" /> Log Out
                </button>
              </div>
            </>
          ) : (
            <div className="pt-3 mt-2 border-t border-line flex flex-col gap-3">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center px-5 py-3 rounded-xl text-base font-bold text-ink-secondary bg-canvas hover:bg-surface-hover"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="theme-action w-full text-center px-5 py-3 rounded-xl text-base font-bold bg-action hover:bg-action-hover text-ink shadow-md shadow-accent/20"
              >
                Create account
              </Link>
            </div>
          )}
        </nav>
      )}
    </header>
    </>
  );
}
