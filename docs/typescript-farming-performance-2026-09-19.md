TypeScript farming performance investigation — September 19, 2026

**The design is feasible for a bounded deployment, but the current plan does not establish that the actual server will stay below full CPU usage.** Normal farming scripts are small; process memory, compilation, abusive programs, and existing world simulation are the important capacity constraints. Keep execution on a separate runner host, admit a bounded number of farms, and enforce an aggregate operating-system CPU budget across all runner work.

This investigates the [farming implementation plan](typescript-farming-implementation-plan-2026-09-19.md). Farming, its production sandbox, persistence, and artwork are not implemented. The repository contains no target-server CPU/RAM specification or production utilization measurements. The available machine is a Windows 11 development device with an AMD Ryzen Z2 Go, four physical cores/eight logical processors, about 31.3 GiB usable RAM, and Node 24.14.1. Its timings are not a VPS capacity guarantee. Docker was installed but its daemon was unavailable; no application servers or container services were started.

**Measured script and process costs**

The probe uses QuickJS/WASM `quickjs-emscripten` 0.32.0, one fresh Node process per farm, real guest promises, and IPC to a small host-side fixture. TypeScript 5.9.3 semantically checks and compiles the starter program. The program tends one cell within a 64-cell fixture at five action opportunities/s. The fixture is not the future production reducer and has no database, sockets, order settlement, artwork, or gVisor. Guest heap and stack limits are 16 MiB and 512 KiB; the production CPU quota is not enforced on this Windows host.

Three ten-second trials were requested at each population. These are the ranges across completed trials with an experimental 20 ms resume deadline and 50 ms first-evaluation deadline:

| Active farms | Completed trials | Total runner CPU, in cores | Sum of child RSS | Highest trial p95 execution slice |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 3/3 | 0.014–0.028 | 58 MiB | 1.01 ms |
| 8 | 2/3 | 0.142–0.191 | 462–463 MiB | 0.80 ms |
| 16 | 3/3 | 0.147–0.270 | 925–927 MiB | 1.10 ms |
| 32 | 3/3 | 0.439–0.547 | 1,857–1,861 MiB | 1.06 ms |
| 32 waiting, no resumes | 3/3 | 0.055–0.082 | 1,840–1,842 MiB | — |

CPU is the sum of child and supervisor process CPU time divided by elapsed time. **0.55 cores means about 55% of one logical CPU, not 55% of the whole machine.** Interpreter startup and compilation are excluded from these action windows. The supervisor adds roughly 57–70 MiB RSS. Summed RSS can count shared pages more than once; it is not a measurement of physical or Linux cgroup memory. Short samples include runtime warm-up/background work, and the desktop was not isolated from unrelated activity.

All 8,150 action opportunities in the completed active trials succeeded; the three 32-farm trials account for 4,800 of them. At 32 farms, the highest trial p95 IPC round trip was 16.19 ms. One eight-farm setup failed before measurement because normal first evaluation exceeded its 50 ms deadline. An earlier trial also failed during setup of the idle scenario. Both failures are retained in the evidence. **The prototype has low ordinary execution cost, but its startup policy has not passed a reliability gate.**

With the plan's original 5 ms deadline, 16 of 30 separate first-load probes rejected the valid starter program in the repeated experiment. A separate 5 ms steady-action run stopped one of 32 normal farms on its first resume, at 7.75 ms. A larger elapsed-time allowance avoided action-time failures in the completed 20 ms trials; this does not validate 20/50 ms as production defaults. Wall time includes descheduling, runtime warm-up, and garbage collection. Calibrate deadlines on the actual Linux host while retaining the independent CPU quota and external watchdog.

Fresh compiler jobs included compiler loading, standard ES2023 declarations in a virtual filesystem, semantic checking, and emit:

| Program | Cold process wall time, three trials | Compiler CPU time | Peak process RSS |
| --- | ---: | ---: | ---: |
| 301-byte starter | 1.31–1.42 s | 1.45–1.53 CPU-s | 125.2–130.7 MiB |
| 32,763-byte valid program | 1.27–1.78 s | 1.61–2.13 CPU-s | 143.5–145.4 MiB |

Even without compilation or gVisor, cold interpreter-process readiness reached a trial p95 of 781 ms and an individual maximum of 1.59 s. The plan's 500 ms start target is not established by these results.

The small circular-type fixture was rejected in all three trials; this is a diagnostic check, not compiler exhaustion coverage. The probe allowed ten seconds externally to observe costs rather than pretending the proposed two-second wall limit was already enforced. Six compiles/minute for each of 32 accounts permit 3.2 compiles/s in aggregate. At the measured valid-program costs, that represents roughly **4.6–6.8 CPU cores** of sustained demand before interpreter work. A two-slot queue limits concurrency but can still stay continuously busy; it needs an aggregate CPU cap and bounded admission as well.

Resource-abuse probes used a 5 ms guest deadline and a 100 ms external execution watchdog, repeated three times:

| Fixed workload | Observed outcome |
| --- | --- |
| Infinite loop | Interpreter interruption in 6.2–6.6 ms. |
| Self-perpetuating promise chain | Shared slice deadline stopped the queue in 5.1–5.2 ms. |
| Repeated large array allocations | Required process termination by the external watchdog; observed request-to-timeout was 103–117 ms. |
| Single 32 MiB typed-array allocation | Rejected as out of memory under the 16 MiB guest limit. |
| Pathological regular expression | Interrupted in 6.4–9.4 ms. |
| Two overlapping game actions | Rejected by the single-outstanding-action check. |

The host drains one promise job at a time against the same deadline; it does not grant a fresh budget to every microtask. The QuickJS bindings expose pending-job scheduling, interrupt, heap, and stack controls, but the measured allocation case shows why an external watchdog remains necessary. These known local inputs do not establish sandbox security, process isolation, or behavior under simultaneous hostile tenants. [QuickJS bindings and runtime controls](https://github.com/justjake/quickjs-emscripten).

**Existing server headroom**

The existing [server probe](../scripts/performance/investigation-server.ts) was rerun against the current code. It uses an in-memory fixture, 100 warm-up ticks and 1,000 measured ticks per scenario, including cached JSON serialization but excluding sockets, PostgreSQL, command handling outside the tick, and real timer scheduling. Profiling was enabled. All moving players were on the same floor.

| Moving players | Mean tick | p99 tick | Mean work / 50 ms tick interval |
| ---: | ---: | ---: | ---: |
| 13 | 2.51 ms | 5.85 ms | 5.0% |
| 50 | 9.19 ms | 16.09 ms | 18.4% |
| 100 | 26.45 ms | 51.84 ms | 52.9% |

These fractions describe tick work on one execution thread, not measured whole-machine CPU utilization. With 100 connected but stationary players, mean tick work was 0.013 ms. One long pathfinding case averaged 101.38 ms and reached 140.12 ms across 40 samples. A single such request can block multiple world ticks. The crowded case already exceeds the 50 ms p99 target before adding farms; it needs its own performance work before claiming comfortable capacity for 100 active players.

The [world runtime](../apps/server/src/world/world-runtime.ts) ticks every 50 ms. Farm scripts must not run there. The [application persistence coordinator](../apps/server/src/app.ts) exports dirty workspace state, and the [workspace repository](../apps/server/src/persistence/postgresql-workspace-repository.ts) synchronizes whole entity collections. Farm actions must not trigger that save path five times per second. Dedicated dirty farm rows, staggered/batched checkpoints, and the existing coordinated transaction path for money are necessary. At 32 farms and five opportunities per second, there are up to 160 action opportunities/s; two-second dirty checkpoints average at most 16 farm-row updates/s before separate economic operations. Neither database throughput nor settlement latency was measured.

**Resource limits that prevent sustained saturation**

The plan's 50 ms CPU/s allowance is 0.05 of one CPU per admitted run. Its 256 MiB sandbox ceiling is a limit, not expected occupancy.

| Admitted farms | Guest CPU ceiling | Share of 2 vCPU | Share of 4 vCPU | Share of 8 vCPU | Sum of 256 MiB ceilings |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 0.4 CPU | 20% | 10% | 5% | 2 GiB |
| 16 | 0.8 CPU | 40% | 20% | 10% | 4 GiB |
| 32 | 1.6 CPUs | 80% | 40% | 20% | 8 GiB |

Compilation, startup, the supervisor, sandbox overhead, and the game/database are additional work. Two compiler jobs each limited to one CPU can bring 32 farms to 3.6 CPUs before that overhead: 90% of a four-vCPU host. The current [Compose file](../compose.yaml) contains neither a runner nor CPU/memory limits. These are proposed controls, not protections already installed.

Use the following admission profiles only as conservative starting points for testing a **separate runner host**:

| Runner host | Initial farm limit | Compiler slots | Aggregate runner CPU ceiling |
| --- | ---: | ---: | ---: |
| 2 vCPU / 4 GiB | 4 | 1, capped at 0.5 CPU | 1 CPU |
| 4 vCPU / 8 GiB | 8 | 1, capped at 1 CPU | 2 CPUs |
| 8 vCPU / 16 GiB | 32 | 2, jointly capped at 2 CPUs | 4 CPUs |

Admission must also fit memory limits and measured sandbox overhead with at least 25% host memory headroom; reduce these counts if it does not. Count waiting and paused-but-resident interpreters as admitted. Bound compiler and startup queues globally, charge repeated failures against start quotas, and do not automatically restart killed programs. Never admit based solely on normal script averages.

Startup needs a separate accounting phase and latency target. A process requiring 170 ms of CPU to initialize takes at least about 3.4 seconds of quota accrual if restricted to 50 ms CPU/s from creation, ignoring scheduling-period bursts. That conflicts with a blanket 500 ms start target. Either allocate a bounded startup budget within the aggregate ceiling or accept the longer start; do not remove the global cap. Likewise, a compiler restricted to half a CPU needs a wall deadline that accommodates its CPU budget. Neither a 5 ms wall deadline nor a 2 s compile deadline can be transferred unchanged to an arbitrarily throttled host.

Apply the aggregate CPU limit to the actual guest containers, compiler processes, and supervisor. A limit on a broker container does not cover sibling containers it launches. Verify the resulting cgroup hierarchy and counters, including gVisor processes. CPU shares alone are not a hard ceiling; quotas limit sustained CPU over scheduling periods, while short bursts can still occur. [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/), [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html).

Use 60–70% sustained total host CPU as an operating target, not a promise implied by the farm cap. Stop admission when headroom or game latency deteriorates; queue starts with bounded wait time, then reject them or pause farms when capacity is exhausted. Keep the watchdog outside every guest's blocked event loop and outside a heavily throttled guest budget. Fixed capacity and load shedding should preserve responsiveness even when demand exceeds the farm service's CPU allocation.

**Costs that the implementation must keep out of the busy path**

- Keep one interpreter process per admitted farm alive between actions. Start on Run, sleep while awaiting an action, and destroy on termination; do not launch a process at every 200 ms opportunity.
- Compile a changed source revision once, with a bounded global queue. Reuse its server-compiled artifact for the same source/compiler/API version. Do not compile on ticks or editor keystrokes. A cached start and a compile-plus-start need separate latency targets.
- Schedule only due farms and bound work per scheduler pass. Do not scan every crop in every offline farm at 20 Hz, and do not replay hours of arbitrary code on reconnect.
- Send farm deltas only to actual subscribers and apply socket backpressure. At the proposed 2 KiB/s per detailed subscription, 100 subscriptions are about 200 KiB/s; 100 viewers of all 32 farms are 3,200 subscriptions and about 6.25 MiB/s. These are budget calculations, not measured traffic.
- Render robot and crop animation on clients using generated sprite atlases. The server issues action/state changes; it neither renders Blockbench scenes nor calculates every animation frame. New assets are unavailable, so client frame time and texture budgets remain untested.

**Production validation still required**

On the intended Linux host, repeat the interpreter tests inside the pinned gVisor image with CPU/memory limits active. gVisor adds memory and syscall/startup costs, which these native Windows processes do not represent. Measure actual charged memory rather than assuming summed process RSS equals physical or cgroup memory. [gVisor performance guide](https://gvisor.dev/docs/architecture_guide/performance/).

Then run the game server and a disposable PostgreSQL database under realistic movement, path requests, games, subscriptions, checkpoints, and settlement traffic while the separate runner handles normal scripts, compile bursts, hostile programs, and full queues. Increase admitted farms through 4, 8, 16, and 32 only while CPU stays below the operating target, at least 25% memory remains free of the planned allocation, and game p99 event-loop delay grows by less than 5 ms. Aim for p99 tick work below 25 ms to retain margin within the 50 ms interval. Test maximum farm state and source sizes, cold and cached starts, slow sockets, restart recovery, and at least a one-hour soak. Explicitly verify that throttling and rejected admissions work under overload.

These tests are release gates, not completed checks. This investigation changes no gameplay, economy rules, application dependencies, database records, or deployment configuration.

**Reproduction and evidence**

The [benchmark](../scripts/performance/farming/benchmark.mjs), [interpreter worker](../scripts/performance/farming/worker.mjs), [compiler probe](../scripts/performance/farming/compiler.mjs), and [fixed workloads](../scripts/performance/farming/workloads.mjs) accept only local test scenarios in the orchestrator. They are measurement tools, not a production sandbox. New dependencies are installed only into an ignored artifact directory. Existing workspace dependencies must already be installed.

From the workspace root, in PowerShell:

```powershell
New-Item -ItemType Directory -Force artifacts/farming-performance-2026-09-19/dependencies | Out-Null
npm install --prefix artifacts/farming-performance-2026-09-19/dependencies --no-audit --no-fund --ignore-scripts --save-exact quickjs-emscripten@0.32.0
pnpm --filter @workhard/server exec tsx ../../scripts/performance/investigation-server.ts ../../artifacts/farming-performance-2026-09-19/baseline
$env:FARM_BENCH_TRIALS = '1'
$env:FARM_BENCH_RESUME_MS = '5'
node scripts/performance/farming/benchmark.mjs artifacts/farming-performance-2026-09-19/budget-5ms artifacts/farming-performance-2026-09-19/dependencies
$env:FARM_BENCH_TRIALS = '3'
$env:FARM_BENCH_RESUME_MS = '20'
node scripts/performance/farming/benchmark.mjs artifacts/farming-performance-2026-09-19/budget-20ms artifacts/farming-performance-2026-09-19/dependencies
Remove-Item Env:FARM_BENCH_TRIALS, Env:FARM_BENCH_RESUME_MS
pnpm exec oxlint --deny-warnings scripts/performance/farming
```

Run benchmarks sequentially. Defaults are three trials and ten seconds per population. `FARM_BENCH_SECONDS` can select 1–60 seconds; one-second probes are only smoke checks because CPU accounting is coarse. The parent terminates children after each scenario, including failed setups. A setup failure is retained and does not abort later scenarios. Killed/paused runs must not be treated as successful capacity results.

Raw local results: [existing server](../artifacts/farming-performance-2026-09-19/baseline/server.json), [5 ms deadline](../artifacts/farming-performance-2026-09-19/budget-5ms/runner.json), [20 ms deadline](../artifacts/farming-performance-2026-09-19/budget-20ms/runner.json). The earlier interrupted 20 ms trial is preserved [separately](../artifacts/farming-performance-2026-09-19/budget-20ms-initial.json), including its startup failure. The server CPU profile and dependency lockfile also remain under `artifacts/farming-performance-2026-09-19/`; these generated files are ignored by Git. Reported CPU excludes the compiler, child startup, and game server during steady-action scenarios; those costs are measured or discussed separately.

Verification completed: all four probe files pass JavaScript syntax checks and Oxlint (96 rules, no diagnostics); all 36 local links across the plan and report resolve; six changed/added files have no trailing whitespace. Result checks confirm 14 completed scenarios, 8,150 completed actions, 18 stopped abuse probes, and the recorded startup failures. No benchmark Node processes remain. No application regression suite or production sandbox security assessment was run, because no application behavior was changed and the required Linux deployment is unavailable.
