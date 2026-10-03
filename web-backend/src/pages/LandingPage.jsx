import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ScanLine, Layers, FileText, ShieldCheck, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import MainLayout from '../components/layout/MainLayout';
import { getAuthToken } from '../services/api';
import logo from '../assets/logo.png';

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

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

export default function LandingPage() {
  const signedIn = Boolean(getAuthToken());

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sky-50 to-white pb-16 pt-24 lg:pt-32">
        <div aria-hidden="true" className="absolute top-0 right-0 -mr-20 -mt-20 w-[40rem] h-[40rem] rounded-full bg-sky-200/40 blur-3xl pointer-events-none" />
        <div aria-hidden="true" className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[30rem] h-[30rem] rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />
        
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div 
            initial="hidden" 
            animate="visible" 
            variants={staggerContainer}
          >
            <motion.div variants={fadeIn} className="flex items-center gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-700 uppercase tracking-wide">
                <ShieldCheck className="w-3.5 h-3.5" />
                AI-Powered Authenticity
              </span>
            </motion.div>
            
            <motion.h1 variants={fadeIn} className="text-4xl sm:text-5xl xl:text-6xl leading-[1.15] font-extrabold tracking-tight text-slate-900">
              Verify images with <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-blue-600">confidence.</span>
            </motion.h1>
            
            <motion.p variants={fadeIn} className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
              AuthentiScan helps you analyze images and identify whether they may be AI-generated or manipulated. Upload an image, explore the model's reasoning, and keep a report of what you found.
            </motion.p>
            
            <motion.div variants={fadeIn} className="mt-8 flex flex-wrap gap-4 items-center">
              <Link 
                className="px-6 py-3.5 rounded-full text-base font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2" 
                to={signedIn ? '/scan' : '/register'}
              >
                {signedIn ? 'Start Scanning' : 'Scan an Image'}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a 
                className="px-6 py-3.5 rounded-full text-base font-bold text-slate-700 bg-white border-2 border-slate-200 hover:border-sky-200 hover:bg-sky-50 transition-colors flex items-center gap-2" 
                href="#how-it-works"
              >
                Learn More
              </a>
            </motion.div>
            
            <motion.p variants={fadeIn} className="mt-6 text-sm text-slate-500 font-medium">
              Supports JPEG, PNG, WebP up to 10 MB
            </motion.p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative lg:pl-10"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-sky-100 to-blue-50 rounded-[2.5rem] transform rotate-3 scale-105 opacity-50 blur-lg"></div>
            <div className="relative rounded-3xl border border-slate-200/60 bg-white/80 backdrop-blur-xl shadow-2xl overflow-hidden p-6 sm:p-10 flex flex-col items-center">
              <img src={logo} alt="AuthentiScan Shield" className="w-32 h-32 md:w-48 md:h-48 object-contain mb-8 drop-shadow-xl" />
              
              <div className="w-full bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4 mb-4">
                  <ShieldCheck className="w-6 h-6 text-sky-500" />
                  <span className="font-bold text-slate-800 text-lg">Analysis Workspace</span>
                </div>
                <div className="space-y-3 text-slate-600 font-medium">
                  {['AI image classification', 'Grad-CAM visual explanation', 'Downloadable PDF reports'].map((text, i) => (
                    <div key={text} className="flex gap-3 items-center">
                      <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5 text-sky-600" />
                      </div>
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20 lg:py-28">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, margin: "-100px" }}
          variants={fadeIn}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-sky-500 mb-3 block">Built for clarity</span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">From a prediction to a useful record.</h2>
        </motion.div>

        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, margin: "-50px" }}
          variants={staggerContainer}
          className="grid md:grid-cols-3 gap-8"
        >
          {features.map(({ icon: Icon, title, text }) => (
            <motion.article 
              variants={fadeIn}
              key={title} 
              className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-sky-100/50 hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-14 h-14 rounded-xl bg-sky-50 flex items-center justify-center mb-6 group-hover:bg-sky-500 transition-colors duration-300">
                <Icon className="w-7 h-7 text-sky-500 group-hover:text-white transition-colors duration-300" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
              <p className="text-base text-slate-600 leading-relaxed">{text}</p>
            </motion.article>
          ))}
        </motion.div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="bg-slate-50 border-y border-slate-200 py-20 lg:py-28 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: false, margin: "-100px" }}
            variants={fadeIn}
            className="mb-16"
          >
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-sky-500 mb-3 block">How it works</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">A simple, three-step workflow.</h2>
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-10">
            {[['Upload an image', 'Sign in and choose a supported image. Your scan is saved to your account securely.'], 
              ['Review the result', 'Read the verdict and explanation. Use the heatmap as context, not definitive evidence.'], 
              ['Revisit or export', 'Open a saved result from History and export a PDF without running another scan.']
             ].map(([title, text], index) => (
              <motion.article 
                key={title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative"
              >
                <span className="text-sky-200 font-bold text-6xl absolute -top-8 -left-4 opacity-50 select-none z-0">
                  0{index + 1}
                </span>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-slate-900 mt-3 mb-3">{title}</h3>
                  <p className="text-base text-slate-600 leading-relaxed">{text}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="max-w-3xl mx-auto px-5 sm:px-8 py-20 lg:py-28 scroll-mt-20">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, margin: "-100px" }}
          variants={fadeIn}
          className="text-center mb-12"
        >
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-sky-500 mb-3 block">Before you scan</span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Frequently asked questions</h2>
        </motion.div>
        
        <div className="space-y-4">
          {questions.map(([question, answer], i) => (
            <motion.details 
              key={question} 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="group bg-white border border-slate-200 rounded-2xl p-6 open:shadow-md transition-all"
            >
              <summary className="cursor-pointer font-bold text-lg text-slate-800 group-open:text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 select-none list-none flex justify-between items-center">
                {question}
                <span className="ml-4 shrink-0 transition-transform duration-300 group-open:rotate-180 flex items-center justify-center w-8 h-8 rounded-full bg-slate-50 group-hover:bg-sky-50 text-slate-400 group-hover:text-sky-500">
                  <svg width="12" height="12" fill="none" viewBox="0 0 12 12"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.5 4.5l3.5 3.5 3.5-3.5"/></svg>
                </span>
              </summary>
              <div className="mt-4 text-base leading-relaxed text-slate-600 border-t border-slate-100 pt-4">
                {answer}
              </div>
            </motion.details>
          ))}
        </div>
        
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-5"
        >
          <Link 
            className="px-8 py-4 rounded-full text-base font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2" 
            to={signedIn ? '/dashboard' : '/register'}
          >
            {signedIn ? 'Open your dashboard' : 'Get started for free'}
            <ArrowRight className="w-5 h-5" />
          </Link>
          {!signedIn && (
            <Link className="text-base font-semibold text-slate-600 hover:text-sky-500 transition-colors" to="/login">
              Already have an account? Sign in
            </Link>
          )}
        </motion.div>
      </section>
    </MainLayout>
  );
}
