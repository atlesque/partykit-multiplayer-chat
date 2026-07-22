# Ticket 03 Live Participation and Admin Succession Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every Room client synchronized with authoritative presence, deterministic Admin succession, and a short transient activity feed across joins, departures, refreshes, and Room lifetime reset.

**Architecture:** Extend the framework-independent `RoomCore` to return immutable join and departure transitions, and let the PartyKit adapter broadcast those transitions without re-deriving domain rules. Reduce typed snapshot, presence, and notice events in the Vue composable; render a bounded chronological feed in the Room page.

**Tech Stack:** Node.js 24, pnpm, Nuxt 4, Vue 3, TypeScript, PartyKit, Vitest, Playwright

---

### Task 1: Define authoritative Room transitions

**Files:**
- Modify: `server/room-core.test.ts`
- Modify: `server/room-core.ts`

- [ ] **Step 1: Write failing join-transition tests**

Add tests that connect `Alex`, then another `Alex`, and assert the second result contains `Alex#2`, join sequence `2`, ordered presence with the first Participant as Admin, and a join notice for `Alex#2`. Assert the first result has an empty notice list because no existing client can receive it.

```ts
expect(first.notices).toEqual([])
expect(second.presence.participants.map(p => p.displayName)).toEqual(['Alex#1', 'Alex#2'])
expect(second.presence.adminId).toBe('participant-1')
expect(second.notices).toEqual([{ type: 'notice', kind: 'join', text: 'Alex#2 joined the Room.' }])
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: FAIL because connect results do not expose `presence` or `notices`.

- [ ] **Step 3: Implement immutable join transitions**

Add exported `PresenceState`, `RoomNotice`, and expanded `ConnectedParticipant` types. Build one ordered presence projection that recomputes `isAdmin`; return it in both the snapshot and `presence`. Return a join notice only when the Room already contained a Participant.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: all Room-core tests PASS.

- [ ] **Step 5: Write failing departure and lifetime tests**

Add separate tests for a non-Admin departure, Admin departure, unknown/idempotent departure, monotonic suffix after a departure, and final-leave reset. The Admin case must assert ordered distinct notices:

```ts
expect(transition?.presence.adminId).toBe('participant-2')
expect(transition?.notices).toEqual([
  { type: 'notice', kind: 'leave', text: 'Alex#1 left the Room.' },
  { type: 'notice', kind: 'admin-change', text: 'Blair#1 is now Admin.' },
])
expect(room.disconnect(first.participant.id)).toBeUndefined()
```

- [ ] **Step 6: Run the focused test and verify RED**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: FAIL because `disconnect` returns no transition.

- [ ] **Step 7: Implement idempotent departure transitions**

Look up the departing Participant before deletion, determine whether they were Admin, delete them, build remaining presence, and return leave plus optional Admin-change notices. Return `undefined` for unknown IDs. When the Room becomes empty, return the transition and clear suffix/join state before returning.

- [ ] **Step 8: Run the focused and full unit suites**

Run: `pnpm test:unit -- server/room-core.test.ts`

Expected: Room-core tests PASS.

Run: `pnpm test:unit`

Expected: all existing unit tests PASS.

### Task 2: Broadcast presence and transient notices through PartyKit

**Files:**
- Modify: `party/index.test.ts`
- Modify: `party/index.ts`

- [ ] **Step 1: Expand the fake connection harness and write failing join tests**

Generate unique fake connection IDs and add a decoder for each connection's sent events. Connect `Alex` and `Alex` to one server. Assert the first receives its snapshot followed by presence and join notice, while the second receives only its snapshot and therefore no historical/self join notice.

```ts
expect(events(first).map(event => event.type)).toEqual(['snapshot', 'presence', 'notice'])
expect(events(second).map(event => event.type)).toEqual(['snapshot'])
expect(events(second)[0]).toMatchObject({ participants: [
  { displayName: 'Alex#1', isAdmin: true },
  { displayName: 'Alex#2', isAdmin: false },
] })
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `pnpm test:unit -- party/index.test.ts`

Expected: FAIL because the adapter retains no connection objects and broadcasts nothing.

- [ ] **Step 3: Implement join recipient selection**

Store active `Party.Connection` objects by connection ID. Capture existing connections before calling `core.connect`, send the new snapshot to the joining connection, then send serialized presence and notice events only to the captured existing connections. Add the active connection only after a successful core connect.

- [ ] **Step 4: Run adapter tests and verify GREEN**

Run: `pnpm test:unit -- party/index.test.ts`

Expected: adapter join tests PASS.

- [ ] **Step 5: Write failing close/error succession tests**

Connect three clients, close the Admin, and assert each remaining client receives presence, leave, and Admin-change events with the second Participant promoted. Invoke `onError` after `onClose` for the same connection and assert no extra events. Add a non-Admin close case with no Admin-change notice.

- [ ] **Step 6: Run adapter tests and verify RED**

Run: `pnpm test:unit -- party/index.test.ts`

Expected: FAIL because disconnect transitions are not broadcast.

- [ ] **Step 7: Implement departure broadcasts**

Remove both connection and Participant mappings before calling the core so duplicate lifecycle callbacks are inert. Serialize the returned presence followed by notices to every remaining active connection. Send nothing when the core returns `undefined` or no recipients remain.

- [ ] **Step 8: Run all unit tests**

Run: `pnpm test:unit`

Expected: all unit tests PASS.

### Task 3: Reduce live events into client state and bounded activity

**Files:**
- Modify: `app/composables/useRoomConnection.test.ts`
- Modify: `app/composables/useRoomConnection.ts`

- [ ] **Step 1: Write failing presence reducer tests**

After a valid snapshot, send a presence event with two ordered Participants and a new Admin. Assert `snapshot.selfId` and `messages` remain unchanged while `participants` and `adminId` are replaced. Send malformed presence variants (unknown Admin, duplicate IDs, unordered join sequence) and assert state is unchanged.

- [ ] **Step 2: Run the composable tests and verify RED**

Run: `pnpm test:unit -- app/composables/useRoomConnection.test.ts`

Expected: FAIL because non-snapshot events are ignored.

- [ ] **Step 3: Implement strict server-event parsing and presence reduction**

Replace the snapshot-only parser with a parser for snapshot, presence, and notice variants. Validate unique IDs, ascending positive join sequences, exactly one Admin whose ID matches `adminId`, and snapshot `selfId` membership. On presence, create a new snapshot object preserving `selfId` and `messages`.

- [ ] **Step 4: Run the composable tests and verify GREEN**

Run: `pnpm test:unit -- app/composables/useRoomConnection.test.ts`

Expected: presence reducer tests PASS.

- [ ] **Step 5: Write failing notice feed tests**

Assert valid notices append chronologically, the 21st notice evicts the first, malformed kinds/text are ignored, and `start`, manual `retry`, and an automatic reconnect clear prior activity.

```ts
expect(connection.activity.value.map(notice => notice.text)).toEqual([
  'Blair#1 joined the Room.',
  'Alex#1 left the Room.',
])
expect(connection.activity.value).toHaveLength(20)
```

- [ ] **Step 6: Run the composable tests and verify RED**

Run: `pnpm test:unit -- app/composables/useRoomConnection.test.ts`

Expected: FAIL because the composable exposes no activity feed.

- [ ] **Step 7: Implement the 20-item transient feed**

Add `activity = ref<RoomNotice[]>([])`, expose it read-only, append cloned valid notices, and retain only the latest 20. Clear it when starting any new socket participation, including automatic reconnect and manual retry, without adding notices to `snapshot.messages`.

- [ ] **Step 8: Run all unit tests**

Run: `pnpm test:unit`

Expected: all unit tests PASS.

### Task 4: Present live activity and multi-participant state

**Files:**
- Modify: `app/pages/rooms/[roomId].vue`
- Modify: `app/assets/css/main.css`
- Modify: `tests/e2e/live-room.spec.ts`

- [ ] **Step 1: Write the failing multi-browser journey**

Use isolated browser contexts in one UUID. Join two Participants named `Alex`; assert both pages show `Alex#1`, `Alex#2` in order and only `Alex#1` badged Admin. Assert the first page's activity feed reports `Alex#2 joined`, while the late joiner's feed does not replay it.

- [ ] **Step 2: Add failing succession, refresh, and reset assertions**

Close the first context and assert the second shows only `Alex#2` as Admin plus distinct leave/admin notices. Refresh/re-enter a Participant and assert it appears last with a new suffix. Close every context, open the same UUID in a fresh context, and assert `Alex#1`, join sequence reset through ordering, empty activity, and fresh Admin assignment.

- [ ] **Step 3: Run the live suite and verify RED**

Run: `pnpm test:live`

Expected: FAIL because presence events are not yet rendered and no activity feed exists.

- [ ] **Step 4: Render the short chronological activity feed**

Read `roomConnection.activity` through a computed value. Beneath the Participant panel, render an `Activity` section only when entries exist, with an ordered/list structure, `aria-live="polite"`, and notice-kind data attributes. Keep Display Names and notice text in Vue interpolation; add no `v-html` or Admin controls.

- [ ] **Step 5: Style the activity feed**

Add a quiet bordered activity panel, compact chronological rows, and differentiated join/leave/admin-change markers that fit the existing Room card at desktop and mobile widths.

- [ ] **Step 6: Run live tests and refine only deterministic browser behavior**

Run: `pnpm test:live`

Expected: all live PartyKit tests PASS. Use Playwright polling/visibility assertions for asynchronous presence; do not add sleeps. If abrupt-loss simulation is reliable through the available browser API, add it as a separate test using the same expected succession; otherwise retain the orderly close proof and core/adapter coverage.

- [ ] **Step 7: Run existing entry-flow tests**

Run: `pnpm test:e2e`

Expected: all Ticket 01 entry-flow tests PASS.

### Task 5: Verify and resolve Ticket 03

**Files:**
- Modify: `.scratch/partykit-multiplayer-chat/issues/03-live-participation-admin-succession.md`

- [ ] **Step 1: Run the complete verification gate**

Run each command independently and require exit code 0:

```bash
pnpm test:unit
pnpm test:e2e
pnpm test:live
pnpm typecheck
pnpm generate
```

- [ ] **Step 2: Review the diff against every acceptance criterion**

Confirm authoritative ordered presence, monotonic duplicate suffixes, refresh/reconnect ordering, earliest-current Admin succession, distinct non-replayed notices, idempotent orderly/error departure handling, final-leave state reset, no Admin operations, and strict text rendering.

- [ ] **Step 3: Resolve the local tracker issue**

Only after every gate succeeds, check all Ticket 03 acceptance boxes, change `Status: claimed` to `Status: resolved`, and append a dated comment listing test counts and the implementation commit(s).

- [ ] **Step 4: Commit the implementation**

Stage only Ticket 03 files and commit with an intentional message such as `feat: add live participation succession`. Do not stage unrelated untracked workspace files.
