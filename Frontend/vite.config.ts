import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { host: true, allowedHosts: true, strictPort: false, proxy: { '/api': 'http://localhost:8080', '/uploads': 'http://localhost:8080' } } });
