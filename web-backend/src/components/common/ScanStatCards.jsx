import {Scan,Clock,AlertTriangle,ShieldCheck} from 'lucide-react';

const count=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

/** Dashboard cards, shared verbatim; compact presentation is scoped by the profile. */
export default function ScanStatCards({stats,loading=false,error='',headingLevel='h2'}) {
  const Heading=headingLevel;
  const metrics=[
    {title:'Total scans',value:count(stats?.total_scans),note:'Saved to your account',icon:Scan},
    {title:'Scans remaining',value:stats?.scans_remaining===null?'Unlimited':count(stats?.scans_remaining),note:stats?.plan?.scan_limit!=null?`${stats.plan.scan_limit} scans/day`:'Current allowance',icon:Clock},
    {title:'AI-generated',value:count(stats?.ai_generated_found),note:'Model classifications',icon:AlertTriangle},
    {title:'Authentic',value:count(stats?.authentic_found),note:'Model classifications',icon:ShieldCheck},
  ];
  return metrics.map(({title,value,note,icon:Icon})=><div key={title} className="min-w-0 rounded-3xl border border-line bg-surface p-4 sm:p-5 shadow-sm">
    <div className="flex items-start justify-between gap-1">
      <Heading className="scan-stat-label text-xs font-medium leading-relaxed text-ink-secondary">{title}</Heading>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft"><Icon aria-hidden="true" className="h-3.5 w-3.5 text-accent"/></div>
    </div>
    <p className={`mt-2 font-bold tracking-tight tabular-nums text-ink ${value==='Unlimited'?'text-xl sm:text-2xl':'text-3xl'}`}>
      {loading||error||value===null?'—':typeof value==='number'?value.toLocaleString():value}
    </p>
    <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{loading?'Loading…':error||value===null?'Unavailable':note}</p>
  </div>);
}
