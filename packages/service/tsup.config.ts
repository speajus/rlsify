import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/container.ts', 'src/services/schema-service.ts', 'src/services/policy-service.ts', 'src/services/health-service.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node20',
});

