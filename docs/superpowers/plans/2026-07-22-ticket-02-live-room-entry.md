# Ticket 02 Live Room Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a valid Nuxt Room page to an authoritative PartyKit Room so its first Participant receives a distinct `#1` Display Name, visible Admin assignment, and explicit connection lifecycle.

**Architecture:** A shared discriminated protocol connects a framework-independent Room core, a thin PartyKit lifecycle adapter, and a Nuxt WebSocket composable. The browser uses native `WebSocket` with one automatic reconnect after an unexpected loss, then exposes manual retry; every connection creates a fresh authoritative participation.

**Tech Stack:** Node.js 24, pnpm, Nuxt 4, Vue 3, TypeScript, PartyKit, Vitest, Playwright

---

### Task 1: Add the shared protocol and Room-core test harness

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `shared/protocol.ts`
- Create: `server/room-core.test.ts`

- [ ] **Step 1: Add current PartyKit, Vitest, and test scripts**

Add `partykit` and `vitest` as development dependencies. Add `test:unit`, `dev:party`, and `test:live` scripts. `test:unit` runs `vitest run`; `dev:party` runs `partykit dev --port 1999`; `test:live` points Playwright at its dedicated live-Room configuration.

- [ ] **Step 2: Define the shared discriminated protocol**

Create serializable `Participant`, `Message`, and snapshot types. Define server events with `type: 'snapshot' | 'presence' | 'message' | 'notice' | 'error'` and client events with `type: 'send-message'`. Include `selfId`, `adminId`, ordered `participants`, and `messages` in the snapshot; include stable error `code`, human-readable `message`, and `recoverable` fields. Export a `serializeServerEvent` helper using `JSON.stringify` so the adapter and tests share the wire boundary.

- [ ] **Step 3: Write failing Room-core tests**

Write focused tests which instantiate `RoomCore` with deterministic IDs and assert:

```ts
expect(() => room.connect('Al!')).toThrow('Chosen Name must use 3–20 letters or digits.')
expect(room.participantCount).toBe(0)

const first = room.connect('Alex')
expect(first.snapshot.participants[0]).toMatchObject({
  id: 'participant-1',
  chosenName: 'Alex',
  displayName: 'Alex#1',
  joinSequence: 1,
  isAdmin: true,
})
expect(first.snapshot.selfId).toBe('participant-1')
expect(first.snapshot.adminId).toBe('participant-1')
```

Add a second connection and assert sequence `2`, then disconnect/reconnect the same name and assert a new opaque ID, suffix `#3`, and later sequence.

- [ ] **Step 4: Run the tests and verify RED**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: FAIL because `server/room-core.ts` does not exist.

### Task 2: Implement the authoritative Room core

**Files:**
- Create: `server/room-core.ts`
- Modify: `server/room-core.test.ts`

- [ ] **Step 1: Implement the minimal connect and snapshot behavior**

Create `RoomCore` with an injected `createParticipantId: () => string`, a Participant map, per-Chosen-Name suffix counters, and a monotonically increasing join sequence. `connect(chosenName)` must call the existing shared Chosen Name validator, allocate identity and `displayName`, choose the lowest-sequence current Participant as Admin, and return `{ participant, snapshot }` without exposing mutable collections.

- [ ] **Step 2: Run focused tests and verify GREEN**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: PASS for validation, `#1`, ordering, and first Admin.

- [ ] **Step 3: Add the failing disconnect/reconnect assertion**

Call `disconnect(first.participant.id)`, reconnect `Alex`, and assert that the new participation has a new ID and does not reuse its earlier suffix or join sequence.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: FAIL because `disconnect` does not yet remove a participation.

- [ ] **Step 5: Implement disconnect and immutable snapshot rebuilding**

Remove only the matching current Participant. Recompute `isAdmin` and `adminId` from the earliest remaining join sequence whenever building a snapshot. Keep counters monotonic for the Room lifetime.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: PASS.

### Task 3: Adapt the core to PartyKit

**Files:**
- Create: `partykit.json`
- Create: `party/index.ts`
- Create: `party/index.test.ts`

- [ ] **Step 1: Configure the PartyKit entry point**

Set `main` to `party/index.ts`, use the project name, and keep hibernation disabled. Do not configure persistence or deployment credentials.

- [ ] **Step 2: Write failing adapter-boundary tests with small fake connections**

Instantiate the Party server with a minimal fake Room. Call `onConnect` using a request URL with `?name=Alex`, assert one serialized snapshot is sent, and decode it to assert `Alex#1` and Admin. Add a case for invalid `?name=Al!` that asserts the connection closes with application close code `4001`, a readable validation reason, and no snapshot.

- [ ] **Step 3: Run adapter tests and verify RED**

Run: `pnpm test:unit -- party/index.test.ts`

Expected: FAIL because the PartyKit adapter does not exist.

- [ ] **Step 4: Implement the minimal PartyKit lifecycle adapter**

Implement `Party.Server` with one `RoomCore` per PartyKit Room. In `onConnect`, parse `connection.uri`, read `name`, connect through the core, map `connection.id` to the core Participant ID, and send the serialized snapshot. In `onClose` and `onError`, remove the mapped participation exactly once. Reject invalid names with close code `4001` and the validator message. Do not accept client identity or Admin data.

- [ ] **Step 5: Run adapter and core tests and verify GREEN**

Run: `pnpm test:unit`

Expected: all tests PASS.

### Task 4: Build the browser connection lifecycle test-first

**Files:**
- Modify: `nuxt.config.ts`
- Create: `app/composables/useRoomConnection.ts`
- Create: `app/composables/useRoomConnection.test.ts`

- [ ] **Step 1: Add public runtime host configuration**

Expose `runtimeConfig.public.partyKitHost` from `NUXT_PUBLIC_PARTY_KIT_HOST`, defaulting locally to `127.0.0.1:1999`. The composable constructs `ws://` for localhost and `wss://` otherwise, with PartyKit's `/parties/main/<roomId>?name=<encoded name>` route.

- [ ] **Step 2: Write failing composable tests with an injected socket factory and timer scheduler**

Cover these state transitions:

```text
start -> joining -> snapshot -> connected
unexpected close -> reconnecting -> one new socket
second failure -> disconnected with terminal error
manual retry -> joining with a new socket
stop/unmount -> disconnected without a reconnect
```

Assert stale callbacks from an older socket cannot replace the active snapshot. Assert each new socket URL carries only Room ID and Chosen Name, never an earlier Participant ID.

- [ ] **Step 3: Run composable tests and verify RED**

Run: `pnpm test:unit -- app/composables/useRoomConnection.test.ts`

Expected: FAIL because the composable does not exist.

- [ ] **Step 4: Implement the explicit connection state machine**

Expose readonly `status`, `snapshot`, and `error`, plus `start`, `retry`, and `stop`. Maintain an attempt generation token to ignore stale events. Parse only valid shared server events; transition to connected only after a snapshot. After an unexpected failure, schedule exactly one automatic attempt using the injected/default fixed delay. A second failure becomes terminal. `retry()` resets the retry allowance and starts immediately. `stop()` clears timers, invalidates callbacks, and intentionally closes the current socket.

- [ ] **Step 5: Run composable and complete unit tests and verify GREEN**

Run: `pnpm test:unit`

Expected: all tests PASS without real timers or network access.

### Task 5: Replace the Room placeholder with the live experience

**Files:**
- Modify: `app/pages/rooms/[roomId].vue`
- Modify: `app/assets/css/main.css`
- Create: `tests/e2e/live-room.spec.ts`
- Create: `playwright.live.config.ts`

- [ ] **Step 1: Add a real local PartyKit Playwright project**

Keep the existing entry tests isolated in `playwright.config.ts`. Create a dedicated configuration selecting `live-room.spec.ts` whose web-server array starts PartyKit on `127.0.0.1:1999` and Nuxt on `127.0.0.1:3100` with the local public host configured.

- [ ] **Step 2: Write the failing first-Participant browser journey**

Open a direct valid Room URL in a fresh context and instrument WebSocket creation. Assert zero sockets before the Chosen Name gate is submitted. Enter `Alex`, then assert exactly one connection, visible `Connected`, authoritative `Alex#1`, an Admin badge, and an enabled Message composer. Also assert the joining state is accessible while the snapshot is pending and the participant-provided name is rendered as text.

- [ ] **Step 3: Run the live test and verify RED**

Run: `pnpm test:live`

Expected: FAIL because the Room page still renders “Ready to connect”.

- [ ] **Step 4: Wire the Room page to the composable**

Create the connection only when both the parsed UUID and remembered validated Chosen Name are present. Start it on client mount, stop it on unmount, and keep the existing invalid-route and direct-link gate branches unchanged. Render the status label, authoritative self Display Name, ordered snapshot Participants, and Admin badge. Render an initial Message textarea and Send button disabled unless connected. On terminal failure, render the error plus Retry and Return home actions.

- [ ] **Step 5: Style live status, Participant list, composer, and recovery actions**

Extend the existing Room card design with accessible status text, visible Admin badge, responsive list layout, disabled controls, and focus states. Keep all Participant values in Vue interpolation; do not add raw HTML rendering.

- [ ] **Step 6: Run live and existing browser tests and verify GREEN**

Run: `pnpm test:live`

Expected: PASS.

Run: `pnpm test:e2e`

Expected: all Ticket 01 entry-flow tests remain PASS.

### Task 6: Verify and resolve Ticket 02

**Files:**
- Modify: `.scratch/partykit-multiplayer-chat/issues/02-enter-live-room.md`

- [ ] **Step 1: Run the complete verification gate**

Run: `pnpm test:unit`

Expected: all unit tests PASS.

Run: `pnpm test:e2e`

Expected: all entry-flow browser tests PASS.

Run: `pnpm test:live`

Expected: the generated first-Participant journey against real local PartyKit PASS.

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm generate`

Expected: exit 0 with static output in `.output/public`.

- [ ] **Step 2: Review the diff against every Ticket 02 criterion**

Confirm no socket precedes the join gate, shared types cover every specified event family, the server assigns identity/ordering/Admin authoritatively, all four connection states exist, the composer is disconnected-safe, reconnect creates a new participation, and terminal failure has explicit recovery.

- [ ] **Step 3: Resolve the local tracker issue**

Check each acceptance box, change `Status` from `claimed` to `resolved`, and append a dated comment listing the verification evidence and implementation commit only after every required command succeeds.
