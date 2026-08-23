import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Sparkles, 
  Eye, 
  ArrowRight, 
  UploadCloud,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Search,
  ArrowDown,
  Layers
} from 'lucide-react';
import MainLayout from '../components/layout/MainLayout';
import Card from '../components/common/Card';
import StatusBadge from '../components/common/StatusBadge';

export default function LandingPage() {
  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-24 md:pt-24 md:pb-32">
        {/* Glowing Background Backdrop Accent */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-gradient-to-tr from-brand-600/25 via-indigo-600/15 to-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Capstone Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-300 border border-brand-500/20 mb-8 backdrop-blur-md">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            AuthentiScan • AI Image Authenticity Capstone
          </div>

          {/* Hero Main Message & Tagline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.15]">
            <span className="gradient-text">Verify.</span> Understand. Trust.
          </h1>

          {/* Supporting Text */}
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            Analyze images with AI-powered authenticity detection and understand why the system reached its result.
          </p>

          {/* Action Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/scan"
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-base font-semibold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-xl shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 flex items-center justify-center gap-2 group"
            >
              Start Scanning
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <div className="w-full sm:w-auto flex items-center gap-3">
              <Link
                to="/login"
                className="w-1/2 sm:w-auto px-6 py-4 rounded-xl text-base font-semibold glass-card text-slate-200 hover:text-white border border-slate-700 hover:border-slate-600 transition-all duration-200 text-center"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="w-1/2 sm:w-auto px-6 py-4 rounded-xl text-base font-semibold bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 hover:border-slate-600 transition-all duration-200 text-center"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Concept Flow Diagram Section */}
      <section className="py-16 bg-slate-900/40 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Concept Flow</h2>
            <p className="mt-2 text-slate-400 text-sm">
              A transparent verification process connecting input static images to clear authenticity classifications.
            </p>
          </div>

          <div className="max-w-4xl mx-auto glass-panel rounded-2xl p-8 border border-slate-800 shadow-2xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
              {/* Step 1 Node */}
              <div className="flex-1 w-full flex flex-col items-center text-center p-5 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="p-3.5 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20 mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-white text-base">Upload Image</h3>
                <p className="text-xs text-slate-400 mt-1">Select any static photo</p>
              </div>

              {/* Arrow Connector 1 */}
              <div className="text-brand-400 flex items-center justify-center py-2 md:py-0">
                <ArrowRight className="w-6 h-6 hidden md:block" />
                <ArrowDown className="w-6 h-6 md:hidden" />
              </div>

              {/* Step 2 Node */}
              <div className="flex-1 w-full flex flex-col items-center text-center p-5 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="p-3.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
                  <Cpu className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-white text-base">AI Analysis</h3>
                <p className="text-xs text-slate-400 mt-1">Deep vision evaluation</p>
              </div>

              {/* Arrow Connector 2 */}
              <div className="text-brand-400 flex items-center justify-center py-2 md:py-0">
                <ArrowRight className="w-6 h-6 hidden md:block" />
                <ArrowDown className="w-6 h-6 md:hidden" />
              </div>

              {/* Step 3 Outcomes Node */}
              <div className="flex-1 w-full flex flex-col items-center text-center p-5 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="p-3.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-3">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-white text-base mb-2">Classification</h3>
                <div className="flex flex-col gap-1.5 w-full items-center">
                  <StatusBadge status="Authentic" />
                  <StatusBadge status="AI-Generated" />
                  <StatusBadge status="Uncertain" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">How It Works</h2>
            <p className="mt-3 text-slate-400 text-sm">
              Three straightforward steps to analyze static image authenticity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col items-start relative">
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold text-base mb-4">
                1
              </div>
              <h3 className="font-bold text-white text-lg">Upload an image</h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Select or drag and drop any static image file into the AuthentiScan portal.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col items-start relative">
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold text-base mb-4">
                2
              </div>
              <h3 className="font-bold text-white text-lg">Let AuthentiScan analyze it</h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                The image is evaluated for synthetic artifacts, feature consistency, and authenticity patterns.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col items-start relative">
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold text-base mb-4">
                3
              </div>
              <h3 className="font-bold text-white text-lg">Understand the result</h3>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Review clear classification outcomes backed by human-readable visual analysis details.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Explainable Visual Analysis Feature Highlight */}
      <section className="py-16 bg-slate-900/50 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="glass-panel rounded-2xl p-8 sm:p-12 border border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <Eye className="w-4 h-4 text-indigo-400" />
                Visual Explainability
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
                Explainable Results Through Visual Analysis
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                AuthentiScan does not just output a single prediction label. It provides visual analysis highlights and explainable heatmaps to help users see exactly which regions of an image contributed to the system's conclusion.
              </p>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300 pt-2">
                <li className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Visual activation overlays for transparent model reasoning</span>
                </li>
                <li className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Localized feature inspection and object highlight boundaries</span>
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Human-readable insights designed for easy comprehension</span>
                </li>
              </ul>
            </div>

            {/* Visual Heatmap Overlay Illustration Placeholder */}
            <div className="glass-card rounded-xl p-6 border border-slate-700/80 flex flex-col items-center justify-center text-center space-y-3 min-h-[260px]">
              <div className="p-4 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400">
                <Eye className="w-10 h-10" />
              </div>
              <h3 className="font-semibold text-white text-base">Visual Heatmap Preview Space</h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Visual analysis heatmaps will render here once the deep learning explainability pipeline is integrated.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
