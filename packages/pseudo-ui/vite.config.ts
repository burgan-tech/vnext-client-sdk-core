import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    dts({ rollupTypes: false, tsconfigPath: './tsconfig.json' }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'adapters/vue/index': resolve(__dirname, 'src/adapters/vue/index.ts'),
        'adapters/vue/style': resolve(__dirname, 'src/adapters/vue/style.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vue', 'primevue', /^primevue\//, /^@primeuix\//, 'primeicons',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
})
