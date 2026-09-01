import "./styles.css";

const clientUrl = resolveClientUrl(import.meta.env.VITE_CLIENT_URL?.trim() || "/app/");

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-client-link]")) {
  link.href = clientUrl;
}

function resolveClientUrl(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("VITE_CLIENT_URL must be an absolute HTTP URL or a root-relative path.");
  }
  return url.toString();
}
