import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/sse-iterator.ts'],
  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,
  target: 'node16',
});
