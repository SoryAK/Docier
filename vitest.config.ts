import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@core": resolve(import.meta.dirname, "core") };

export default defineConfig({
  resolve: { alias },
  test: {
    pool: "threads",
    projects: [
      {
        resolve: { alias },
        test: {
          name: "core-server",
          environment: "node",
          include: ["core/**/*.test.ts", "server/**/*.test.ts", "relay/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          // Web screens in a browser-like page that talks to the real server code.
          name: "web",
          environment: "./web/src/test/jsdom-node.ts",
          include: ["web/src/**/*.test.tsx"],
        },
      },
    ],
  },
});
