import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireDependency = createRequire(resolve(process.argv[2], "package.json"));
const { getQuickJS } = requireDependency("quickjs-emscripten");
const quickjs = await getQuickJS();
const runtime = quickjs.newRuntime();
runtime.setMemoryLimit(16 * 1024 * 1024);
runtime.setMaxStackSize(512 * 1024);
const context = runtime.newContext();
let deadline = 0;
let timedOut = false;
let outstanding;
let action;
let observation = "{}";
let observations = 0;
let entryPromise;
let revoked = false;
runtime.setInterruptHandler(() => {
  if (performance.now() >= deadline) timedOut = true;
  return timedOut;
});

function bind(name, callback) {
  const handle = context.newFunction(name, callback);
  context.setProp(context.global, name, handle);
  handle.dispose();
}

bind("observe", () => {
  if (++observations > 100) throw new Error("Observation limit exceeded");
  return context.newString(observation);
});
bind("act", (actionHandle) => {
  if (outstanding) throw new Error("Overlapping actions");
  action = context.getString(actionHandle);
  if (!["plant", "water", "harvest", "move", "wait"].includes(action)) throw new Error("Unknown action");
  outstanding = context.newPromise();
  return outstanding.handle;
});

deadline = performance.now() + 100;
context.unwrapResult(context.evalCode(`
  const farm = { inspect: () => JSON.parse(observe()), wait: () => act("wait") };
  const bot = { plant: () => act("plant"), water: () => act("water"), harvest: () => act("harvest"), move: () => act("move") };
`)).dispose();

function consume(result) {
  if (result.error) {
    const value = context.dump(result.error);
    result.error.dispose();
    throw new Error(JSON.stringify(value));
  }
  if (typeof result.value !== "number") result.value.dispose();
}

function runSlice(message) {
  if (revoked) throw new Error("Run revoked");
  observation = JSON.stringify(message.observation);
  observations = 0;
  action = undefined;
  timedOut = false;
  const start = performance.now();
  deadline = start + message.budgetMs;
  let jobs = 0;
  try {
    if (message.type === "start") {
      const result = context.evalCode(message.source, "main.js", { type: "module" });
      consume(result);
      entryPromise = context.getProp(context.global, "benchmarkMain");
    } else {
      if (!outstanding) throw new Error("No pending action");
      outstanding.resolve(context.undefined);
      outstanding.dispose();
      outstanding = undefined;
    }
    while (runtime.hasPendingJob()) {
      if (performance.now() >= deadline) {
        timedOut = true;
        throw new Error("Slice deadline exceeded");
      }
      consume(runtime.executePendingJobs(1));
      jobs++;
    }
    const state = context.getPromiseState(entryPromise);
    if (state.type === "rejected") consume(state);
    else if (state.type === "fulfilled") state.value.dispose();
    if (performance.now() >= deadline) {
      timedOut = true;
      throw new Error("Slice deadline exceeded");
    }
    return { sliceMs: performance.now() - start, jobs, action, timedOut };
  } catch (error) {
    revoked = true;
    return { sliceMs: performance.now() - start, jobs, timedOut, error: String(error) };
  }
}

function sample() {
  const usage = runtime.computeMemoryUsage();
  const guest = context.dump(usage);
  usage.dispose();
  return { cpu: process.cpuUsage(), rss: process.memoryUsage().rss, maxRssKiB: process.resourceUsage().maxRSS, guestUsedBytes: guest.memory_used_size };
}

process.on("message", (message) => {
  try {
    if (message.type !== "sample") process.send({ type: "executing", id: message.id });
    const result = message.type === "sample" ? sample() : runSlice(message);
    process.send({ id: message.id, ...result });
  } catch (error) {
    process.send({ id: message.id, error: String(error) });
  }
});

process.on("disconnect", () => {
  outstanding?.dispose();
  entryPromise?.dispose();
  context.dispose();
  runtime.dispose();
});

process.send({ type: "ready", ...sample() });
