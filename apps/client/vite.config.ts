import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const tauriDevHost = process.env.TAURI_DEV_HOST;

const apiProxy = {
  "/v1": {
    target: "http://127.0.0.1:3001",
    changeOrigin: true,
    ws: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: tauriDevHost ?? "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
    ...(tauriDevHost ? { hmr: { protocol: "ws" as const, host: tauriDevHost, port: 1421 } } : {}),
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
  test: {
    environment: "jsdom",
  },
});
