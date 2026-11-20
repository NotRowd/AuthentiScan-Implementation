// Opt-in development LAN API only. AI models and admin/emulator ports remain local.
process.env.AUTHENTISCAN_MOBILE_LAN='1';
console.warn('Mobile development mode: API port 5002 is available on your trusted local network. Use HTTPS for production; do not port-forward.');
await import('./start-cloud-experimental.mjs');
