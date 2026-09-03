import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

const apiProxyTarget =
  process.env.VITE_API_PROXY?.trim() || "http://127.0.0.1:5000";

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      "/uploads": {
        target: apiProxyTarget,
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Only the framework is pinned to a chunk — it is genuinely needed for
        // first paint, and isolating it keeps it cached across app deploys.
        // Recharts and xlsx are deliberately NOT listed: naming a chunk here
        // hoists it into the entry's preload group even when only lazy routes
        // import it. Left alone, Rollup splits them into async chunks that load
        // on demand with the routes that actually chart or export.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
