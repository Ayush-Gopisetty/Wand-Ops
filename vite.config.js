import { defineConfig } from 'vite';

export default defineConfig({
  // index.html lives at root; /public holds static assets (styles.css etc.)
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
