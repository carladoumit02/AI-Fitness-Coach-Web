import { defineConfig } from 'vite';

// GitHub Pages hosts this repository at /AI-Fitness-Coach-Web/.
// Vite rewrites bundled CSS/JS assets to use that prefix.
export default defineConfig({
  base: '/AI-Fitness-Coach-Web/',
});
