import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // GitHub Pages uses /Blue_Chip_Trading/
  // Android uses ./
  base: mode === "android" ? "./" : "/Blue_Chip_Trading/",

  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      host: "192.168.0.107",
    },
  },
}));