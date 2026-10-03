import { Link } from 'react-router-dom';
import { Check, Shield, Clock, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';

const fadeIn = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function SubscriptionPage() {
  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-8 max-w-5xl mx-auto">
        
        {/* Header Section */}
        <motion.div variants={fadeIn} className="text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-bold text-sky-500 uppercase tracking-[0.15em] mb-2">Subscription Management</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Plans & Daily Allowance</h1>
            <p className="text-sm font-medium text-slate-500 mt-2 max-w-xl mx-auto md:mx-0">
              Your account is currently on the Regular plan. Pro subscriptions and payment integrations are not available at this time.
            </p>
          </div>
        </motion.div>

        <motion.div variants={staggerContainer} className="grid md:grid-cols-2 gap-8">
          
          {/* Regular Plan Card */}
          <motion.section variants={fadeIn} className="bg-white rounded-3xl p-8 border-2 border-sky-200 shadow-lg shadow-sky-100/50 relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 px-4 py-1.5 bg-sky-100 text-sky-700 text-xs font-bold rounded-bl-xl border-b border-l border-sky-200">
              Current Plan
            </div>
            <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mb-6">
              <Shield className="w-7 h-7 text-sky-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Regular <span className="text-slate-500 font-medium">(Free)</span></h2>
            <div className="flex items-baseline gap-2 mt-4">
              <p className="text-4xl font-extrabold text-slate-900">5</p>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">scans / day</p>
            </div>
            
            <ul className="space-y-4 text-sm font-medium text-slate-600 mt-8 mb-8 flex-1">
              {[
                'Resets at 12:00 AM Philippine time',
                'Failed scans do not consume allowance',
                'Pending scans reserve a slot for the day',
                'Unused scans do not carry over',
                'Saved history & PDF export use no extra scans',
                'Full AI authenticity analysis & Grad-CAM'
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-emerald-500" />
                  </div>
                  {text}
                </li>
              ))}
            </ul>
            
            <Link to="/dashboard" className="w-full py-3.5 rounded-xl font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 hover:shadow-sky-500/40 transition-all flex items-center justify-center text-sm">
              Check Remaining Scans
            </Link>
          </motion.section>

          {/* Pro Plan Card */}
          <motion.section variants={fadeIn} className="bg-slate-50 rounded-3xl p-8 border border-slate-200 flex flex-col relative overflow-hidden group">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-6">
              <Zap className="w-7 h-7 text-slate-400 group-hover:text-amber-400 transition-colors" />
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-400">Pro</h2>
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 text-xs font-bold uppercase tracking-wider">Coming Soon</span>
            </div>
            <div className="flex items-baseline gap-2 mt-4">
              <p className="text-4xl font-extrabold text-slate-400">Unlimited</p>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">scans</p>
            </div>
            
            <p className="text-sm font-medium text-slate-500 mt-8 leading-relaxed flex-1">
              Planned for a future update. There is no checkout or paid upgrade at this stage, and no payment is required for the Regular plan. Wait for future announcements regarding premium tier availability.
            </p>
            
            <button type="button" disabled className="w-full py-3.5 rounded-xl font-bold bg-slate-200 text-slate-400 cursor-not-allowed mt-8 border border-slate-300 text-sm">
              Pro Not Available Yet
            </button>
          </motion.section>

        </motion.div>

        <motion.div variants={fadeIn} className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              The daily limit is securely checked by the backend for your account. Refreshing, signing out, or changing devices does not reset it. Your scan history is retained indefinitely after each daily reset.
            </p>
          </div>
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
}
