import React from 'react';
import Header from '../common/Header';
import Footer from '../common/Footer';

export default function MainLayout({ children, compactFooter = false }) {
  return (
    <div className="flex flex-col min-h-screen bg-surface text-ink">
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-grow">
        {children}
      </main>
      <Footer compact={compactFooter} />
    </div>
  );
}

