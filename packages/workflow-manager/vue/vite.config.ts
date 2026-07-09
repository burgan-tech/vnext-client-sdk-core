import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      outDir: 'dist',
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AmorphieWorkflowManagerVue',
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      formats: ['es', 'cjs'],
    },
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      external: ['amorphie-workflow-manager', 'vue'],
    },
  },
});
