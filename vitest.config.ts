import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["packages/*/src/**/*.test.ts"],exclude:["**/dist/**"],testTimeout:15000,hookTimeout:15000}});
