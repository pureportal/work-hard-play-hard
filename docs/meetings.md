# Meetings

## Meeting rooms

Open **Build → Room settings**, select a room, enable **Meeting room**, and propose the change. Apply it through **Funds & votes** once approved.

The room appears in **Meetings**, and entering it offers **Open** or **Open Small**, even before anyone has joined. Its call has no scheduled time or duration. Leaving the last participant makes it available to start again. Renaming the room also renames its call and chat. Disabling the setting or removing the room ends its call. Existing room access, capacity, locks, and invitations apply.

The setting and meeting chat persist in PostgreSQL. Migration `Migration20260917160000` adds idle meetings and permits an absent schedule. It runs with the server's normal startup migrations.

Run `pnpm --filter @workhard/client exec vite build --outDir ../../artifacts/meeting-rooms/client` followed by `pnpm --filter @workhard/server exec tsx ../../scripts/meeting-rooms-browser-check.ts` for the settings, proposal, Meetings, room-entry, and disabling flows. The check uses an isolated in-memory application; its screenshots and report are in `artifacts/meeting-rooms/`.

## Open calls

Enable the microphone or camera near coworkers to join their open conversation. Accepted call invitations join the same open conversations. Each participant controls their own devices. Leaving or walking out of range stops both devices; joining again requires enabling them again. Open calls follow the people and have no map location or lock. Meetings take place in rooms.

Open calls share the WebRTC transport and ICE configuration below. Run `pnpm e2e:open-calls` to check three browser participants, audio and camera playback, joining, leaving, walking away, disconnects, and desktop/mobile layouts. It uses an isolated in-memory workspace and writes screenshots to `artifacts/open-calls/`.

## Media deployment

Meetings use WebRTC connections between participants and the existing authenticated WebSocket for signaling. A session belongs to the tab that joined it. Disconnecting that tab releases its membership even when another tab remains open.

Serve the client over HTTPS outside localhost. Configure `MEETING_ICE_SERVERS` on the server with a JSON array of ICE servers. Each entry has a `urls` array; TURN entries also require `username` and `credential`. The default is an empty array. Cross-network connections need a reachable TURN service; no public relay is selected automatically. Each admitted participant receives the configured credentials, so use credentials intended for browser clients.

Microphones request echo cancellation, noise suppression, automatic gain control and mono audio. Noise filtering can be changed in meeting settings. Camera and screen capture use separate tracks, and shared audio stops with the screen share.

Room access and capacity are checked before switching meetings. The first participant controls the meeting lock; the role transfers when they leave. Invitations are recipient-specific, single-use and expire after one minute. Room settings changes revoke outstanding invitations and remove participants who no longer have access.

Whiteboards retain their existing proximity and room restrictions. Opening a nearby board minimizes the meeting without restarting media. Board edits continue through the existing revision-checked save flow.

## Verification

Run `pnpm e2e:meetings` with Microsoft Edge installed. It builds the client and starts a temporary test application with an in-memory database. It does not use the development database or start development servers.

The browser check covers three participants, generated camera and screen video, shared audio, locked entry, invitations, chat, stale leave requests, disconnects and explicit rejoining. It also exercises the built interface with denied media permissions, microphone retry, chat scrolling, and whiteboard editing on desktop and mobile. Screenshots are written to `artifacts/meetings/`.

The client tests cover delayed permission results, stale acknowledgements, device loss, dialog focus, and playback recovery for late-arriving tracks. The server tests cover session ownership, signaling isolation, room restrictions, host transfer and invitation revocation.

Physical camera behavior, acoustic noise reduction, the operating system's screen/window picker, TURN connectivity, and large meetings require deployment testing. The browser transport fixture uses animated canvas tracks because Edge's simulated camera terminates immediately in the Windows environment used for this verification.
