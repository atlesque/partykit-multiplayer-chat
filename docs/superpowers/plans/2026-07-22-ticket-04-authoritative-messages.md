# Ticket 04 Authoritative Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let connected Participants exchange server-confirmed plain-text Messages with recoverable validation and a rolling 100-Message Room history.

**Architecture:** Extend the framework-independent `RoomCore` to own Message validation, IDs, timestamps, and bounded history. Keep PartyKit as the transport adapter that parses client events and broadcasts authoritative results, while `useRoomConnection` owns client protocol state and the Room page owns draft/error presentation.

**Tech Stack:** TypeScript, Vue 3/Nuxt 4, PartyKit, Vitest, Playwright

---

### Task 1: Authoritative Message core

**Files:**
- Modify: `server/room-core.test.ts`
- Modify: `server/room-core.ts`

- [ ] **Step 1: Write failing tests** for trimmed acceptance, authoritative author/ID/timestamp fields, Unicode code-point length, whitespace and over-limit rejection, rolling 100-Message history, and final-leave history reset.
- [ ] **Step 2: Run `pnpm vitest run server/room-core.test.ts`** and confirm the new tests fail because `acceptMessage` and retained history do not exist.
- [ ] **Step 3: Implement `RoomCore.acceptMessage(participantId, text)`** using injected ID and clock dependencies, `Array.from(text).length` for code points, and an in-memory history capped at 100 entries; include retained Messages in snapshots and clear them on final disconnect.
- [ ] **Step 4: Run `pnpm vitest run server/room-core.test.ts`** and confirm all Room-core tests pass.

### Task 2: PartyKit client-event adapter

**Files:**
- Modify: `party/index.test.ts`
- Modify: `party/index.ts`

- [ ] **Step 1: Write failing adapter tests** proving a `send-message` event broadcasts the server-created Message to every current connection and an invalid Message returns a recoverable error only to its sender.
- [ ] **Step 2: Run `pnpm vitest run party/index.test.ts`** and confirm failure because `onMessage` is absent.
- [ ] **Step 3: Implement `onMessage`** to parse text WebSocket payloads, accept only `{ type: 'send-message', text: string }`, delegate to `RoomCore`, broadcast accepted Messages, and send recoverable validation errors without closing the connection.
- [ ] **Step 4: Run `pnpm vitest run party/index.test.ts`** and confirm all adapter tests pass.

### Task 3: Client protocol state and composer

**Files:**
- Modify: `app/composables/useRoomConnection.test.ts`
- Modify: `app/composables/useRoomConnection.ts`
- Modify: `app/pages/rooms/[roomId].vue`
- Modify: `app/assets/css/main.css`

- [ ] **Step 1: Write failing composable tests** proving `sendMessage` serializes a client event, accepted Message events append to authoritative snapshot history, and recoverable Message errors are exposed without disconnecting.
- [ ] **Step 2: Run `pnpm vitest run app/composables/useRoomConnection.test.ts`** and confirm failure because sending and Message/error handling are absent.
- [ ] **Step 3: Extend the socket interface and parser** with `send`, validated Message/error events, `messageError`, and `sendMessage`; clear only the matching accepted draft in the page, preserve rejected drafts, render messages with interpolation, show timestamps and a code-point counter, and retain disconnected controls.
- [ ] **Step 4: Run `pnpm vitest run app/composables/useRoomConnection.test.ts`** and confirm all composable tests pass.

### Task 4: Real multi-browser proof

**Files:**
- Modify: `tests/e2e/live-room.spec.ts`

- [ ] **Step 1: Write failing Playwright coverage** for two-browser authoritative delivery, whitespace/over-limit draft preservation, safe HTML-like text rendering, and late-join retained history.
- [ ] **Step 2: Run `pnpm test:live`** and confirm the new scenario fails before the UI/adapter path is complete.
- [ ] **Step 3: Make only integration corrections required by the failing scenario.**
- [ ] **Step 4: Run `pnpm test:live`** and confirm all live Room scenarios pass.

### Task 5: Verification, tracker, and delivery

**Files:**
- Modify: `.scratch/partykit-multiplayer-chat/issues/04-authoritative-messages.md`

- [ ] **Step 1: Run `pnpm test:unit`, `pnpm test:e2e`, `pnpm test:live`, `pnpm typecheck`, and `pnpm generate`** and require zero failures.
- [ ] **Step 2: Review every Ticket 04 acceptance criterion** against code and tests, mark the checklist resolved, and append verification evidence under Comments.
- [ ] **Step 3: Review `git diff`, commit the scoped changes, pull `master` safely if needed, and push `master` to its configured remote.**
