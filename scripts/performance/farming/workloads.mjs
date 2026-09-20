export const declarations = `
type Observation = { crop: string | null; harvestable: boolean; needsWater: boolean };
declare const farm: { inspect(): Observation; wait(ticks: number): Promise<void> };
declare const bot: {
  plant(crop: string): Promise<void>;
  water(): Promise<void>;
  harvest(): Promise<void>;
  move(direction: string): Promise<void>;
};
`;

export const starter = `
export async function main(): Promise<void> {
  while (true) {
    const tile = farm.inspect();
    if (tile.harvestable) await bot.harvest();
    else if (tile.crop === null) await bot.plant("carrot");
    else if (tile.needsWater) await bot.water();
    else await farm.wait(1);
  }
}
void main();
`;

export const route = `
export async function main(): Promise<void> {
  while (true) {
    const tile = farm.inspect();
    if (tile.harvestable) await bot.harvest();
    else if (tile.crop === null) await bot.plant("carrot");
    else if (tile.needsWater) await bot.water();
    else await bot.move("next");
  }
}
void main();
`;

export const attacks = {
  loop: "while (true) {}",
  promises: "function again() { Promise.resolve().then(again); } again();",
  allocation: "const values = []; while (true) values.push(new Array(100000).fill(1));",
  oversizedAllocation: "new Uint8Array(32 * 1024 * 1024);",
  nativeRegex: 'new RegExp("^(a+)+$").test("a".repeat(30) + "!");',
  overlappingActions: 'bot.water(); bot.water();',
};

export function compilerSources() {
  const lines = [route];
  let size = Buffer.byteLength(route);
  for (let index = 0; ; index++) {
    const line = `const point${index}: { x: number; y: number } = { x: ${index % 8}, y: ${Math.floor(index / 8) % 8} };\n`;
    if (size + Buffer.byteLength(line) > 32 * 1024) break;
    lines.push(line);
    size += Buffer.byteLength(line);
  }
  return { starter, nearLimit: lines.join(""), recursiveType: "type Expand<T extends unknown[]> = Expand<[...T, 0]>; type Result = Expand<[]>;" };
}

export function createFarm() {
  return { tick: 0, position: 0, harvests: 0, cells: Array.from({ length: 64 }, () => ({ plantedAt: null, watered: false })) };
}

export function advanceFarm(farmState, action) {
  const cell = farmState.cells[farmState.position];
  if (action === "plant" && cell.plantedAt === null) cell.plantedAt = farmState.tick;
  else if (action === "water") cell.watered = true;
  else if (action === "harvest" && cell.plantedAt !== null && cell.watered && farmState.tick - cell.plantedAt >= 20) {
    cell.plantedAt = null;
    cell.watered = false;
    farmState.harvests++;
  } else if (action === "move") farmState.position = (farmState.position + 1) % farmState.cells.length;
  else if (action !== undefined && action !== "wait") throw new Error(`Invalid fixture action: ${action}`);
  farmState.tick++;
  const next = farmState.cells[farmState.position];
  return {
    crop: next.plantedAt === null ? null : "carrot",
    harvestable: next.plantedAt !== null && next.watered && farmState.tick - next.plantedAt >= 20,
    needsWater: next.plantedAt !== null && !next.watered,
  };
}

export function summarize(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const percentile = (fraction) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    count: sorted.length,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0,
    p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1) ?? 0,
  };
}
