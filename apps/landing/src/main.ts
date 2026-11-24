import "./styles.css";
import "./sections.css";

const clientUrl = resolveClientUrl(import.meta.env.VITE_CLIENT_URL?.trim() || "/app/");

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-client-link]")) {
  link.href = clientUrl;
}

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-language]")) {
  link.addEventListener("click", () => localStorage.setItem("northstar-language", link.dataset.language!));
}

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.remove("is-waiting");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const element of document.querySelectorAll<HTMLElement>(".reveal")) {
    if (element.getBoundingClientRect().top < innerHeight) continue;
    element.classList.add("is-waiting");
    observer.observe(element);
  }
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
