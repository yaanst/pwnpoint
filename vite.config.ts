import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { singleFile } from './tools/single-file.ts';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  // Relative paths so the build works from any folder, including file://.
  base: './',
  plugins: [singleFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
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
