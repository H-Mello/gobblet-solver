import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // Cloudflare's wrangler pages-deploy injects its own plugin into this array,
  // so an explicit (even if empty) plugins array is required for the deploy to
  // succeed. Local dev/build doesn't care either way.
  plugins: [],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    open: false,
  },
});
