import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'app/**/*.test.ts',
      'party/**/*.test.ts',
      'server/**/*.test.ts',
    ],
  },
})
