import {fileURLToPath} from 'node:url';
process.loadEnvFile(fileURLToPath(new URL('../.secrets/truthscan.env',import.meta.url)));
process.env.AUTHENTISCAN_ANALYSIS_PROVIDER='truthscan';
await import('./start-cloud.mjs');
