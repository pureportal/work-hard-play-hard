import "./styles.css";

const clientUrl = resolveClientUrl(import.meta.env.VITE_CLIENT_URL?.trim() || "/app/");

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-client-link]")) {
  link.href = clientUrl;
}

const dialog = document.querySelector<HTMLDialogElement>(".screenshot-dialog")!;
const image = dialog.querySelector<HTMLImageElement>(".screenshot-full")!;
const title = dialog.querySelector<HTMLHeadingElement>("#screenshot-title")!;
const error = dialog.querySelector<HTMLParagraphElement>(".screenshot-error")!;
const original = error.querySelector<HTMLAnchorElement>("a")!;

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-screenshot]")) {
  link.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    title.textContent = link.dataset.screenshot!;
    image.alt = link.dataset.screenshotAlt ?? link.querySelector("img")?.alt ?? title.textContent;
    error.hidden = true;
    image.hidden = false;
    original.href = link.href;
    image.src = link.href;
    dialog.showModal();
  });
}

image.addEventListener("error", () => {
  image.hidden = true;
  error.hidden = false;
});

dialog.addEventListener("keydown", event => {
  if (event.key !== "Tab") return;
  const controls = [...dialog.querySelectorAll<HTMLElement>("button, a[href]")].filter(control => control.checkVisibility());
  const first = controls[0]!;
  const last = controls.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});

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
