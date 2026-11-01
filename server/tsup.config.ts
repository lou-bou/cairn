import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // Workspace source is TypeScript, so it has to be bundled in; npm deps stay external.
  noExternal: ['@cairn/shared'],
});
