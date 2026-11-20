import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins:[react()],
  optimizeDeps:{entries:['index.html']},
  server:{host:'127.0.0.1',port:5174,strictPort:true,
    watch:{ignored:['**/.detector-venv/**','**/.detector-models/**','**/.test-results/**','**/.local-media/**','**/.secrets/**','**/.emulator-data/**','**/.emulator-snapshots/**']},
    fs:{deny:['.env','.env.*','**/.git/**','**/.secrets/**','**/*firebase-admin*.json','**/.local-media/**','**/.emulator-data/**','**/.emulator-snapshots/**','**/firebase-export-*/**','**/.test-results/**','**/.detector-venv/**','**/.detector-models/**']},
    proxy:{'/api':{target:'http://127.0.0.1:5002',timeout:690000,proxyTimeout:690000}}},
  preview:{host:'127.0.0.1',port:5174,strictPort:true},
});
