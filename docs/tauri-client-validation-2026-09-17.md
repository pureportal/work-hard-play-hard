# Tauri client validation — 17 September 2026

The client builds and runs on Windows, and the universal Android APK installs and runs in an Android emulator. Two confirmed connection-recovery defects prevent an unconditional completion claim. The full client test run also failed. Current Linux packaging and installation remain unverified.

This review used the working tree based on `d5313afaa222de6fd4ba89b032c5bfbc648f7803`, version 6.0.0, including its existing uncommitted implementation. Earlier completion statements were not counted as test evidence. Other client/game and server/economy edits appeared during validation; the source tree was not an immutable release snapshot. The Tauri configuration, server URL module, API module, and App module used for the findings were unchanged during the review. A clean CI run against the final committed tree is still required.

Evidence and reproduction scripts are in [artifacts/tauri-review-2026-09-17](../artifacts/tauri-review-2026-09-17). These local artifacts are ignored by Git.

**Findings, in severity order**

1. **High — a server with the wrong JSON response persistently hides the server controls. Confirmed.**

   [api.ts](../apps/client/src/api.ts), `fetchSession` at line 85 and `readResponse` at line 367, accepts any successful JSON as the expected session type. [App.tsx](../apps/client/src/App.tsx), line 488, subsequently reads `registration.enabled` without a valid registration object.

   Reproduction: select a syntactically valid HTTPS origin whose `/v1/auth/session` returns HTTP 200, JSON `{}`, and the necessary CORS headers. The app throws `TypeError: Cannot read properties of undefined (reading 'enabled')`, leaving an empty root and no server field. The saved origin remains in local storage, so reopening the app repeats the failure while the server returns that response. Recovery requires clearing application storage or fixing the server outside the app.

   Reproduced with the production frontend, the freshly built, installed Windows executable, and the fresh APK in Android WebView using controlled responses. Evidence: `browser-measurements.json`, `windows-measurements.json`, `android-measurements.json`, and the corresponding `*-invalid-session.png` screenshots. Validate the session response at the API boundary and preserve an accessible server-change path when initialization fails.

2. **Medium — the request timeout stops at response headers, allowing a stalled body to trap startup. Confirmed.**

   [api.ts](../apps/client/src/api.ts), lines 393–417, clears its ten-second timeout when `fetch()` resolves. JSON consumption occurs later in `readResponse`. [App.tsx](../apps/client/src/App.tsx), line 538, shows a loading view without server controls while that consumption remains pending.

   Reproduction: return headers and an incomplete JSON stream (`{"user":`) from the session request, then leave the stream open. After 11.5 seconds, the signal is not aborted and no server input is present. Reproduced in the running web client, fresh Windows executable, and fresh Android APK with a controlled `ReadableStream` that honors aborts; this is a deterministic API-boundary test, not a real stalled TLS server. Evidence: `response-body-timeout.mjs`, `body-timeout.json`, `windows-body-timeout.json`, `android-body-timeout.json`. The timeout needs to cover body consumption, and initialization needs a recovery control.

3. **Medium — the client validation gate is not green. Confirmed test failure; not a demonstrated Tauri runtime defect.**

   The full client run passed 813 of 814 tests; `Workspace.meeting-entry.test.tsx:525` timed out opening the nearby Review board. Repeated runs of that file instead consistently failed its overlapping Falling Blocks case at line 219. An isolated run exposed `window.matchMedia is not a function` at [FallingBlocksGame.tsx](../apps/client/src/components/FallingBlocksGame.tsx), line 33. [test-setup.ts](../apps/client/src/test-setup.ts) does not provide that browser API; the component's own test file supplies a local stub, which does not cover this integration test.

   The arcade implementation changed independently during this review. The first board timeout and the isolated `matchMedia` failure should not be treated as the same proven cause. This result establishes an unreliable/failing local gate, not a regression caused by Tauri. Evidence: `client-tests.log`, `meeting-rerun.log`, `meeting-serial.log`, and `meeting-targeted.log`. Release validation calls the workspace checks in [.github/workflows/ci.yml](../.github/workflows/ci.yml), line 93.

**Builds, packages, and execution**

| Check | Result and limit |
| --- | --- |
| Workspace lint and type checks | `pnpm lint` and `pnpm typecheck` passed. |
| Full client tests | 813 passed, 1 failed; details above. |
| Focused connection tests | 74 passed across server URL, API, App, realtime, media connection/devices, auth screen, and client update tests. |
| Focused server integration tests | 61 passed across app, realtime, authentication security, branding, and chat-image routes. |
| Rust | Format check and `cargo clippy --locked --all-targets -- -D warnings` passed on Windows. This does not compile Linux-only Rust code. |
| Release/workflow validation | `pnpm release:validate` and actionlint 1.7.12 passed. No workflow was dispatched and nothing was published. |
| Web production build | Passed; Vite build reported 29.7 seconds. |
| Landing production build | Passed. Static browser validation passed 14 light/dark viewport combinations, 320–1920 pixels, including link, copy, image/dialog, and keyboard checks. |
| Windows NSIS build | Fresh `tauri build --bundles nsis` succeeded in 1,091.5 seconds; Rust compilation took 11m40s and native Vite build 31.2s. |
| Windows installation | Fresh installer completed a per-user silent installation in 90.2 seconds. The installed executable launched under a normal user token, rendered the game, and survived process restart. Uninstallation returned 0 and removed the installed executable. Existing WebView2 was reused; clean-machine runtime bootstrap was not tested. |
| Android build | Fresh `pnpm build:android` produced a universal release APK for arm64-v8a, armeabi-v7a, and x86_64. Build log span was approximately 30 minutes; this was an incremental, busy-machine build. |
| Android signing | Signed locally with a disposable validation key. Independent `apksigner verify` and `zipalign -c -P 16 4` both returned 0; v2/v3 signatures verified. ARM64 ELF LOAD segments have 0x4000 alignment. These are not production-signing or physical 16-KB-device tests. |
| Android installation/execution | Fresh signed APK installed successfully on Android 16/API 36 x86_64 emulator in 46.9 seconds, including transfer. Activity cold launch reported 2.064 seconds; force-stop/relaunch reported 1.199 seconds. Activity launch completion is not first rendered game content. Server entry, authenticated sessions, canvas/character artwork, repeated switching, recovery, and URL persistence passed the initial fixture. A later device screenshot showed office-map graphics, but the follow-up run was interrupted by System UI failures; sustained rendering/interaction stability remains unverified. |
| Linux | No suitable local Linux desktop/toolchain was available. WSL only exposed stopped Rancher distributions and the Docker engine was unavailable. No current Linux build, DEB/AppImage installation, or WebKitGTK execution was completed. |

The PowerShell signing wrapper reported a nonzero outer status while formatting native stderr; the signing script reached its successful artifact output. Independent APK verification and actual installation above establish the usable result without treating that wrapper status as a clean pass.

Fresh Windows installer: `apps/client/src-tauri/target/release/bundle/nsis/Northstar_6.0.0_x64-setup.exe`, SHA-256 `70D061C471DC9331374C1B5D6C9399B1A71CCDD9453FFD29AAE8A62AAA083882`. Installed executable SHA-256: `BBD30D8640AD499F0AC94C59E8DEBBCF64F3518DDA3E41DCF2054A88DEFAF033`.

Fresh Android test APK: `artifacts/tauri-review-2026-09-17/northstar-android.apk`, SHA-256 `F4A174D8290B5DE06A1DD3F8C3E3CE783E14D4DA2AF646E64C586C089EB42344`. Its disposable key was deleted; this APK is not a production update package.

**Connection behavior and game integration**

The installed client has no default game server. [server-url.ts](../apps/client/src/server-url.ts) ignores the web-only `VITE_SERVER_URL` default in native mode, saves the selected origin, rejects non-HTTPS native origins and origins with credentials/path/query/fragment, and derives API and realtime URLs from that origin. The web client retains its same-origin behavior. The tested malformed saved value returns to an empty server form.

The production frontend, installed Windows app, and fresh Android APK passed these controlled-fixture checks:

- Empty first launch made no game-server request and offered no default-server action; eight missing/invalid URL cases were rejected.
- Editing a URL without submitting it did not change the active server.
- Authentication used secure HttpOnly `SameSite=None` cookies; requests and cookies remained scoped to their server.
- Authenticated realtime connections, canvas rendering, character artwork, and server-hosted branding images worked under the native security policy.
- Server switching during an authenticated session closed the previous realtime connection and remounted the session. Ten alternating switches each ended with exactly one active socket to the selected server; the previous server's cookies were not sent to the next server.
- Saved origin and session survived page reload; the saved origin also survived a complete Windows process restart.
- Simulated interruption recovered; an unavailable server could be replaced using the server field.

These fixtures use the real Fastify application and in-memory database via request/WebSocket injection, with browser transport interception. They do not start listening servers, and they do not prove end-to-end connectivity to an independently deployed HTTPS private server.

Actual Windows network attempts separately covered DNS failure, a refused port, an untrusted certificate, and TLS against the existing HTTP backend. WebView2 reported `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`, `ERR_CERT_AUTHORITY_INVALID`, and `ERR_SSL_PROTOCOL_ERROR`; each returned an editable error form. On Android, HTTP input was rejected, `.invalid` DNS failure and HTTPS-to-HTTP failure returned editable errors, and the self-signed endpoint was rejected with an aborted request. The Android engine did not expose a certificate-specific network code in that test, so its exact certificate error classification is not asserted. Android saved configuration survived force-stop/relaunch.

The existing web client at port 5173 successfully authenticated against the existing backend at port 3001, rendered its seeded workspace, opened Settings/People/Messages/Meetings, recovered after a simulated offline interval, and retained usable server configuration at 1280×820 and 390×844 without horizontal overflow or uncaught page errors.

API, realtime, branding, chat images, whiteboard images, media signaling, and server-provided ICE configuration were traced through the connection code and relevant tests. A synthetic audio track between two real `RTCPeerConnection` objects connected in Windows WebView2. Real microphone/camera capture, screen sharing, remote participants, TURN traversal, and changing servers during an actual media call were not exercised. Unit cleanup tests are not a substitute for those device/network checks.

**Performance observations**

Host: Windows 11 Home 10.0.26200, AMD Ryzen Z2 Go, eight logical processors, 32 GiB RAM. Existing development services and other build/review activity were present. The installed Windows app used WebView2/Chromium 153. The Android emulator used Android 16, WebView 133.0.6943.137, WHPX, four virtual CPUs, 3 GiB RAM, host GPU, and a 720×1280 display (360×640 CSS pixels). Initial emulator setup with software graphics suffered Bluetooth/System UI failures, and System UI failures recurred in a later host-GPU run. These are environmental failures, not attributed to the app. Bluetooth was disabled only in the disposable emulator.

| Measurement | Observation |
| --- | --- |
| Fresh installed Windows startup | 4.471s from process launch to debugging endpoint availability; production page reload to empty server form 151ms. Neither is a cold first-pixel benchmark. |
| Windows ten authenticated switches | Median 300ms; range 221–417ms, from Connect click to connected status and canvas presence in the controlled fixture. |
| Windows frame intervals | 180 consecutive intervals over about three seconds: median 16.7ms, p95 16.9ms, maximum 18.5ms. |
| Windows interruption/recovery | 17ms to offline indication and 63ms to reconnection in the controlled transport fixture. |
| Windows resource snapshot | Earlier local package process tree summed to 408.5 MB working set and 200.2 MB private bytes. Shared pages may be counted more than once. Fresh package JS heap rose from 20.39 to 21.11 MB during a three-second frame sample; nodes (688), listeners (312), and documents (2) were stable during that sample. This is not a leak/soak certification. |
| Android ten authenticated switches | Median 1.718s; range 1.393–5.934s in the same API/realtime fixture. Page reload to empty server form took 538ms. |
| Android frame intervals | 84 intervals over about three seconds: median 16.7ms, p95 116.7ms, maximum 183.3ms. This emulator had substantial variability; physical-device responsiveness remains unmeasured. |
| Android recovery/resources | Controlled offline detection 228ms, reconnection 179ms. JS heap 15.47→17.18 MB during the frame sample; nodes (886), listeners (333), and documents (1) stayed stable. App-process snapshot after the fixture: PSS 101,916 KiB, RSS 249,028 KiB, excluding separate WebView renderer processes. |
| Headless software-rendered fixture | Forced SwiftShader: switch median 2.859s, range 2.566–5.160s; frame median 133.3ms and p95 150.1ms. The rendering backend materially changed the result; the Windows hardware-backed run did not reproduce this slowdown. |
| Live web client | Login form 1.915s; sign-in to canvas 3.169s; measured panel actions 614–1,075ms including automation and two animation frames; reconnection 1.665s. |
| Live web frame intervals | 111 intervals over about three seconds: median 16.7ms, p95 66.9ms, maximum 166.7ms. This seeded development scene and workload differ from the native fixture, so the numbers are not a platform comparison. |
| Health checks | Fifteen samples across liveness, readiness, and proxied readiness: median 13.5ms, range 2.6–111.1ms; all HTTP 200. |

Frame summaries exclude the first sample because its initial clock baseline is not a complete animation-frame interval. No acceptance thresholds were invented. Measurements identify rendering-backend sensitivity and substantial packaging cost; they do not establish a general performance regression against a measured pre-Tauri baseline. Different viewports, engines, active workloads, and concurrent source edits also prevent a controlled cross-platform comparison.

The initial Android CDP screenshot showed an empty world area despite passing canvas-presence and avatar-pixel assertions. A separate device screenshot, `android-render-device.png`, subsequently showed the office floor and furniture, together with a “System UI isn't responding” overlay. That follow-up fixture timed out waiting for the second authenticated connection and did not complete its longer rendering measurement (`android-render.log`). This exposes a limit in the browser harness: canvas presence and avatar pixels do not prove the main scene has painted. The connection timings above end at connected status plus canvas presence. Treat sustained Android rendering/interaction stability and time to a fully drawn scene as unverified; no persistent blank-map application defect was established.

The native frontend contains 5,292 files totaling 238,696,381 bytes after source-image removal. The fresh Windows installer is 239,585,926 bytes; the signed Android APK is 724,559,480 bytes (about 691 MiB). Inspecting the APK explains most of that size: it contains three uncompressed native libraries of 241,085,688, 239,490,648, and 241,427,744 bytes, each carrying the embedded assets for its architecture. This is a confirmed source of transfer/storage/build cost and an optimization opportunity, not a failure against an unstated size budget.

**Workflows, signing, and download destination**

The current packaging and release workflows request Windows NSIS, Linux DEB/AppImage, and a universal Android APK. Android initialization/configuration and signing are explicit; signing verifies metadata, expected architectures, signatures, and ZIP alignment. Pull-request/manual APKs use temporary keys, while release signing uses repository secrets. Workflow syntax passed actionlint. Packaging itself does not provide package-installation or physical-device execution coverage.

The landing entry at [apps/landing/index.html](../apps/landing/index.html), lines 28–30, links to this repository's latest GitHub release and says exactly “Private server required.” The link is real, but publication status matters: the [published v6.0.0 release](https://github.com/pureportal/work-hard-play-hard/releases/tag/v6.0.0) still contains older packages, including a 677,261,170-byte Windows installer, a 2,021,807,736-byte Android APK, and a 670,468,936-byte DEB. It has no AppImage. These are not the packages rebuilt during this review.

The [published release workflow run](https://github.com/pureportal/work-hard-play-hard/actions/runs/35212572438) did successfully compile/package the older Linux DEB. Its logs show `tauri build --bundles deb`; they do not verify the current Linux cookie change, AppImage build, installation, or runtime. The current README's statement that AppImages are published is therefore ahead of the observed release contents. A synchronized version bump on `main`, successful validation/packaging, and publication are required before the landing link can deliver these working-tree changes.

All four required Android signing secret names were present in repository metadata. Their values were not read, and current keystore validity/update continuity was not independently exercised. The locally tested APK used a separate disposable key. Windows Authenticode checks report unsigned packages, and no Windows signing configuration was found. SmartScreen reputation, production signing, release upgrades, and new release publication were not tested.

**Services, changes, and remaining limits**

The existing server and web client were reused. Final direct liveness/readiness and proxied readiness checks returned HTTP 200, with database readiness true. The supervisor reported both configurations running and no supervisor restarts; no health-check command is configured there. Hot-reload logs did show server restarts after independent source edits. The review did not request service restarts or start additional development servers. Recent Vite diagnostics included a truncated socket/proxy stack during disconnect activity; the available tail did not include its initiating message, and the tested web recovery still succeeded.

The workspace landing configuration was stopped. Port 4174 belonged to another workspace, so this landing was validated from its production files through browser interception instead of that unrelated service.

No application source, database seed, workflow, or interface was changed by this review. Added this report and local validation scripts/logs/screenshots; rebuilt local packages; performed an isolated Windows install/uninstall; provisioned and used a disposable Android emulator. The test APK was uninstalled, the emulator was stopped, the debugging forward was removed, and temporary Windows launch tasks were removed. Local test tooling/images and evidence remain under the review artifact directory. Existing unrelated working-tree edits were retained. No commits, releases, workflow dispatches, or uploads were made.

Remaining checks: current Linux compilation and DEB/AppImage install/run; Windows clean-machine WebView2 bootstrap and signed distribution; physical Android ARMv7/ARM64 and minimum-version devices; real 16-KB Android execution; production-key APK upgrade; real trusted-HTTPS private-server login across native platforms; microphone/camera/screen-sharing permissions and remote media; long-running resource tests; and distribution behavior after a new release is published. The two confirmed recovery defects and failing validation gate remain unfixed.
