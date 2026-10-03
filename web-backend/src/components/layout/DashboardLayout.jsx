import React from 'react';
import Header from '../common/Header';
import Sidebar from '../common/Sidebar';
import Footer from '../common/Footer';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900">
      <Header workspace />
      <div className="flex flex-1 relative z-0">
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
      <Footer compact />
    </div>
  );
}

