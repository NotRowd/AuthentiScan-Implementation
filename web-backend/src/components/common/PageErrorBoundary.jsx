import {Component} from 'react';

export default class PageErrorBoundary extends Component {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" className="max-w-xl mx-auto my-12 p-6 rounded-2xl border border-danger bg-surface text-ink">
      <h1 className="text-2xl font-bold mb-3">This page could not be displayed</h1>
      <p className="text-sm leading-relaxed">If an upload was in progress, check Scan History before trying again. Reloading this page will not automatically submit another scan.</p>
      <div className="flex flex-wrap gap-3 mt-6">
        <button type="button" className="button-primary" onClick={() => window.location.reload()}>Reload page</button>
        <a className="button-secondary" href="/history">Open Scan History</a>
      </div>
    </main>;
  }
}
