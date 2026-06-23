import { defineConfig } from 'vitest/config';

// Isolated test config for the iMessage watcher (a standalone ESM Node
// project). The app's root vitest config only includes `tests/**`; the
// watcher's unit tests live next to their source here.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.js', '*.test.js'],
  },
});
