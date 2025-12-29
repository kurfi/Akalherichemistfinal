import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
          manifest: {
            name: 'AK Alheri Chemist',
            short_name: 'AK Chemist',
            description: 'POS and Inventory Management System',
            theme_color: '#10b981', // Emerald-500 matching your theme
            icons: [
              {
                src: 'pwa-192x192.png', // You will need to create these icons and place them in the public folder
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png'
              }
            ]
          }
        })
      ],
      css: {
        postcss: {
          plugins: [
            tailwindcss({
              config: './tailwind.config.js',
            }),
            autoprefixer,
          ],
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
