import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import logo from '../../assets/logo.png';

export default function Footer({ compact = false }) {
  if (compact) return <footer className="border-t border-slate-200 px-5 py-5 text-xs text-slate-500 bg-white flex flex-wrap justify-between gap-3"><span>© {new Date().getFullYear()} AuthentiScan · Capstone project</span><a href="/#faq" className="hover:text-sky-600 transition-colors">Understanding your results</a></footer>;
  return (
    <footer className="bg-slate-50 border-t border-slate-200 mt-auto py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand & Description */}
          <div className="md:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <img src={logo} alt="AuthentiScan Logo" className="w-8 h-8 object-contain drop-shadow-sm" />
              <span className="font-bold text-lg text-slate-900 tracking-tight">
                Authenti<span className="text-sky-500">Scan</span>
              </span>
            </Link>
            <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
              Review AI estimates of image authenticity with visual explanations and saved reports. Predictions are not proof of authenticity or manipulation.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-800 mb-4">Navigation</h4>
            <ul className="space-y-3 text-sm font-medium text-slate-500">
              <li><Link to="/" className="hover:text-sky-600 transition-colors flex items-center gap-2">Home</Link></li>
              <li><Link to="/scan" className="hover:text-sky-600 transition-colors flex items-center gap-2">Start Scanning</Link></li>
              <li><Link to="/dashboard" className="hover:text-sky-600 transition-colors flex items-center gap-2">Dashboard</Link></li>
              <li><Link to="/history" className="hover:text-sky-600 transition-colors flex items-center gap-2">History</Link></li>
            </ul>
          </div>

          {/* Account Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-800 mb-4">Account</h4>
            <ul className="space-y-3 text-sm font-medium text-slate-500">
              <li><Link to="/login" className="hover:text-sky-600 transition-colors flex items-center gap-2">Log In</Link></li>
              <li><Link to="/register" className="hover:text-sky-600 transition-colors flex items-center gap-2">Create Account</Link></li>
              <li><Link to="/profile" className="hover:text-sky-600 transition-colors flex items-center gap-2">Settings</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
          <span>© {new Date().getFullYear()} AuthentiScan. College Capstone Project.</span>
          <a href="/#faq" className="hover:text-sky-600 transition-colors">How to interpret your results</a>
        </div>
      </div>
    </footer>
  );
}
