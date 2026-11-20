import {useEffect, useState} from 'react';
import {CreditCard} from 'lucide-react';
import {fetchUserStats} from '../../services/api';
import ScanCreditNotice from './ScanCreditNotice';

// Display the server's effective entitlement, never the cached sidebar plan.
export default function ScanAllowance({scan}) {
  const [state, setState] = useState({data:null, failed:false});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({data:null, failed:false});
    const timeout = setTimeout(() => controller.abort(), 12000);
    fetchUserStats(controller.signal).then(response => {
      const data = response?.data, limit = data?.plan?.scan_limit, remaining = data?.scans_remaining;
      if (!(limit === null && remaining === null) &&
          !(Number.isSafeInteger(limit) && limit >= 0 && Number.isSafeInteger(remaining) && remaining >= 0 && remaining <= limit)) {
        throw new Error('Allowance unavailable');
      }
      if (active) setState({data, failed:false});
    }).catch(() => { if (active) setState({data:null, failed:true}); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [scan?.scan_id, attempt]);

  useEffect(() => {
    const refresh = () => {if (document.visibilityState === 'visible') setAttempt(value => value + 1);};
    const now = Date.parse(state.data?.server_now);
    const delays = [state.data?.allowance_resets_at, state.data?.plan?.expires_at]
      .map(date => Date.parse(date) - now).filter(delay => Number.isFinite(delay) && delay > 0);
    const timer = delays.length ? setTimeout(refresh, Math.min(...delays, 86400000) + 1000) : null;
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh);};
  }, [state.data]);

  const data = state.data, unlimited = data?.plan?.scan_limit === null;
  return <aside aria-label="Active scan allowance" className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><CreditCard aria-hidden="true" className="h-4 w-4"/></span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Active plan</p>
        <p className="mt-1 break-words text-sm font-semibold text-ink">{data ? data.plan.name || 'Current plan' : state.failed ? 'Plan unavailable' : 'Checking plan…'}</p>
        {data && <p className="mt-1 text-xs leading-relaxed text-ink-secondary tabular-nums">{unlimited ? 'Unlimited scans · No daily cap' : `${data.scans_remaining.toLocaleString()} of ${data.plan.scan_limit.toLocaleString()} scans remaining today`}</p>}
      </div>
    </div>
    {data && !unlimited && <p className="mt-3 text-xs leading-relaxed text-ink-muted">Daily allowance resets at midnight Philippine time. Failed scans do not use a credit.</p>}
    {state.failed && <div className="mt-3 text-xs text-ink-secondary"><p>Could not confirm your current allowance.</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 rounded-lg border border-line px-3 py-2 font-semibold text-accent hover:bg-accent-soft">Retry allowance</button></div>}
    <div className="mt-4 border-t border-line pt-1">
      <ScanCreditNotice scan={scan}/>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">Opening reports and exporting PDFs uses no additional scan credit.</p>
    </div>
  </aside>;
}
