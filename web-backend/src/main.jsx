import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

try {
  const [{default: App}, {ready}] = await Promise.all([
    import('./App'),
    import('./services/api'),
  ]);
  await ready;
  root.render(<React.StrictMode><App /></React.StrictMode>);
} catch {
  root.render(
    <main role="alert" style={{maxWidth: 640, margin: '48px auto', padding: 24}}>
      <h1>AuthentiScan could not start</h1>
      <p>Check that the backend is running and that your internet connection is available for cloud mode.</p>
      <p>If you just changed modes or updated the app, stop its terminal with Enter, then restart using <code>npm start</code> for local emulators or <code>npm run start:cloud</code> for cloud accounts.</p>
      <p>Your saved records have not been cleared.</p>
      <button type="button" onClick={() => window.location.reload()}>Try again</button>
    </main>,
  );
}
