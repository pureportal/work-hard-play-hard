import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { artifacts, createFixture, until } from "./organisation-permissions-fixture.js";

const fixture = await createFixture(createTestData());
const { store, open, send, ownedAssetId, runtime } = fixture;
const verified: string[] = [];
try {
  runtime.restorePlayers([{ userId: "user-jonas", floorId: "floor-studio", x: 480, y: 832,
    facing: "up", availability: "available", connected: false }]);
  const jonas = await open("user-jonas");
  await jonas.getByRole("button", { name: "Build", exact: true }).click();
  assert.equal(await jonas.getByText("No rooms on this floor allow placement.", { exact: true }).count(), 0);
  assert.equal(await jonas.getByRole("button", { name: "Place", exact: true }).isEnabled(), true);
  await jonas.getByRole("tab", { name: "Shop", exact: true }).click();
  await jonas.getByRole("tab", { name: "Floor types", exact: true }).click();
  await jonas.getByText("Floor Tile", { exact: true }).waitFor();
  assert.equal(await jonas.getByText("Woven rug", { exact: true }).count(), 0);
  await jonas.getByRole("tab", { name: "Floor decor", exact: true }).click();
  for (const name of ["Woven rug", "Round rug", "Tatami mat"]) {
    await jonas.getByText(name, { exact: true }).waitFor();
  }
  assert.equal(await jonas.getByText("Floor Tile", { exact: true }).count(), 0);
  assert.equal(await jonas.getByRole("tab", { name: "Surface", exact: true }).count(), 0);
  await jonas.screenshot({ path: resolve(artifacts, "seed-shop-floor-decor.png") });
  verified.push("Jonas has Build → Shop with separate Floor types and Floor decor categories");
  await jonas.getByRole("tab", { name: "Inventory", exact: true }).click();
  await jonas.getByRole("button", { name: "Place", exact: true }).click();
  const bounds = (await jonas.locator(".world-canvas canvas").boundingBox())!;
  await jonas.mouse.click(bounds.x + bounds.width / 2 + 48, bounds.y + bounds.height / 2 - 80);
  await until(() => Boolean(store.getOwnedAsset("user-jonas", ownedAssetId).placement), "Seeded desk placement did not complete");
  assert(fixture.commands.some(({ userId, command }) => userId === "user-jonas" && command.type === "player_asset.place"));
  assert.equal(store.getGameSettings().roomBuild.mode, "none");
  await jonas.screenshot({ path: resolve(artifacts, "seed-jonas-desk.png") });
  verified.push("Jonas places the owned desk through the canvas while global Build remains Nobody");

  const maya = await open("user-maya");
  await maya.getByRole("button", { name: "Build", exact: true }).click();
  await maya.getByRole("button", { name: "Start point", exact: true }).waitFor();
  assert.equal(await maya.getByRole("tab", { name: "Shop", exact: true }).count(), 0);
  await maya.getByRole("tab", { name: "Floor types", exact: true }).click();
  await maya.getByRole("button", { name: "Floor Tile", exact: true }).click();
  assert.deepEqual(await maya.getByRole("radio").allTextContents(), ["Wood", "Stone", "Grass"]);
  await maya.getByRole("tab", { name: "Floor decor", exact: true }).click();
  for (const name of ["Woven rug", "Round rug", "Tatami mat"]) {
    await maya.getByRole("button", { name, exact: true }).click();
  }
  verified.push("Maya has Build office tools and can select floor materials, rugs and tatami");
  await maya.getByRole("button", { name: "Room settings", exact: true }).click();
  await maya.getByRole("combobox", { name: "Room", exact: true }).selectOption("room-focus");
  const preview = maya.locator(".permission-preview");
  await preview.locator("summary").click();
  for (const [name, expected] of [["Maya Chen", ["Yes", "No"]], ["Priya Nair", ["Yes", "Yes"]], ["Jonas Berg", ["No", "No"]]] as const) {
    const row = preview.getByRole("row").filter({ has: maya.getByRole("rowheader", { name, exact: true }) });
    assert.deepEqual(await row.getByRole("cell").allTextContents(), [...expected]);
  }
  await maya.screenshot({ path: resolve(artifacts, "seed-access-build.png") });
  verified.push("Seeded Focus Suite previews independent Access and Build grants");
  await maya.getByRole("button", { name: "Organisation", exact: true }).click();
  await maya.getByRole("region", { name: "CEOs", exact: true }).waitFor();
  assert.equal(await maya.getByRole("region", { name: "CEOs", exact: true }).locator("li").count(), 3);
  assert.equal(await maya.getByRole("region", { name: "Unassigned", exact: true }).locator("li").count(), 2);
  await maya.locator('[data-unit-id="unit-web"] > button').waitFor();
  await maya.locator('[data-unit-id="unit-research"] > button').waitFor();
  await maya.screenshot({ path: resolve(artifacts, "seed-organisation.png") });
  await send(maya, "user-maya", { type: "organisation.edit", requestId: "seed-vote", baseRevision: store.getOrganisation().revision,
    edit: { type: "ceo.propose_removal", userId: "user-sam" } });
  assert.deepEqual(store.getOrganisation().removalVotes[0]!.ballots, []);
  verified.push("Departments, teams, subteams, three CEOs and two unassigned members render; removal starts without a ballot");
  assert.deepEqual(fixture.errors, []);
  await writeFile(resolve(artifacts, "seed-report.json"), JSON.stringify({ verified, pageErrors: fixture.errors }, null, 2));
  console.log(JSON.stringify({ verified, pageErrors: fixture.errors, artifacts }));
} finally {
  await fixture.close();
}
