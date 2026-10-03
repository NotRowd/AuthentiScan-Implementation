import React from 'react';

export default function Card({ children, title, subtitle, icon: Icon, action, className = '' }) {
  return (
    <div className={`glass-card min-w-0 rounded-xl p-4 sm:p-6 shadow-lg transition-all duration-300 ${className}`}>
      {(title || Icon || action) && (
        <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <div className="p-2.5 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div>
              {title && <h3 className="font-semibold text-white text-lg leading-tight">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}
