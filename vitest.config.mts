import { defineConfig } from 'vitest/config';
const integration = [
  'tests/database-role.test.ts',
  'tests/database.test.ts',
  'tests/resume-database.test.ts',
  'tests/operations.test.ts',
  'tests/discovery.test.ts',
  'tests/analytics-database.test.ts',
];
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: integration },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: integration,
          setupFiles: ['tests/integration-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'apps/api/src/**/*.ts',
        'apps/web/lib/**/*.ts',
        'packages/analytics/src/**/*.ts',
        'apps/web/components/ui.tsx',
        'apps/web/components/locale.tsx',
        'apps/web/components/today-workspace.tsx',
      ],
      exclude: ['**/generated/**', '**/*.d.ts'],
      thresholds: {
        lines: 68,
        statements: 68,
        branches: 68,
        functions: 64,
        'apps/api/src/domain.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'apps/api/src/ai.provider.ts': { lines: 95, branches: 75, functions: 90, statements: 95 },
        'apps/api/src/discovery.connectors.ts': {
          lines: 90,
          branches: 75,
          functions: 85,
          statements: 85,
        },
        'packages/analytics/src/index.ts': {
          lines: 100,
          branches: 90,
          functions: 100,
          statements: 98,
        },
        'apps/web/lib/api.ts': { lines: 100, branches: 90, functions: 100, statements: 100 },
      },
    },
  },
});
