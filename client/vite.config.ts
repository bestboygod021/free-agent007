import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const serverPort = env.PORT ?? process.env.PORT ?? 3001

  return {
    plugins: [react(), tailwindcss()],
    base: process.env.VITE_BASE ?? '/',
<<<<<<< HEAD
    build: {
      rolldownOptions: {
        output: {
          // Vendor groups for the eager shell only: React, the router/query
          // stack and the UI primitives become small boot chunks, while
          // page-only graphs (recharts/d3 with AnalyticsPage, etc.) stay in
          // their lazy route chunks — no catch-all node_modules group, or
          // they would be dragged back into the entry bundle.
          codeSplitting: {
            groups: [
              { name: 'vendor-react', test: /node_modules[/\\](react|react-dom|scheduler)[/\\]/ },
              { name: 'vendor-router', test: /node_modules[/\\](@tanstack|react-router|history)[/\\]/ },
              { name: 'vendor-ui', test: /node_modules[/\\](@base-ui|lucide-react|cmdk)[/\\]/ },
            ],
          },
        },
      },
    },
=======
>>>>>>> upstream/main
    envDir: path.resolve(__dirname, '..'),
    define: {
      __SERVER_PORT__: JSON.stringify(String(serverPort)),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
<<<<<<< HEAD
      // Sandboxed/remote dev previews (e2b, Codespaces, gitpod…) serve the dev
      // server through a generated hostname. Vite's host check rejects those by
      // default, so allow them explicitly; the dev server is never the
      // production surface.
      allowedHosts: ['.e2b.app', '.app.github.dev', '.gitpod.io', 'localhost'],
=======
>>>>>>> upstream/main
      proxy: {
        // Force IPv4 — on Windows + Node 17+, `localhost` resolves to ::1 first,
        // which can collide with wslrelay / Docker Desktop listeners on the same port.
        '/api': `http://127.0.0.1:${serverPort}`,
        '/v1': `http://127.0.0.1:${serverPort}`,
      },
    },
  }
})
