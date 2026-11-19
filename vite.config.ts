import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the build works from any folder, including file://.
  base: './',
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2022',
    // No source maps in the shipped file.
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
