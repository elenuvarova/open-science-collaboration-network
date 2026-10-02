import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API_PROXY=https://noda.science npm run dev — preview against the live API
      "/api": { target: process.env.API_PROXY || "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
