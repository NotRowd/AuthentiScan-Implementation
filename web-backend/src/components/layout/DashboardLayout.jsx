import React from 'react';
import Header from '../common/Header';
import Sidebar from '../common/Sidebar';
import Footer from '../common/Footer';

export default function DashboardLayout({ children, wide = false }) {
  return (
    <div className="flex flex-col min-h-screen bg-canvas text-ink">
      <Header workspace />
      <div className="flex flex-1 relative z-0">
        <Sidebar />
        <main id="main-content" tabIndex={-1} className={`flex-1 min-w-0 p-4 sm:p-6 lg:p-10 mx-auto w-full ${wide ? 'max-w-none' : 'max-w-7xl'}`}>
          {children}
        </main>
      </div>
      <Footer compact />
    </div>
  );
}

