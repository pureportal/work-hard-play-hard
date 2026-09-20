import { fork } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { cpus, totalmem, platform, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { advanceFarm, attacks, createFarm, summarize } from "./workloads.mjs";

const output = resolve(process.argv[2] ?? "artifacts/farming-performance-2026-09-19");
const dependencies = resolve(process.argv[3] ?? `${output}/dependencies`);
const trials = Number(process.env.FARM_BENCH_TRIALS ?? 3);
const seconds = Number(process.env.FARM_BENCH_SECONDS ?? 10);
const resumeBudgetMs = Number(process.env.FARM_BENCH_RESUME_MS ?? 20);
if (!Number.isInteger(trials) || trials < 1 || trials > 10 || !Number.isInteger(seconds) || seconds < 1 || seconds > 60
  || ![5, 20].includes(resumeBudgetMs)) {
  throw new Error("Use 1–10 trials, 1–60 seconds per scenario, and a 5 or 20 ms resume budget");
}
const childEnvironment = Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
const children = new Set();
let messageId = 0;
await mkdir(output, { recursive: true });

function spawn(file, args) {
  const child = fork(fileURLToPath(new URL(file, import.meta.url)), args, {
    env: childEnvironment, execArgv: ["--max-old-space-size=192"], windowsHide: true, silent: true,
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function waitForMessage(child, timeoutMs, trigger, accept = () => true, executionTimeoutMs) {
  return new Promise((resolveMessage, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", onError);
      if (error) reject(error);
      else resolveMessage(value);
    };
    const onMessage = (message) => {
      if (!accept(message)) return;
      if (message.type === "executing" && executionTimeoutMs !== undefined) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          child.kill();
          finish(new Error(`External execution watchdog: ${executionTimeoutMs} ms`));
        }, executionTimeoutMs);
      } else finish(undefined, message);
    };
    const onExit = (code, signal) => finish(new Error(`Worker exited: ${code ?? signal}`));
    const onError = (error) => finish(error);
    let timer = setTimeout(() => {
      child.kill();
      finish(new Error(`External watchdog: ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
    trigger?.();
  });
}

function request(child, message, timeoutMs = 100) {
  const id = ++messageId;
  return waitForMessage(child, message.type === "sample" ? timeoutMs : 2000,
    () => child.send({ id, ...message }), (reply) => reply.id === id,
    message.type === "sample" ? undefined : timeoutMs);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveExit) => {
    const timer = setTimeout(() => child.kill(), 500);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
    if (child.connected) child.disconnect();
    else child.kill();
  });
}

async function startWorker() {
  const start = performance.now();
  const child = spawn("./worker.mjs", [dependencies]);
  let stderr = "";
  child.stderr.on("data", (data) => { stderr = (stderr + data.toString()).slice(-4096); });
  try {
    const ready = await waitForMessage(child, 10_000, undefined, (message) => message.type === "ready");
    return { child, startupMs: performance.now() - start, ready };
  } catch (error) {
    await stop(child);
    throw new Error(`${error}: ${stderr}`);
  }
}

async function compile(workload) {
  const start = performance.now();
  const child = spawn("./compiler.mjs", [workload]);
  let stderr = "";
  child.stderr.on("data", (data) => { stderr = (stderr + data.toString()).slice(-4096); });
  try {
    const result = await waitForMessage(child, 10_000);
    return { ...result, processWallMs: performance.now() - start };
  } catch (error) {
    return { workload, error: `${error}: ${stderr}`, processWallMs: performance.now() - start };
  } finally {
    await stop(child);
  }
}

function cpuMs(before, after) {
  return (after.user + after.system - before.user - before.system) / 1000;
}

async function measurePopulation(population, idle, source) {
  const workers = [];
  const failures = [];
  const firstLoadMs = [];
  const sliceMs = [];
  const roundTripMs = [];
  let completedActions = 0;
  let ipcBytes = 0;
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  try {
    for (let index = 0; index < population; index++) {
      const worker = await startWorker();
      workers.push(worker);
      worker.farm = createFarm();
      const started = await request(worker.child, { type: "start", source, budgetMs: 50, observation: advanceFarm(worker.farm) });
      firstLoadMs.push(started.sliceMs);
      if (started.error || !started.action) throw new Error(`Startup failed: ${JSON.stringify(started)}`);
      worker.action = started.action;
    }
    const initial = await Promise.all(workers.map(({ child }) => request(child, { type: "sample" }, 1000)));
    eventLoop.enable();
    const parentCpuStart = process.cpuUsage();
    const start = performance.now();
    if (idle) await delay(seconds * 1000);
    else {
      for (let tick = 0; tick < seconds * 5; tick++) {
        await delay(Math.max(0, start + (tick + 1) * 200 - performance.now()));
        await Promise.all(workers.filter((worker) => !worker.failed).map(async (worker) => {
          const message = { type: "step", budgetMs: resumeBudgetMs, observation: advanceFarm(worker.farm, worker.action) };
          const requestStart = performance.now();
          try {
            const response = await request(worker.child, message);
            ipcBytes += Buffer.byteLength(JSON.stringify(message)) + Buffer.byteLength(JSON.stringify(response));
            roundTripMs.push(performance.now() - requestStart);
            sliceMs.push(response.sliceMs);
            if (response.error || !response.action) throw new Error(JSON.stringify(response));
            worker.action = response.action;
            completedActions++;
          } catch (error) {
            worker.failed = true;
            failures.push({ tick, error: String(error) });
          }
        }));
      }
    }
    const durationMs = performance.now() - start;
    const parentCpuMs = cpuMs(parentCpuStart, process.cpuUsage());
    eventLoop.disable();
    const final = await Promise.all(workers.map(({ child }) => child.connected ? request(child, { type: "sample" }, 1000) : Promise.resolve(null)));
    const childCpuMs = final.reduce((sum, sample, index) => sum + (sample ? cpuMs(initial[index].cpu, sample.cpu) : 0), 0);
    return {
      population, idle, durationMs, completedActions, expectedActions: idle ? 0 : population * seconds * 5,
      failures, measurementComplete: failures.length === 0 && final.every(Boolean),
      parentCpuMs, childCpuMs, totalCpuCores: (childCpuMs + parentCpuMs) / durationMs,
      childRssSumMiB: final.reduce((sum, sample) => sum + (sample?.rss ?? 0), 0) / 1024 ** 2,
      initialChildRssSumMiB: initial.reduce((sum, sample) => sum + sample.rss, 0) / 1024 ** 2,
      childPeakRssMiB: summarize(final.filter(Boolean).map((sample) => sample.maxRssKiB / 1024)),
      parentRssMiB: process.memoryUsage().rss / 1024 ** 2,
      childRssMiB: summarize(final.filter(Boolean).map((sample) => sample.rss / 1024 ** 2)),
      guestUsedKiB: summarize(final.filter(Boolean).map((sample) => sample.guestUsedBytes / 1024)),
      startupMs: summarize(workers.map((worker) => worker.startupMs)),
      firstLoadMs: summarize(firstLoadMs),
      startupCpuMs: summarize(workers.map((worker) => (worker.ready.cpu.user + worker.ready.cpu.system) / 1000)),
      sliceMs: summarize(sliceMs), roundTripMs: summarize(roundTripMs), ipcBytes,
      parentEventLoopDelayMs: { p99: eventLoop.percentile(99) / 1e6, max: eventLoop.max / 1e6 },
    };
  } catch (error) {
    return { population, idle, measurementComplete: false, setupError: String(error), initializedWorkers: workers.length, firstLoadMs: summarize(firstLoadMs) };
  } finally {
    eventLoop.disable();
    await Promise.all(workers.map(({ child }) => stop(child)));
  }
}

async function measureAttack(name, source, budgetMs = 5) {
  const { child } = await startWorker();
  const start = performance.now();
  try {
    return { name, budgetMs, ...await request(child, { type: "start", source, budgetMs, observation: { crop: null, harvestable: false, needsWater: false } }), roundTripMs: performance.now() - start };
  } catch (error) {
    return { name, budgetMs, error: String(error), roundTripMs: performance.now() - start };
  } finally {
    await stop(child);
  }
}

const results = {
  collectedAt: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model.trim(),
  logicalProcessors: cpus().length, memoryGiB: totalmem() / 1024 ** 3, platform: platform(), release: release(),
  quickjsVersion: JSON.parse(await readFile(resolve(dependencies, "node_modules/quickjs-emscripten/package.json"), "utf8")).version,
  trials, seconds, resumeBudgetMs, startupBudgetMs: 50,
  methodology: "Fixed local fixtures only. One Node process and QuickJS RELEASE_SYNC WASM runtime per farm. 16 MiB guest heap, 512 KiB stack, configurable whole-resume wall deadline, bounded single-job promise pumping, external 100 ms execution watchdog after dispatch acknowledgement (2 s dispatch deadline). Sequential cold process startup. Starter program acts on one cell in a small 8x8 host fixture, five opportunities per second through Node IPC. No application server, network sockets, database, gVisor, or cgroups. The production 50 ms CPU/s quota is not enforced by this Windows probe. CPU is child plus parent process time / wall time, in logical CPU core equivalents; RSS sums can double-count shared pages. All children use a 192 MiB V8 old-space ceiling, not an OS memory limit. Compiler runs are fresh processes with full semantic checking and standard ES2023 libraries in an in-memory filesystem, observed up to 10 s to assess the proposed 2 s limit. No real untrusted input is accepted.",
  compilation: [], starts: [], runs: [], attacks: [],
};

async function save() {
  await writeFile(resolve(output, "runner.json"), JSON.stringify(results, null, 2) + "\n");
}

try {
  let source;
  for (let trial = 0; trial < trials; trial++) {
    for (const workload of ["starter", "nearLimit", "recursiveType"]) {
      const { emitted, ...result } = await compile(workload);
      results.compilation.push({ trial, ...result });
      if (workload !== "recursiveType" && (result.error || result.errors?.length)) throw new Error(`Compilation failed: ${JSON.stringify(result)}`);
      if (workload === "starter" && source === undefined) {
        source = emitted.replace("void main();", "globalThis.benchmarkMain = main();");
      }
    }
    for (let sample = 0; sample < 10; sample++) {
      results.starts.push({ trial, ...await measureAttack("starterFirstLoad", source, 5) });
    }
    for (const population of [1, 8, 16, 32]) {
      const result = await measurePopulation(population, false, source);
      results.runs.push({ trial, ...result });
      console.log(JSON.stringify({ trial, population, cores: result.totalCpuCores, rssMiB: result.childRssSumMiB,
        p95SliceMs: result.sliceMs?.p95, failures: result.failures?.length, setupError: result.setupError }));
      await save();
    }
    results.runs.push({ trial, ...await measurePopulation(32, true, source) });
    for (const [name, attack] of Object.entries(attacks)) results.attacks.push({ trial, ...await measureAttack(name, attack) });
    await save();
  }
  console.log(`Results: ${resolve(output, "runner.json")}`);
} catch (error) {
  results.error = String(error);
  throw error;
} finally {
  await Promise.all([...children].map(stop));
  await save();
}
