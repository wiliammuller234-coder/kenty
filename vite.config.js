import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // The Android/Capacitor build serves dist/ from its own local root, so absolute
  // "/kenty/..." asset paths (meant for a /kenty/ web deployment) would 404 there —
  // CAP_BUILD switches to a root base for that build only.
  base: process.env.CAP_BUILD ? '/' : '/kenty/',
  // Some of the phones this actually runs on carry a years-stale Android System
  // WebView that predates optional chaining/nullish coalescing support — esbuild's
  // default target assumes a current browser, so the bundle would fail to even
  // parse (a syntax error at load time, invisible to any in-app error boundary,
  // showing as a dead blank screen) instead of just running slightly less optimally.
  build: { target: 'es2017' },
  plugins: [react()],
})
