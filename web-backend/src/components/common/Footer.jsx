import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function Footer({ compact = false }) {
  if (compact) return <footer className="border-t border-slate-800 px-5 py-5 text-xs text-slate-400 flex flex-wrap justify-between gap-3"><span>© {new Date().getFullYear()} AuthentiScan · Capstone project</span><a href="/#faq" className="hover:text-white">Understanding your results</a></footer>;
  return (
    <footer className="glass-panel border-t border-slate-800 mt-auto py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand & Description */}
          <div className="md:col-span-2 space-y-3">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white">
                <ShieldCheck className="w-5 h-5 text-brand-300" />
              </div>
              <span className="font-bold text-lg text-white">
                Authenti<span className="text-brand-400">Scan</span>
              </span>
            </Link>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Review AI estimates of image authenticity with visual explanations and saved reports. Predictions are not proof of authenticity or manipulation.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">Navigation</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link to="/scan" className="hover:text-white transition-colors">Start Scanning</Link></li>
              <li><Link to="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
              <li><Link to="/subscription" className="hover:text-white transition-colors">Subscription</Link></li>
            </ul>
          </div>

          {/* Account Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">Account</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><Link to="/login" className="hover:text-white transition-colors">Login</Link></li>
              <li><Link to="/register" className="hover:text-white transition-colors">Register</Link></li>
              <li><Link to="/profile" className="hover:text-white transition-colors">User Profile</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} AuthentiScan. College Capstone Project.</span>
          <a href="/#faq" className="hover:text-white">How to interpret your results</a>
        </div>
      </div>
    </footer>
  );
}


