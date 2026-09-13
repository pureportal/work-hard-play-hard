import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";

export function createRecorder(output: string) {
  const states: unknown[] = [];
  const errors: string[] = [];
  const blockers: string[] = [];

  function observe(page: Page) {
    page.setDefaultTimeout(12_000);
    page.on("pageerror", (error) => errors.push(error.message));
  }

  async function capture(page: Page, name: string) {
    await mkdir(output, { recursive: true });
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (let index = 0; index < 3; index++) await new Promise<void>((done) => requestAnimationFrame(() => done()));
    });
    await page.screenshot({ path: resolve(output, `${name}.png`), animations: "disabled" });
    const measurements = await page.evaluate(() => {
      const selectors = ".auth-card, .side-panel, [role=dialog], .top-bar, .control-dock, .reaction-popover, .interaction-panel, .context-action, .call-pill, .knock-pill, .placement-toolbar, .character-editor-actions";
      return {
        viewport: { width: innerWidth, height: innerHeight },
        overflow: document.documentElement.scrollWidth > innerWidth,
        regions: [...document.querySelectorAll<HTMLElement>(selectors)].filter((node) => node.checkVisibility()).map((node) => {
          const box = node.getBoundingClientRect();
          return { name: node.className, x: box.x, y: box.y, width: box.width, height: box.height,
            clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight };
        }),
        text: document.body.innerText,
      };
    });
    states.push({ name, ...measurements });
    console.log(name);
  }

  async function save() {
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, "results.json"), JSON.stringify({ states, errors, blockers }, null, 2));
    if (errors.length || blockers.length) process.exitCode = 1;
  }

  return { capture, observe, save, errors, blockers };
}
