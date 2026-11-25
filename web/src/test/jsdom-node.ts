import type { Environment } from "vitest/runtime";
import { builtinEnvironments } from "vitest/runtime";

const jsdom = builtinEnvironments.jsdom;

/**
 * A browser-like page (jsdom) whose modules load the way Node loads them, so a
 * web test can talk to the real server code, node:sqlite and all. Files and
 * forms stay Node's own, so a photo the page picks is the same kind of File
 * the server reads, as it would be after crossing the network.
 */
export default {
  ...jsdom,
  name: "jsdom-node",
  viteEnvironment: "ssr",
  async setup(global, options) {
    const node = { File: global.File, Blob: global.Blob, FormData: global.FormData };
    const page = await jsdom.setup(global, options);
    for (const [name, value] of Object.entries(node)) {
      Object.defineProperty(global, name, { value, writable: true, configurable: true });
    }
    return page;
  },
} satisfies Environment;
