import React from 'react';
import { User, Mail, Shield, Key, Save, AlertCircle } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';

export default function ProfilePage() {
  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Profile & Account</h1>
          <p className="text-sm text-slate-400 mt-1">
            User credentials, academic affiliation, and system preferences interface.
          </p>
        </div>

        {/* Sample Profile Disclaimer Banner */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <span className="font-semibold text-white">Sample Profile Notice:</span> Account details shown below are illustrative placeholder inputs. User authentication and profile persistence will be connected in future backend development phases.
          </div>
        </div>

        {/* User Card Header */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-brand-600 to-purple-600 p-0.5 shadow-xl">
            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center font-bold text-2xl text-white">
              AU
            </div>
          </div>
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-xl font-bold text-white">Academic Student User <span className="text-xs font-normal text-slate-400">(Sample Profile)</span></h2>
            <p className="text-xs text-slate-400">Department of Computer Science / Information Technology</p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-500/10 text-brand-300 border border-brand-500/20 mt-2">
              Capstone Researcher Tier (Sample)
            </div>
          </div>
        </div>

        {/* Personal Details Form */}
        <Card icon={User} title="Personal & Academic Information" subtitle="Sample profile fields placeholder">
          <form className="mt-4 space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  defaultValue="Student"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  defaultValue="Researcher"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                University Email Address
              </label>
              <input
                type="email"
                defaultValue="student@university.edu"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-1.5 shadow-md shadow-brand-500/20"
              >
                <Save className="w-3.5 h-3.5" /> Save Changes (UI Only)
              </button>
            </div>
          </form>
        </Card>

        {/* Security & API Key Placeholder */}
        <Card icon={Key} title="API & System Token Placeholder" subtitle="Future integration access key placeholder">
          <div className="mt-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">API Access Key:</span>
              <span className="font-mono text-slate-500">auth_demo_********************</span>
            </div>
            <p className="text-[11px] text-slate-400">
              API tokens will allow programmatic access to the EfficientNet static image classifier endpoint when backend code is deployed.
            </p>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
