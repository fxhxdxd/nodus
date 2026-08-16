import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3939",
      "/sse": "http://localhost:3939",
      "/messages": "http://localhost:3939",
      "/mcp": "http://localhost:3939",
    },
  },
});
