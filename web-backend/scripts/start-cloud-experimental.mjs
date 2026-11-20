// Explicit per-process opt-in; no .env secrets or production approval are changed.
process.env.AUTHENTISCAN_LOCALIZATION_MODE='experimental';
console.warn('Starting with EXPERIMENTAL manipulation localization: validation failed; prototype use only.');
await import('./start-cloud.mjs');
