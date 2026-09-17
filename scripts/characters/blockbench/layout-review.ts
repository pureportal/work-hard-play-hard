import assert from "node:assert/strict";
import type { Page } from "playwright-core";

async function swipe(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8 }] });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}

export async function reviewCreatorLayouts(page: Page, output: string) {
  const layouts = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const viewport of [
      { width: 1440, height: 1000 }, { width: 768, height: 1024 },
      { width: 390, height: 844 }, { width: 360, height: 740 },
      { width: 320, height: 568 }, { width: 844, height: 390 },
      { width: 667, height: 375 }, { width: 568, height: 320 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByRole("tab", { name: "Tops", exact: true }).click();
      await page.locator(".character-studio, .character-options").evaluateAll(elements => elements.forEach(element => { element.scrollTop = 0; }));
      const scrolling = await page.evaluate(() => {
        const options = document.querySelector<HTMLElement>(".character-options")!;
        const studio = document.querySelector<HTMLElement>(".character-studio")!;
        const scroller = [options, studio].find(element => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight);
        const categories = document.querySelector<HTMLElement>(".character-categories")!;
        const horizontalOverflow = categories.scrollWidth > categories.clientWidth;
        categories.scrollLeft = categories.scrollWidth;
        return {
          vertical: scroller?.className, scrollbar: scroller && getComputedStyle(scroller).scrollbarWidth,
          horizontalOverflow, horizontalScroll: categories.scrollLeft,
        };
      });
      assert(scrolling.vertical && scrolling.scrollbar !== "none", `Visible vertical scrollbar at ${viewport.width}x${viewport.height}`);
      assert(!scrolling.horizontalOverflow || scrolling.horizontalScroll > 0, "Category tabs must scroll horizontally");
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLCanvasElement>(".character-option canvas")].every(canvas => canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)));
      await page.screenshot({ path: `${output}/creator-${theme}-${viewport.width}x${viewport.height}-top.png` });
      if (viewport.width === 1440) {
        await page.locator(".character-options").hover();
        await page.mouse.wheel(0, 240);
        await page.waitForFunction(() => document.querySelector(".character-options")!.scrollTop > 0);
      }
      if (viewport.width === 390) {
        const bounds = (await page.locator(".character-options").boundingBox())!;
        await swipe(page, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 16 }, { x: bounds.x + bounds.width / 2, y: bounds.y + 16 });
        await page.waitForFunction(() => document.querySelector(".character-options")!.scrollTop > 0);
      }
      if (viewport.width === 320) {
        const categories = page.locator(".character-categories");
        await categories.evaluate(element => { element.scrollLeft = 0; });
        const bounds = (await categories.boundingBox())!;
        await swipe(page, { x: bounds.x + bounds.width - 16, y: bounds.y + 24 }, { x: bounds.x + 16, y: bounds.y + 24 });
        await page.waitForFunction(() => document.querySelector(".character-categories")!.scrollLeft > 0);
      }
      await page.locator(".character-option").last().tap();
      await page.waitForFunction(() => document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled === false);
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLCanvasElement>(".character-option canvas")].every(canvas => canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)));
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector(".character-dialog")!.getBoundingClientRect();
        const footer = document.querySelector(".character-editor-actions")!.getBoundingClientRect();
        const selected = document.querySelector('.character-option[aria-pressed="true"]')!.getBoundingClientRect();
        const fits = [dialog, footer].every(rect => rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight);
        const reachable = selected.top >= dialog.top && selected.bottom <= footer.top;
        const targets = [...document.querySelectorAll<HTMLElement>(".character-playback select, .character-categories button, .character-shuffle, .character-editor-actions button")];
        const smallTargets = targets.flatMap(element => {
          const rect = element.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44 ? [] : [{ label: element.textContent || element.getAttribute("aria-label"), width: rect.width, height: rect.height }];
        });
        const cardContentsFit = [...document.querySelectorAll(".character-option")].every(element => {
          const card = element.getBoundingClientRect();
          return [...element.children].every(child => {
            const bounds = child.getBoundingClientRect();
            return bounds.left >= card.left && bounds.right <= card.right && bounds.top >= card.top && bounds.bottom <= card.bottom;
          });
        });
        return { fits, reachable, cardContentsFit, touchTargets: smallTargets.length === 0, smallTargets, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(layout.fits && layout.reachable && layout.cardContentsFit && !layout.overflow, JSON.stringify({ viewport, layout }));
      assert(layout.touchTargets, `Touch targets at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout.smallTargets)}`);
      await page.screenshot({ path: `${output}/creator-${theme}-${viewport.width}x${viewport.height}.png` });
      await page.getByRole("tab", { name: "Tops", exact: true }).focus();
      await page.keyboard.press("End");
      assert.equal(await page.getByRole("tab", { name: "Headwear", exact: true }).getAttribute("aria-selected"), "true");
      await page.keyboard.press("Home");
      assert.equal(await page.getByRole("tab", { name: "Face", exact: true }).getAttribute("aria-selected"), "true");
      layouts.push({ theme, ...viewport, ...scrolling, ...layout, keyboard: true });
    }
  }
  return layouts;
}
