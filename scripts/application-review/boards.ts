import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { ASSET_CATALOG, CHECKLIST_ITEM_LIMIT, getDefaultAssetVariantId, type ServerEvent } from "../../packages/shared/src/index.js";
import { createRecorder } from "./capture.js";
import { createReviewFixture } from "./fixture.js";

const review = createRecorder("../../artifacts/application-design-review/after/boards");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    for (const theme of ["light", "dark"] as const) {
      const fixture = await createReviewFixture();
      const layout = fixture.store.getLayout("floor-studio")!;
      const whiteboard = ASSET_CATALOG.assets.find((asset) => asset.workKind === "whiteboard")!;
      const checklist = ASSET_CATALOG.assets.find((asset) => asset.workKind === "checklist")!;
      layout.objects = [{ id: "review-board", floorId: layout.floorId, assetId: whiteboard.id, variantId: getDefaultAssetVariantId(whiteboard), rotation: 0, x: 704, y: 624 }];
      layout.revision++;
      fixture.position(744, 690);
      const context = await browser.newContext({ viewport: { width: width!, height: height! }, colorScheme: theme });
      await fixture.install(context, "maya");
      const page = await context.newPage();
      review.observe(page);
      const prefix = `${width}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173");
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        const close = page.getByRole("button", { name: "Close people", exact: true });
        if (await close.count()) await close.click();
        const emit = (event: ServerEvent) => fixture.sockets.get("user-maya")!.send(JSON.stringify(event));
        const open = async () => {
          await page.waitForFunction(() => document.querySelector('.interaction-panel button') !== null);
          const areas = page.getByRole("combobox", { name: "Active interaction", exact: true });
          if (await areas.count()) await areas.selectOption("review-board");
          await page.getByRole("region", { name: "Nearby actions", exact: true }).getByRole("button", { name: "Open board", exact: true }).click();
        };
        await open();
        await review.capture(page, `${prefix}-whiteboard-empty`);
        await page.getByRole("button", { name: "Notes", exact: true }).click();
        await page.getByLabel("Notes", { exact: true }).fill("Review draft\n\nKeep the meeting notes together.");
        await page.getByRole("button", { name: "Close board", exact: true }).click();
        await review.capture(page, `${prefix}-discard-prompt`);
        await page.getByRole("button", { name: "Keep editing", exact: true }).click();
        fixture.ignoredCommands.add("work.update");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByText("Saving…", { exact: true }).waitFor();
        await review.capture(page, `${prefix}-saving`);
        const command = fixture.commands.findLast((item) => item.type === "work.update")!;
        emit({ type: "command.error", requestId: command.requestId, code: "REVIEW", message: "Could not save. Try again." });
        await page.getByRole("alert").waitFor();
        await review.capture(page, `${prefix}-save-error`);
        fixture.ignoredCommands.delete("work.update");
        layout.objects[0]!.workState = { kind: "whiteboard", revision: 1, document: { text: "Updated notes from a teammate.\nThe review moved to the afternoon.", cards: [] } };
        layout.revision++;
        emit({ type: "layout.updated", layout });
        await page.getByText("Latest board", { exact: true }).click();
        await review.capture(page, `${prefix}-latest-notes`);
        await page.getByRole("button", { name: "Keep draft", exact: true }).click();
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByText("Saved", { exact: true }).waitFor();
        await page.getByLabel("Notes", { exact: true }).fill("Another draft");
        const updated = fixture.store.getLayout("floor-studio")!;
        updated.objects[0]!.workState = { kind: "whiteboard", revision: 3, document: { text: "Latest shared notes", cards: [] } };
        updated.revision++;
        emit({ type: "layout.updated", layout: updated });
        await page.getByRole("button", { name: "Use latest", exact: true }).click();
        assert.equal(await page.getByLabel("Notes", { exact: true }).inputValue(), "Latest shared notes");
        updated.objects = [];
        updated.revision++;
        emit({ type: "layout.updated", layout: updated });
        await page.getByText("This board was removed. Close it and select another.", { exact: true }).waitFor();
        await review.capture(page, `${prefix}-board-removed`);
        await page.getByRole("button", { name: "Close board", exact: true }).click();
        updated.objects = [{ id: "review-board", floorId: layout.floorId, assetId: checklist.id, variantId: getDefaultAssetVariantId(checklist), rotation: 0, x: 704, y: 624,
          workState: { kind: "checklist", revision: 0, items: Array.from({ length: CHECKLIST_ITEM_LIMIT }, (_, index) => ({ id: `item-${index}`, text: `Review task ${index + 1}`, completed: index % 3 === 0 })) } }];
        updated.revision++;
        emit({ type: "layout.updated", layout: updated });
        await open();
        assert(await page.getByLabel("New item", { exact: true }).isDisabled());
        await review.capture(page, `${prefix}-checklist-full`);
        await page.getByRole("button", { name: "Remove Review task 1", exact: true }).click();
        await page.waitForFunction(() => !document.querySelector<HTMLInputElement>('[aria-label="New item"]')?.disabled);
        await page.getByLabel("New item", { exact: true }).fill("Unsaved task");
        await page.getByRole("button", { name: "Close board", exact: true }).click();
        await page.getByRole("button", { name: "Discard", exact: true }).click();
        assert.equal(await page.getByRole("dialog").count(), 0);
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
