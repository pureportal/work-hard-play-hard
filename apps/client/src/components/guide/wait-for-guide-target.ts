export function waitForGuideTarget(selector: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => { cleanup(); reject(new Error("Guide closed")); };
    const check = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element?.getClientRects().length || getComputedStyle(element).visibility === "hidden") return;
      cleanup();
      resolve();
    };
    const observer = new MutationObserver(check);
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Guide screen unavailable")); }, 8000);
    const frame = requestAnimationFrame(() => {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      check();
    });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
