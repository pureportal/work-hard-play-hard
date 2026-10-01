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
    setupFiles: ["./src/test-setup.ts"],
    include: [
      "src/components/PlayerBuildPanel.test.tsx",
      "src/components/BuildPanel.test.tsx",
      "src/components/permissions/RoomPermissionEditor.test.tsx",
      "src/components/economy/FundsPanel.test.tsx",
      "src/components/economy/DonationPanel.test.tsx",
      "src/hooks/useWorkspaceCommand.test.tsx",
      "src/Workspace.player-assets.test.tsx",
      "src/components/guide/guide-steps.test.ts",
      "src/api.test.ts",
      "src/components/ArcadeGame.test.tsx",
      "src/components/ChessGame.test.tsx",
      "src/falling-blocks-prediction.test.ts",
      "src/falling-blocks-spectating.test.ts",
      "src/image-cache.test.ts",
      "src/media-connection.test.ts",
      "src/server-url.test.ts",
      "src/workspace-state.test.ts",
      "src/components/whiteboard/whiteboard-merge.test.ts",
    ],
  },
});
