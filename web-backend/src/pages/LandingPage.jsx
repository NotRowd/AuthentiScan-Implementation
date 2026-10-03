import { Link } from 'react-router-dom';
import { ArrowRight, ScanLine, Layers, FileText, ShieldCheck, Check } from 'lucide-react';
import MainLayout from '../components/layout/MainLayout';
import { getAuthToken } from '../services/api';

const features = [
  { icon: ScanLine, title: 'A clearer starting point', text: 'Review an authenticity classification alongside the model’s confidence and class scores.' },
  { icon: Layers, title: 'Look beyond the label', text: 'Explore a Grad-CAM heatmap showing image regions that contributed to the displayed class score.' },
  { icon: FileText, title: 'Keep the full picture', text: 'Revisit saved scans and export a PDF with the result, model version, limitations, and available heatmap.' },
];
const questions = [
  ['Does a result prove an image is real or fake?', 'No. Predictions and confidence scores are model estimates, not proof. Review the source and context alongside the result. Confidence is not the model’s overall accuracy.'],
  ['Which images can I upload?', 'JPEG, PNG, and WebP images up to 10 MB. Image quality and unfamiliar content can affect results.'],
  ['What does the heatmap explain?', 'Grad-CAM highlights regions that contributed to the predicted class. It does not identify proven manipulated areas, individual objects, or named facial features.'],
  ['Can I open these scans on mobile?', 'Mobile has not been migrated to this Firebase version yet. It still uses the separate original system.'],
  ['Does exporting use another scan?', 'No. A PDF is created from an existing saved result, without a new analysis or another scan allowance.'],
];

export default function LandingPage() {
  const signedIn = Boolean(getAuthToken());
  return (
    <MainLayout>
      <section className="relative overflow-hidden border-b border-slate-800">
        <div aria-hidden="true" className="absolute -top-48 right-0 w-[36rem] h-[36rem] rounded-full bg-brand-600/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="eyebrow mb-5">Image analysis, with context</p>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl leading-[1.1] font-bold tracking-tight">Inspect the image.<br /><span className="gradient-text">Understand the estimate.</span></h1>
            <p className="mt-6 text-base sm:text-lg text-slate-400 leading-relaxed max-w-xl">An explainable AI workspace for reviewing image authenticity. Upload an image, explore the model’s reasoning, and keep a report of what you found.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="button-primary" to={signedIn ? '/scan' : '/register'}>{signedIn ? 'Scan an image' : 'Create an account'}<ArrowRight className="w-4 h-4" /></Link>
              <a className="button-secondary" href="#how-it-works">See how it works</a>
            </div>
            <p className="mt-5 text-xs text-slate-400">JPEG, PNG, WebP · Up to 10 MB · Scores are estimates, not proof</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 shadow-2xl p-5 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-5"><span className="font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand-400" />Your analysis workspace</span><span className="text-[10px] uppercase tracking-wider text-slate-400">Overview</span></div>
            <div className="my-6 rounded-xl border border-dashed border-brand-500/40 bg-brand-500/5 p-8 flex flex-col items-center text-center gap-3"><ScanLine className="w-12 h-12 text-brand-300" /><p className="font-medium">One image. More context.</p><p className="text-sm text-slate-400">Classification + visual explanation + saved report</p></div>
            <div className="space-y-4">{['Review the predicted class and scores', 'Explore an available Grad-CAM heatmap', 'Save a PDF from your scan history'].map(text => <div key={text} className="flex gap-3 text-sm text-slate-300"><Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />{text}</div>)}</div>
            <p className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400">Powered by EfficientNet-B0 and Grad-CAM. Object detection is not currently available.</p>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-16">
        <p className="eyebrow">Built around your review</p><h2 className="section-heading mt-3">From a prediction to a useful record.</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-8">{features.map(({ icon: Icon, title, text }) => <article key={title} className="glass-panel rounded-xl p-6"><Icon className="w-6 h-6 text-brand-300 mb-6" /><h3 className="text-lg font-semibold mb-3">{title}</h3><p className="text-sm leading-relaxed text-slate-400">{text}</p></article>)}</div>
      </section>
      <section id="how-it-works" className="border-y border-slate-800 bg-slate-900/40 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16"><p className="eyebrow">How it works</p><h2 className="section-heading mt-3">A simple, three-step workflow.</h2><div className="grid md:grid-cols-3 gap-8 mt-8">{[['Upload an image', 'Sign in and choose a supported image. Your scan is saved to your account.'], ['Review the result', 'Read the verdict and explanation. Use the heatmap as context, not evidence of manipulation.'], ['Revisit or export', 'Open a saved result from History and export a PDF without running another scan.']].map(([title, text], index) => <article key={title}><span className="text-brand-300 font-mono text-sm">0{index + 1}</span><h3 className="text-lg font-semibold mt-3 mb-2">{title}</h3><p className="text-sm text-slate-400 leading-relaxed">{text}</p></article>)}</div></div>
      </section>
      <section id="faq" className="max-w-3xl mx-auto px-5 sm:px-8 py-16 scroll-mt-24"><p className="eyebrow">Before you scan</p><h2 className="section-heading mt-3 mb-8">A few things worth knowing.</h2><div className="divide-y divide-slate-800">{questions.map(([question, answer]) => <details key={question} className="py-5"><summary className="cursor-pointer font-medium text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">{question}</summary><p className="mt-3 text-sm leading-relaxed text-slate-400">{answer}</p></details>)}</div><div className="mt-8 flex flex-wrap items-center gap-4"><Link className="button-primary" to={signedIn ? '/dashboard' : '/register'}>{signedIn ? 'Open your dashboard' : 'Get started'}<ArrowRight className="w-4 h-4" /></Link>{!signedIn && <Link className="text-sm text-brand-300 hover:text-white" to="/login">Already have an account? Sign in</Link>}</div></section>
    </MainLayout>
  );
}
