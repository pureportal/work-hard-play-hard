import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { reloadUpdatedClient } from "./client-update";
import { ContextMenuProvider } from "./components/ContextMenu";
import "./styles.css";
import "./arcade.css";
import "./meeting.css";

window.addEventListener("vite:preloadError", () => {
  void reloadUpdatedClient();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContextMenuProvider><App /></ContextMenuProvider>
  </StrictMode>,
);
