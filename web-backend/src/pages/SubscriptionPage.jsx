import { Link } from 'react-router-dom';
import { Check, Shield, Clock } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

export default function SubscriptionPage() {
  return <DashboardLayout><div className="space-y-8 max-w-4xl mx-auto">
    <div><p className="eyebrow mb-2">Your scan allowance</p><h1 className="section-heading">Plans & daily scans</h1><p className="text-sm text-slate-400 mt-3">The Regular plan is available now. Pro subscriptions and payments are not available yet.</p></div>
    <div className="grid md:grid-cols-2 gap-6">
      <section className="glass-panel rounded-2xl p-6 border border-brand-500/30">
        <Shield className="w-7 h-7 text-brand-300 mb-4" /><h2 className="text-xl font-semibold">Regular (Free)</h2>
        <p className="text-3xl font-bold mt-5">5 scans<span className="text-sm font-normal text-slate-400"> / day</span></p>
        <ul className="space-y-4 text-sm text-slate-300 mt-6">
          {['Resets at 12:00 AM Philippine time (Asia/Manila)', 'Failed scans do not consume your daily allowance', 'Pending scans reserve a slot on the day they were started', 'Unused scans do not carry over to the next day', 'Saved history and PDF export use no extra scans'].map(text => <li key={text} className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />{text}</li>)}
        </ul>
        <Link to="/dashboard" className="button-primary mt-8">Check today's remaining scans</Link>
      </section>
      <section className="glass-panel rounded-2xl p-6 border border-slate-800">
        <Clock className="w-7 h-7 text-slate-400 mb-4" /><h2 className="text-xl font-semibold">Pro <span className="text-xs text-amber-300 ml-2">Coming later</span></h2>
        <p className="text-3xl font-bold mt-5">Unlimited scans</p><p className="text-sm text-slate-400 mt-6 leading-relaxed">Planned for a future update. There is no checkout or paid upgrade at this stage, and no payment is required for the Regular plan.</p>
        <button type="button" disabled className="button-secondary mt-8 opacity-60 cursor-not-allowed">Pro is not available yet</button>
      </section>
    </div>
    <p className="text-xs text-slate-400">The daily limit is checked by the backend for your account. Refreshing, signing out, or changing devices does not reset it. Your scan history is retained after each daily reset.</p>
  </div></DashboardLayout>;
}

