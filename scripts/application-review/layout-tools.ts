import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder("../../artifacts/application-design-review/after/layout-tools");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      const initial = fixture.store.getLayout("floor-studio")!;
      initial.objects = [];
      initial.revision++;
      fixture.position(720, 650);
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context, "maya");
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await page.waitForLoadState("networkidle");
        await page.getByRole("button", { name: "Build", exact: true }).click();
        await page.evaluate(async () => { for (let index = 0; index < 40; index++) await new Promise<void>((done) => requestAnimationFrame(() => done())); });
        const tool = (name: string) => page.getByRole("toolbar", { name: "Layout tools" }).getByRole("button", { name, exact: true }).click();
        const point = async (x: number, y: number) => {
          const canvas = (await page.locator(".world-canvas canvas").boundingBox())!;
          return { x: canvas.x + canvas.width / 2 + (x - 720) * .78, y: canvas.y + canvas.height / 2 + (y - 650) * .78 };
        };
        const click = async (x: number, y: number) => { const position = await point(x, y); await page.mouse.click(position.x, position.y); };
        const move = async (x: number, y: number) => { const position = await point(x, y); await page.mouse.move(position.x, position.y); };
        await tool("Wall");
        const beforeWalls = initial.walls.map((wall) => wall.id);
        await click(576, 448);
        await move(576, 640);
        await review.capture(page, `${prefix}-wall-preview`);
        await click(576, 640);
        await page.evaluate(async () => { for (let index = 0; index < 24; index++) await new Promise<void>((done) => requestAnimationFrame(() => done())); });
        const layout = fixture.store.getLayout("floor-studio")!;
        const wall = layout.walls.find((item) => !beforeWalls.includes(item.id));
        assert(wall, "Wall creation must reach the runtime");
        assert([wall.start.x, wall.start.y, wall.end.x, wall.end.y].every((coordinate) => coordinate % 32 === 0));
        const center = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
        await tool("Select");
        await click(center.x, center.y);
        await page.getByRole("region", { name: "Selected Wall", exact: true }).waitFor();
        await review.capture(page, `${prefix}-selected-wall`);
        await tool("Door");
        await move(center.x, center.y);
        await review.capture(page, `${prefix}-door-preview`);
        await click(center.x, center.y);
        await tool("Select");
        await click(center.x, center.y);
        await page.getByRole("region", { name: "Selected Door", exact: true }).waitFor();
        await review.capture(page, `${prefix}-selected-door`);
        assert(fixture.store.getLayout("floor-studio")!.openings.some((opening) => opening.wallId === wall.id && opening.type === "door"));
        await page.locator(".build-selection").getByRole("button", { name: "Remove", exact: true }).click();
        await tool("Window");
        await move(wall.end.x, wall.end.y);
        await review.capture(page, `${prefix}-window-invalid`);
        await move(center.x, center.y);
        await review.capture(page, `${prefix}-window-preview`);
        await click(center.x, center.y);
        await tool("Select");
        await click(center.x, center.y);
        await page.getByRole("region", { name: "Selected Window", exact: true }).waitFor();
        await review.capture(page, `${prefix}-selected-window`);
        const updated = fixture.store.getLayout("floor-studio")!;
        assert(updated.openings.some((opening) => opening.wallId === wall.id && opening.type === "window"));
        await page.locator(".build-selection").getByRole("button", { name: "Remove", exact: true }).click();
        await tool("Erase");
        await click(center.x, center.y);
        await review.capture(page, `${prefix}-erased-wall`);
        assert(!fixture.store.getLayout("floor-studio")!.walls.some((item) => item.id === wall.id));
      } catch (error) {
        review.blockers.push(`${prefix}: ${String(error)}`);
        await review.capture(page, `${prefix}-failure`);
        console.error(String(error));
      } finally {
        await context.close();
        await fixture.stop();
        await review.save();
      }
    }
  }
} finally {
  await browser.close();
  await review.save();
}
