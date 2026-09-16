import assert from "node:assert/strict";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { artifacts, createFixture, until } from "./organisation-permissions-fixture.js";

const fixture = await createFixture();
const { store, open, send, ownedAssetId } = fixture;
const verified: string[] = [];
let active: Page | undefined;
const report = (message: string) => { verified.push(message); console.log(message); };
const unitId = (name: string) => store.getOrganisation().units.find((unit) => unit.name === name)!.id;
const assignment = (id: string) => store.getOrganisation().assignments.find((person) => person.userId === id);
const unitButton = (page: Page, id: string) => page.locator(`[data-unit-id="${id}"] > button`);
const personButton = (page: Page, id: string) => page.locator(`[data-person-id="${id}"] > button`);

async function addUnit(page: Page, name: string, parentId?: string) {
  if (parentId) {
    await unitButton(page, parentId).click();
    await page.getByRole("button", { name: "Add subteam", exact: true }).click();
  } else await page.getByRole("button", { name: "Add unit", exact: true }).click();
  const form = page.getByRole("form", { name: "New unit" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("button", { name: "Create unit" }).click();
  await page.getByRole("button", { name, exact: true }).waitFor();
  await until(() => Boolean(store.getOrganisation().units.find((unit) => unit.name === name)), `Unit ${name} not created`);
}

async function preview(page: Page, name: string, access: string, build: string) {
  const details = page.locator(".permission-preview");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator("summary").click();
  const row = details.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
  assert.deepEqual(await row.getByRole("cell").allTextContents(), [access, build]);
}

try {
  const jonas = active = await open("user-jonas");
  await jonas.getByRole("button", { name: "Build", exact: true }).click();
  await jonas.getByText("No rooms on this floor allow placement.", { exact: true }).waitFor();
  assert.equal(await jonas.getByRole("button", { name: "Place", exact: true }).isEnabled(), false);
  await jonas.screenshot({ path: resolve(artifacts, "placement-reproduced.png") });
  report("Reproduced owned desk blocked by room/default permissions");

  const maya = active = await open("user-maya");
  await maya.getByRole("button", { name: "Organisation", exact: true }).click();
  await maya.getByRole("region", { name: "CEOs", exact: true }).waitFor();
  assert.equal(await maya.getByRole("region", { name: "CEOs", exact: true }).locator("li").count(), 1);
  assert.equal(await maya.getByRole("region", { name: "Unassigned", exact: true }).locator("li").count(), store.getMembers().length - 1);
  await addUnit(maya, "Engineering");
  await addUnit(maya, "Design");
  const engineering = unitId("Engineering");
  const design = unitId("Design");
  await personButton(maya, "user-jonas").dragTo(unitButton(maya, engineering));
  await until(() => assignment("user-jonas")?.unitId === engineering, "Drag did not assign Jonas");
  await personButton(maya, "user-jonas").click();
  await maya.getByRole("combobox", { name: "Rank", exact: true }).selectOption("lead");
  await until(() => assignment("user-jonas")?.rank === "lead", "Jonas not lead");
  await personButton(maya, "user-priya").dragTo(unitButton(maya, engineering));
  await until(() => assignment("user-priya")?.unitId === engineering, "Drag did not assign Priya");
  report("CEO assigns unassigned members with drag and drop and appoints a lead");

  active = jonas;
  await jonas.getByRole("button", { name: "Organisation", exact: true }).click();
  assert.equal(await jonas.getByRole("button", { name: "Add unit", exact: true }).count(), 0);
  assert.equal(await personButton(jonas, "user-amara").count(), 0);
  await send(jonas, "user-jonas", { type: "organisation.edit", requestId: "unassigned-forbidden", baseRevision: store.getOrganisation().revision,
    edit: { type: "member.move", userId: "user-amara", unitId: engineering, rank: "member" } }, "ORGANISATION_FORBIDDEN");
  await addUnit(jonas, "Platform", engineering);
  const web = unitId("Platform");
  await unitButton(jonas, web).click();
  await jonas.getByRole("region", { name: "Edit Platform" }).getByLabel("Name", { exact: true }).fill("Web");
  await jonas.getByRole("button", { name: "Save unit" }).click();
  await unitButton(jonas, web).filter({ hasText: "Web" }).waitFor();
  await personButton(jonas, "user-priya").dragTo(unitButton(jonas, web));
  await until(() => assignment("user-priya")?.unitId === web, "Lead could not move their member");
  await personButton(jonas, "user-priya").click();
  await jonas.getByRole("combobox", { name: "Rank", exact: true }).selectOption("lead");
  await until(() => assignment("user-priya")?.rank === "lead", "Subteam lead not assigned");
  await addUnit(jonas, "API", engineering);
  const api = unitId("API");
  await unitButton(jonas, api).dragTo(unitButton(jonas, web));
  await until(() => store.getOrganisation().units.find((unit) => unit.id === api)?.parentId === web, "Unit drag did not move API");
  await send(jonas, "user-jonas", { type: "organisation.edit", requestId: "outside-forbidden", baseRevision: store.getOrganisation().revision,
    edit: { type: "unit.move", unitId: web, parentId: design } }, "ORGANISATION_FORBIDDEN");
  await send(jonas, "user-jonas", { type: "organisation.edit", requestId: "cycle-forbidden", baseRevision: store.getOrganisation().revision,
    edit: { type: "unit.move", unitId: web, parentId: api } }, "ORGANISATION_CYCLE");
  await jonas.screenshot({ path: resolve(artifacts, "organisation-lead.png") });
  report("Lead creates, edits and moves subteams; unassigned, outside-scope and cyclic edits are blocked");

  active = maya;
  await maya.getByRole("button", { name: "Build", exact: true }).click();
  await maya.getByRole("button", { name: "Room settings", exact: true }).click();
  await maya.getByRole("combobox", { name: "Room", exact: true }).selectOption("room-commons");
  await maya.getByRole("combobox", { name: "Unit", exact: true }).selectOption(engineering);
  await maya.getByRole("combobox", { name: "Access", exact: true }).selectOption("open");
  await maya.getByRole("combobox", { name: "Build", exact: true }).selectOption("assigned");
  const build = maya.getByRole("group", { name: "Build", exact: true });
  await build.getByText("Organisation", { exact: true }).click();
  await build.getByRole("combobox", { name: "Engineering build", exact: true }).selectOption("leads");
  await build.getByLabel("Include subteams", { exact: true }).uncheck();
  await preview(maya, "Jonas Berg", "Yes", "Yes");
  await preview(maya, "Priya Nair", "Yes", "No");
  await preview(maya, "Maya Chen", "Yes", "No");
  await maya.getByRole("button", { name: "Save room" }).click();
  await until(() => store.getRoom("room-commons")?.build?.mode === "assigned", "Room permissions not saved");
  await maya.screenshot({ path: resolve(artifacts, "room-lead-build.png") });
  report("Room remains open while only its direct team lead can build; preview agrees");

  active = jonas;
  await jonas.getByRole("button", { name: "Build", exact: true }).click();
  await jonas.getByRole("button", { name: "Place", exact: true }).click();
  const canvas = jonas.locator(".world-canvas canvas");
  const bounds = (await canvas.boundingBox())!;
  await jonas.mouse.click(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2);
  await until(() => Boolean(store.getOwnedAsset("user-jonas", ownedAssetId).placement), "Permitted desk placement did not complete");
  const placed = store.getObject(store.getOwnedAsset("user-jonas", ownedAssetId).placement!.objectId)!;
  await jonas.screenshot({ path: resolve(artifacts, "desk-placed.png") });
  assert(fixture.commands.some(({ userId, command }) => userId === "user-jonas" && command.type === "player_asset.place"));
  report("Placed owned Straight desk through the canvas after granting room build rights");

  active = maya;
  await maya.getByRole("combobox", { name: "Build", exact: true }).selectOption("none");
  await maya.getByRole("button", { name: "Save room" }).click();
  await until(() => store.getRoom("room-commons")?.build?.mode === "none", "Build revocation not saved");
  await send(jonas, "user-jonas", { type: "player_asset.remove", requestId: "remove-forbidden", baseRevision: store.getLayout("floor-studio")!.revision, objectId: placed.id }, "ASSET_ROOM_FORBIDDEN");
  const room = store.getRoom("room-commons")!;
  await send(maya, "user-maya", { type: "layout.apply", requestId: "builder-forbidden", baseRevision: store.getLayout("floor-studio")!.revision,
    edit: { tool: "asset", assetId: "chair-office", variantId: "white", rotation: 0, position: { x: room.bounds.x + 64, y: room.bounds.y + 64 } } }, "ASSET_ROOM_FORBIDDEN");
  assert(store.getObject(placed.id));
  report("Build revocation blocks owned removal and office-builder placement on the server");

  await maya.getByRole("combobox", { name: "Access", exact: true }).selectOption("default");
  await maya.getByRole("combobox", { name: "Build", exact: true }).selectOption("default");
  await maya.getByRole("button", { name: "Save room" }).click();
  await until(() => store.getRoom("room-commons")?.access.mode === "default", "Room did not inherit defaults");
  await maya.getByRole("tab", { name: "Defaults", exact: true }).click();
  for (const label of ["Access", "Build"]) {
    await maya.getByRole("combobox", { name: label, exact: true }).selectOption("assigned");
    const group = maya.getByRole("group", { name: label, exact: true });
    await group.getByText("Organisation", { exact: true }).click();
    await group.getByRole("combobox", { name: `Engineering ${label.toLowerCase()}` }).selectOption(label === "Access" ? "members" : "leads");
    if (label === "Build") await group.getByLabel("Include subteams", { exact: true }).uncheck();
  }
  await preview(maya, "Jonas Berg", "Yes", "Yes");
  await preview(maya, "Priya Nair", "Yes", "No");
  await preview(maya, "Maya Chen", "No", "No");
  await maya.getByRole("button", { name: "Save defaults" }).click();
  await until(() => store.getGameSettings().roomAccess.mode === "assigned", "Defaults not saved");
  await send(jonas, "user-jonas", { type: "player_asset.remove", requestId: "remove-permitted", baseRevision: store.getLayout("floor-studio")!.revision, objectId: placed.id });
  assert.equal(store.getOwnedAsset("user-jonas", ownedAssetId).placement, undefined);
  await maya.screenshot({ path: resolve(artifacts, "organisation-defaults.png") });
  report("Independent organisation-based global defaults control entry and building immediately");

  await maya.getByRole("button", { name: "Organisation", exact: true }).click();
  for (const id of ["user-leo", "user-amara"]) {
    await personButton(maya, id).click();
    await maya.getByRole("button", { name: "Promote to CEO", exact: true }).click();
    await maya.locator(".confirmation-dialog").getByRole("button", { name: "Promote to CEO", exact: true }).click();
    await until(() => store.getOrganisation().ceoIds.includes(id), "CEO promotion not saved");
  }
  assert.deepEqual(store.getOrganisation().ceoIds, ["user-maya", "user-leo", "user-amara"]);
  await send(maya, "user-maya", { type: "organisation.edit", requestId: "demotion-forbidden", baseRevision: store.getOrganisation().revision,
    edit: { type: "member.move", userId: "user-amara", unitId: engineering, rank: "member" } }, "CEO_VOTE_REQUIRED");
  await maya.getByRole("button", { name: "Start removal vote", exact: true }).click();
  await maya.getByRole("button", { name: "Vote to remove", exact: true }).click();
  await until(() => store.getOrganisation().removalVotes[0]?.ballots.length === 1, "First vote not saved");
  const voteId = store.getOrganisation().removalVotes[0]!.id;
  assert(store.getOrganisation().ceoIds.includes("user-amara"));
  await send(maya, "user-maya", { type: "organisation.edit", requestId: "duplicate-vote", baseRevision: store.getOrganisation().revision,
    edit: { type: "ceo.vote", voteId, approve: true } }, "CEO_ALREADY_VOTED");
  await maya.reload();
  await maya.getByRole("button", { name: "Organisation", exact: true }).click();
  await maya.getByText("1 of 2 required votes", { exact: true }).waitFor();
  const leo = active = await open("user-leo");
  await leo.getByRole("button", { name: "Organisation", exact: true }).click();
  await leo.getByRole("button", { name: "Vote to remove", exact: true }).click();
  await until(() => store.getOrganisation().removalVotes[0]?.status === "passed", "Majority did not remove CEO");
  assert(!store.getOrganisation().ceoIds.includes("user-amara"));
  assert.equal(assignment("user-amara"), undefined);
  await leo.getByRole("region", { name: "Unassigned", exact: true }).locator('[data-person-id="user-amara"]').waitFor();
  await leo.screenshot({ path: resolve(artifacts, "ceo-vote-passed.png") });
  report("Multiple CEOs, removal protection, duplicate-vote rejection and majority removal after reload");

  active = maya;
  await maya.setViewportSize({ width: 390, height: 844 });
  await maya.screenshot({ path: resolve(artifacts, "organisation-mobile.png") });
  assert.equal(await maya.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await maya.getByRole("button", { name: "Build", exact: true }).click();
  await maya.getByRole("button", { name: "Room settings", exact: true }).click();
  await maya.getByRole("heading", { name: "Room settings", exact: true }).waitFor();
  await maya.getByRole("combobox", { name: "Room", exact: true }).selectOption("room-commons");
  await maya.screenshot({ path: resolve(artifacts, "room-settings-mobile.png") });
  assert.equal(await maya.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(fixture.errors, []);
  report("Desktop and mobile layouts render without overflow or browser errors");
  await writeFile(resolve(artifacts, "browser-results.json"), JSON.stringify({ verified, errors: fixture.errors }, null, 2));
} catch (error) {
  console.error(error);
  if (active) {
    await active.screenshot({ path: resolve(artifacts, "failure.png") });
    console.error((await active.locator("body").innerText()).slice(-7000));
  }
  console.error(JSON.stringify({ errors: fixture.errors, lastCommands: fixture.commands.slice(-3), responses: [...fixture.events].map(([userId, events]) => ({ userId, events: events.filter((event) => event.type === "command.ack" || event.type === "command.error").slice(-4) })) }));
  throw error;
} finally { await fixture.close(); }
