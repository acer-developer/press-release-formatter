import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Next's tsconfig uses jsx "preserve"; tests render PDF components, so compile JSX here.
  oxc: { jsx: { runtime: "automatic" } },
  esbuild: { jsx: "automatic" },
  test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], testTimeout: 120000 },
});
