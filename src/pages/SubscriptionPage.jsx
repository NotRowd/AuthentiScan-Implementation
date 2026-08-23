import React, { useState } from 'react';
import { Check, Zap, Shield, Building, AlertTriangle } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

export default function SubscriptionPage() {
  const [billingCycle, setBillingCycle] = useState('monthly');

  return (
    <DashboardLayout>
      <div className="space-y-10 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Demo / Placeholder Pricing Layout
          </div>

          <h1 className="text-3xl font-bold text-white">Subscription & Licensing Plans</h1>
          <p className="text-sm text-slate-400">
            Illustrative plan tier structure for the AuthentiScan capstone demonstration. No active payment processing is implemented.
          </p>

          {/* Billing Cycle Selector */}
          <div className="pt-4 flex items-center justify-center gap-3">
            <span className={`text-xs font-semibold ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-400'}`}>
              Monthly Billing (Demo)
            </span>
            <button
              type="button"
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="w-12 h-6 rounded-full bg-slate-800 p-1 relative border border-slate-700 transition-colors"
            >
              <div
                className={`w-4 h-4 rounded-full bg-brand-500 transition-transform ${
                  billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-xs font-semibold ${billingCycle === 'yearly' ? 'text-white' : 'text-slate-400'}`}>
              Annual Billing (Demo)
            </span>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Free Tier */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between relative">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-lg">
                  <Shield className="w-5 h-5 text-slate-400" />
                  Free Student
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">Placeholder</span>
              </div>
              <p className="text-xs text-slate-400">Basic verification for coursework</p>

              <div className="mt-6 mb-6">
                <span className="text-4xl font-extrabold text-white">$0</span>
                <span className="text-xs text-slate-400"> / month</span>
              </div>

              <ul className="space-y-3 text-xs text-slate-300 border-t border-slate-800 pt-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> 10 Static Image Scans / day
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> EfficientNet-B0 Detection
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Basic Grad-CAM Visual Heatmap
                </li>
                <li className="flex items-center gap-2 text-slate-500">
                  <span>Standard 1080p Max Resolution</span>
                </li>
              </ul>
            </div>

            <button disabled className="w-full mt-8 py-3 rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 cursor-default">
              Current Tier (Demo)
            </button>
          </div>

          {/* Pro Tier (Featured) */}
          <div className="glass-panel rounded-2xl p-6 border-2 border-brand-500/60 shadow-xl shadow-brand-500/10 flex flex-col justify-between relative scale-105">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-600 text-white shadow-md">
              Demo Tier
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-brand-300 font-semibold text-lg">
                  <Zap className="w-5 h-5 text-brand-400" />
                  Researcher Pro
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20">Placeholder</span>
              </div>
              <p className="text-xs text-slate-400">High-resolution explainable vision pipeline</p>

              <div className="mt-6 mb-6">
                <span className="text-4xl font-extrabold text-white">
                  {billingCycle === 'monthly' ? '$15' : '$12'}
                </span>
                <span className="text-xs text-slate-400"> / month (Demo Price)</span>
              </div>

              <ul className="space-y-3 text-xs text-slate-300 border-t border-slate-800 pt-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Unlimited Static Image Scans
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> High-Res Grad-CAM Heatmap Analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Object Detection Bounding Boxes
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Downloadable PDF Audit Reports
                </li>
              </ul>
            </div>

            <button type="button" className="w-full mt-8 py-3 rounded-xl text-xs font-semibold bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-500/25 cursor-default">
              Pro Tier (Demo Preview Only)
            </button>
          </div>

          {/* Enterprise / Institution Tier */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between relative">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-lg">
                  <Building className="w-5 h-5 text-slate-400" />
                  Institutional
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">Placeholder</span>
              </div>
              <p className="text-xs text-slate-400">For university labs and research teams</p>

              <div className="mt-6 mb-6">
                <span className="text-4xl font-extrabold text-white">Custom</span>
              </div>

              <ul className="space-y-3 text-xs text-slate-300 border-t border-slate-800 pt-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Dedicated Inference Server Cluster
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Custom EfficientNet Model Fine-Tuning
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Multi-User Team Access & Admin Controls
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Priority API Endpoint Rate Limits
                </li>
              </ul>
            </div>

            <button type="button" className="w-full mt-8 py-3 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 cursor-default">
              Institutional Tier (Demo Only)
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
