import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev-mode proxy target: the local Nodus server. Honors NODUS_PORT so
// `NODUS_PORT=4000 npm run dev` lines up with a server on the same port.
const serverOrigin = `http://localhost:${process.env.NODUS_PORT ?? 3939}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/api": serverOrigin,
      "/sse": serverOrigin,
      "/messages": serverOrigin,
      "/mcp": serverOrigin,
    },
  },
});
