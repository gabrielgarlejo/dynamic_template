import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { RENDER_PORT } from "./shared/template.ts";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${RENDER_PORT}`,
    },
  },
});
