import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root,
  plugins: [react()],
  server: {
    proxy: {
      '/api/hankyung-rss': {
        target: 'https://www.hankyung.com',
        changeOrigin: true,
        rewrite: (path) => {
          const feedPath = new URL(path, 'http://localhost').searchParams.get('feed') ?? 'all-news'
          const allowedFeedPaths = new Set([
            'all-news',
            'finance',
            'economy',
            'realestate',
            'it',
            'politics',
            'international',
            'society',
            'life',
            'opinion',
            'sports',
            'entertainment',
            'video',
          ])

          return `/feed/${allowedFeedPaths.has(feedPath) ? feedPath : 'all-news'}`
        },
      },
    },
  },
})
