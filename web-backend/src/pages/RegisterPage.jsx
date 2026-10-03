import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import MainLayout from '../components/layout/MainLayout';
import { registerAccount, saveAuthSession } from '../services/api';
import logo from '../assets/logo.png';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter both your first and last name.');
      return;
    }

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await registerAccount({
        firstName,
        lastName,
        email,
        password
      });

      saveAuthSession(response.data, true);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4 py-12 relative overflow-hidden bg-slate-50">
        
        {/* Soft Background Gradients */}
        <div aria-hidden="true" className="absolute top-0 left-0 -ml-20 -mt-20 w-[40rem] h-[40rem] rounded-full bg-sky-200/30 blur-3xl pointer-events-none" />
        <div aria-hidden="true" className="absolute bottom-0 right-0 -mr-20 -mb-20 w-[30rem] h-[30rem] rounded-full bg-blue-100/30 blur-3xl pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md relative z-10"
        >
          {/* Card Wrapper */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-2xl shadow-sky-100/50 border border-slate-200/80">
            {/* Header branding */}
            <div className="text-center mb-10">
              <Link to="/" className="inline-block mb-6">
                <img src={logo} alt="AuthentiScan Logo" className="w-14 h-14 mx-auto object-contain drop-shadow-md hover:scale-105 transition-transform duration-300" />
              </Link>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Create Account</h1>
              <p className="text-slate-500 font-medium text-sm mt-2">Register for AuthentiScan Capstone Platform</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    First Name
                  </label>
                  <div className="relative group">
                    <User className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-sky-500 transition-colors" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Alex"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Last Name
                  </label>
                  <div className="relative group">
                    <User className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-sky-500 transition-colors" />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Johnson"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  University / Academic Email
                </label>
                <div className="relative group">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-sky-500 transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@college.edu"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Create Password
                </label>
                <div className="relative group">
                  <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-sky-500 transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength="8"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 pt-1 group">
                <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    required
                    className="peer appearance-none w-5 h-5 rounded-md border-2 border-slate-300 bg-white checked:bg-sky-500 checked:border-sky-500 transition-colors cursor-pointer focus:ring-4 focus:ring-sky-500/20 outline-none"
                  />
                  <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors cursor-pointer select-none">
                  I accept the academic research terms & privacy guidelines.
                </span>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl border border-rose-200 bg-rose-50 p-4"
                  role="alert"
                >
                  <p className="text-sm font-medium text-rose-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                    {error}
                  </p>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-4 rounded-xl font-bold bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:text-slate-500 text-white shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2 text-base"
              >
                {isSubmitting ? 'Creating account...' : 'Register'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 text-center text-sm font-medium text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="text-sky-600 font-bold hover:text-sky-700 hover:underline underline-offset-4 transition-colors">
                Sign In
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </MainLayout>
  );
}
