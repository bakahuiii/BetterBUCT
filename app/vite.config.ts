import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'node:path'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      // Only polyfill what's actually needed by cheerio/parse5 in the browser
      include: ['stream', 'buffer', 'process', 'util', 'assert', 'querystring', 'url', 'events', 'zlib'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      overrides: {
        buffer: './src/mobile/polyfills/node-buffer.mjs',
        crypto: './src/mobile/polyfills/node-crypto.mjs',
        module: './src/mobile/polyfills/node-module.mjs',
        path: './src/mobile/polyfills/node-path.mjs',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Externals used by the reused core/ modules (core/ is outside app/node_modules)
      'iconv-lite': path.resolve(__dirname, './node_modules/iconv-lite/lib/index.js'),
      'cheerio': path.resolve(__dirname, './node_modules/cheerio/dist/browser/index.js'),
      // node: aliases must be direct so reused core/ modules get our polyfills
      'node:crypto': path.resolve(__dirname, './src/mobile/polyfills/node-crypto.mjs'),
      'node:buffer': path.resolve(__dirname, './src/mobile/polyfills/node-buffer.mjs'),
      'node:module': path.resolve(__dirname, './src/mobile/polyfills/node-module.mjs'),
      'node:path': path.resolve(__dirname, './src/mobile/polyfills/node-path.mjs'),
      'node:perf_hooks': path.resolve(__dirname, './src/mobile/polyfills/node-perf.mjs'),
      // node-polyfills shims must resolve even from core/ (outside app root)
      'vite-plugin-node-polyfills/shims/buffer': path.resolve(__dirname, './node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js'),
      'vite-plugin-node-polyfills/shims/global': path.resolve(__dirname, './node_modules/vite-plugin-node-polyfills/shims/global/dist/index.js'),
      'vite-plugin-node-polyfills/shims/process': path.resolve(__dirname, './node_modules/vite-plugin-node-polyfills/shims/process/dist/index.js'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      // Exclude large node polyfills not needed by the app
      external: ['fsevents', 'node:os', 'node:http', 'node:net', 'node:tls', 'node:dns', 'node:dgram'],
    },
  },
})
