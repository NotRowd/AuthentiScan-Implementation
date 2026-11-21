import {Link} from 'react-router-dom';
import {ArrowRight} from 'lucide-react';
import ScanStatCards from './ScanStatCards';
import {useScanStatistics} from '../../hooks/useScanStatistics';

export default function ScanOverview() {
  const {state,refresh}=useScanStatistics();
  return <section className="profile-card scan-overview" aria-labelledby="scan-overview-title" aria-busy={state.loading}>
    <h2 id="scan-overview-title">Scan overview</h2>
    <div className="scan-overview-grid" aria-label="Scan statistics">
      <ScanStatCards stats={state.stats} loading={state.loading} error={state.error} headingLevel="h3"/>
    </div>
    {state.loading&&<span className="sr-only" role="status">Loading scan overview…</span>}
    {!!state.error&&<div className="scan-overview-error" role="status">Scan overview unavailable. <button type="button" onClick={refresh}>Try again</button></div>}
    <p className="scan-overview-note">Model classifications; these categories do not cover every scan.</p>
    <Link className="scan-overview-history" to="/history">View scan history <ArrowRight size={13} aria-hidden="true"/></Link>
  </section>;
}
