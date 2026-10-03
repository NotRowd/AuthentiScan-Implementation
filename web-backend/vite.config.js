import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins:[react()],
  server:{host:'127.0.0.1',port:5174,strictPort:true,
    fs:{deny:['.env','.env.*','**/.git/**','**/.secrets/**','**/*firebase-admin*.json','**/.local-media/**','**/.emulator-data/**','**/.emulator-snapshots/**','**/firebase-export-*/**','**/.test-results/**']},
    proxy:{'/api':{target:'http://127.0.0.1:5002',timeout:180000,proxyTimeout:180000}}},
  preview:{host:'127.0.0.1',port:5174,strictPort:true},
});
