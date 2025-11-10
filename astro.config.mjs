import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "hybrid",
  adapter: node({
    mode: "standalone",
  }),
  server: {
    port: 4321,
    host: true,
  },
  vite: {
    define: {
      "process.env.NODE_ENV": '"development"',
    },
  },
});
