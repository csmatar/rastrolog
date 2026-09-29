import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["bundle/**/*.test.ts"], environment: "node" },
});
