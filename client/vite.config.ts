import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const proxy = {
  '/api': 'http://localhost:3001',
};

export default defineConfig({
  plugins: [react()],
  // In development the API runs separately; the proxy keeps URLs identical to production,
  // where vercel.json rewrites /api to the backend.
  server: { proxy },
  preview: { proxy },
});
