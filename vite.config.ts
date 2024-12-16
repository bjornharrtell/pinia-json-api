import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), dts({ rollupTypes: true, tsconfigPath: './tsconfig.app.json' })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/lib.ts'),
      formats: ['es'],
      fileName: 'lib',
    },
  },
})
