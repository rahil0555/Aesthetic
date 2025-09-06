import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // Or your framework plugin

export default defineConfig({
  plugins: [react()], // Your plugins
  server: {
    host: true, // Or '0.0.0.0'
    // You can also optionally specify a port if needed
    // port: 5174,
  },
});