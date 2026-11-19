import { defineConfig } from 'vitest/config';
import { singleFile } from './tools/single-file.ts';

export default defineConfig({
  // Relative paths so the build works from any folder, including file://.
  base: './',
  plugins: [singleFile()],
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2022',
    // No source maps in the shipped file.
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
