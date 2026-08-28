import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { transformSync } from 'esbuild'
import path from 'node:path'

// Force every emitted chunk (including node_modules dependencies, which Vite
// does not transform by default) to syntax that Android 9's WebView
// (Chromium 74) can parse: optional chaining, nullish coalescing, class
// fields, etc. are all transpiled away here.
function legacySyntaxTransformPlugin() {
  return {
    name: 'theia-legacy-syntax-transform',
    apply: 'build' as const,
    generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string; fileName: string; map?: unknown }>) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk' || typeof file.code !== 'string') continue;
        try {
          const result = transformSync(file.code, {
            target: ['chrome74'],
            format: 'esm',
            loader: 'js',
            minify: false,
          });
          file.code = result.code;
        } catch (error) {
          console.warn('[legacy-transform] failed for ' + file.fileName + ': ' + String(error));
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
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
    legacySyntaxTransformPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'iconv-lite': path.resolve(__dirname, './node_modules/iconv-lite/lib/index.js'),
      'cheerio': path.resolve(__dirname, './node_modules/cheerio/dist/browser/index.js'),
      'pdf-parse': path.resolve(__dirname, './node_modules/pdf-parse/dist/pdf-parse/web/pdf-parse.es.js'),
      // node-polyfills shims must resolve even from core/ (outside app root)
      'vite-plugin-node-polyfills/shims/buffer': path.resolve(__dirname, './node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js'),
      'vite-plugin-node-polyfills/shims/global': path.resolve(__dirname, './node_modules/vite-plugin-node-polyfills/shims/global/dist/index.js'),
      'vite-plugin-node-polyfills/shims/process': path.resolve(__dirname, './node_modules/vite-plugin-node-polyfills/shims/process/dist/index.js'),
      'node:crypto': path.resolve(__dirname, './src/mobile/polyfills/node-crypto.mjs'),
      'node:buffer': path.resolve(__dirname, './src/mobile/polyfills/node-buffer.mjs'),
      'node:module': path.resolve(__dirname, './src/mobile/polyfills/node-module.mjs'),
      'node:path': path.resolve(__dirname, './src/mobile/polyfills/node-path.mjs'),
      'node:perf_hooks': path.resolve(__dirname, './src/mobile/polyfills/node-perf.mjs'),
      'node:fs/promises': path.resolve(__dirname, './src/mobile/polyfills/node-fs.mjs'),
      'node:fs': path.resolve(__dirname, './src/mobile/polyfills/node-fs.mjs'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
  },
  build: {
    target: 'es2018',
    outDir: 'dist',
    chunkSizeWarningLimit: 4096,
  },
})
