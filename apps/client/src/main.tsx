import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { reloadUpdatedClient } from "./client-update";
import "./styles.css";
import "./arcade.css";

window.addEventListener("vite:preloadError", () => {
  void reloadUpdatedClient();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
