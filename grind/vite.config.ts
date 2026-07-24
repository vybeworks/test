import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GRIND',
        short_name: 'GRIND',
        description: 'Plan content, track real progress, and stay consistent.',
        theme_color: '#0d0f16',
        background_color: '#0d0f16',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
})
