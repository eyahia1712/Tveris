import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"], testTimeout: 60_000 },
});
