import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Libraries get their own chunks: they download in parallel with the game code and stay
        // cached across deploys, since only the game chunk's hash changes when we ship
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/]three[\/]/, priority: 3 },
            { name: 'firebase', test: /node_modules[\/](firebase|@firebase)[\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules[\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
