import { createPublicEconomy, FALLING_BLOCKS_DEFINITION_ID, type MemberRole, type WorldPlayer } from "@workhard/shared";
import { hashPassword } from "../auth/passwords.js";
import { EconomyStore } from "../economy/economy-store.js";
import { createInitialData } from "../initial-data.js";
import type { AuthPersistenceState, WorkspacePersistenceState } from "../persistence/application-database.js";
import { WorkspaceStore } from "../store.js";
import { populateWorkplaceActivity } from "./workplace-activity.js";
import { createWorkplaceBuilding } from "./workplace-building.js";
import { createWorkplacePeople } from "./workplace-people.js";

export interface WorkplaceCredentials {
  username: string;
  email: string;
  password: string;
}

export function createSimulatedWorkplace(now = new Date()): WorkspacePersistenceState {
  const data = { ...createInitialData(now), ...createWorkplaceBuilding(), ...createWorkplacePeople(), currentUserId: "person-rowan" };
  data.publicEconomy = createPublicEconomy("hierarchical");
  data.corporateIdentity = { ...data.corporateIdentity, applicationName: "Alder Works", primaryColor: "#527b70", secondaryColor: "#c18a60" };
  data.gameSettings = { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "none", assignedPersonIds: [] } };
  populateWorkplaceActivity(data, now);
  const store = new WorkspaceStore(data);
  const economy = new EconomyStore(data.members.map(({ id }) => id), new Date(now.getTime() - 30 * 86_400_000));
  economy.updateGameSettings(data.gameSettings);
  store.restoreMutableState({ ...store.exportMutableState(), economy: economy.exportState() });
  for (const [index, users] of [["soren", "dev", "ines"], ["yuki", "celia"], ["mei"]].entries()) {
    store.recordGameRound(`alder-lunch-${index}`, FALLING_BLOCKS_DEFINITION_ID, users.map((username, order) => ({
      userId: `person-${username}`, score: 4200 - index * 500 - order * 650, lines: 20 - index * 2 - order * 3,
      level: 3, order, won: users.length > 1 && order === 0,
    })), new Date(now.getTime() - (index + 1) * 86_400_000).toISOString());
  }
  for (const username of ["soren", "yuki", "imani"]) {
    const userId = `person-${username}`;
    store.claimDailyReward(userId, `alder-daily-${username}`);
    const purchase = store.purchaseAsset(userId, "decor-desk-plant", `alder-plant-${username}`);
    const layout = store.getLayout(username === "imani" ? "floor-retreat" : "floor-workplace")!;
    const desk = layout.objects.find(({ id }) => id === `${layout.floorId}-${username}-desk`)!;
    store.replaceLayout({ ...layout, revision: layout.revision + 1, objects: [...layout.objects, {
      id: `${layout.floorId}-${username}-personal-plant`, assetId: "decor-desk-plant", floorId: layout.floorId,
      x: desk.x + 80, y: desk.y + 16, rotation: 0, variantId: "sage",
      ownerUserId: userId, ownedAssetId: purchase.transaction.ownedAssetId!,
    }] });
    store.purchaseAsset(userId, "decor-coffee", `alder-coffee-${username}`);
  }
  const state = store.exportMutableState();
  new WorkspaceStore().restoreMutableState(state);
  const players = data.members.map<WorldPlayer>((member) => ({
    userId: member.id, floorId: member.floorId!, x: member.position!.x, y: member.position!.y,
    facing: "down", availability: member.availability, connected: member.online,
  }));
  return { store: state, players };
}

export async function createWorkplaceAccounts(workspace: WorkspacePersistenceState, now = new Date()): Promise<{
  auth: AuthPersistenceState; credentials: WorkplaceCredentials[];
}> {
  const credentials: WorkplaceCredentials[] = [];
  const accounts: AuthPersistenceState["accounts"] = [];
  const roleCounts = new Map<MemberRole, number>();
  for (const member of workspace.store.members) {
    const roleCount = (roleCounts.get(member.role) ?? 0) + 1;
    roleCounts.set(member.role, roleCount);
    const username = `${member.role}${roleCount === 1 ? "" : roleCount}`;
    const password = "password";
    credentials.push({ username, email: member.email, password });
    accounts.push({ id: member.id, username, email: member.email, passwordHash: await hashPassword(password),
      createdAt: new Date(now.getTime() - 30 * 86_400_000).toISOString() });
  }
  return { auth: { accounts, sessions: [], magicLinks: [], passwordResets: [], registrationLinks: [] }, credentials };
}
