import { defineConfig, type Plugin } from "vite";
import { renderPage } from "./src/i18n/render.ts";

function localizedPages(): Plugin {
  return {
    name: "northstar-localized-pages",
    enforce: "post",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/de" || request.url === "/de/") request.url = "/index.html";
        next();
      });
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (context.bundle) return html;
        return renderPage(html, context.originalUrl?.startsWith("/de") ? "de" : "en");
      },
    },
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (page?.type !== "asset") throw new Error("Landing template was not emitted");
      const template = String(page.source);
      page.source = renderPage(template, "en");
      this.emitFile({ type: "asset", fileName: "de/index.html", source: renderPage(template, "de") });
    },
  };
}

export default defineConfig({
  appType: "mpa",
  plugins: [localizedPages()],
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
