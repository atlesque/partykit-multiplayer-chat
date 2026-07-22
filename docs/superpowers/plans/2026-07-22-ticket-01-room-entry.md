# Ticket 01 Room Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Nuxt 4 SPA entry journey for choosing a tab-scoped name and creating, joining, or directly opening a canonical Room URL without opening a WebSocket.

**Architecture:** Keep domain parsing in small framework-independent TypeScript modules, keep browser storage behind one composable, and let the two Nuxt pages orchestrate navigation and validation. Playwright drives the generated user behavior at the browser seam; Ticket 02 will add the WebSocket lifecycle behind the already-established Room route.

**Tech Stack:** Node.js 24, pnpm, Nuxt 4, Vue 3, TypeScript, Playwright

---

### Task 1: Establish the Nuxt and Playwright baseline

**Files:**
- Create: `package.json`
- Create: `nuxt.config.ts`
- Create: `tsconfig.json`
- Create: `app/app.vue`
- Create: `app/pages/index.vue`
- Create: `app/assets/css/main.css`
- Create: `playwright.config.ts`
- Create: `tests/e2e/home.spec.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Define a minimal Nuxt 4 package with `dev`, `generate`, `typecheck`, and Playwright scripts**

Use Nuxt 4 with SSR disabled and Playwright as the only initial test runner. Ignore generated output, Nuxt state, dependencies, and Playwright artifacts.

- [ ] **Step 2: Write the first failing browser test**

Create a test that opens `/` and expects the heading “Start a temporary Room”, a Chosen Name field, a Create Room action, a Room link field, and a Join Room action.

- [ ] **Step 3: Run the test and verify RED**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts`

Expected: FAIL because the home page does not exist yet.

- [ ] **Step 4: Add the minimal Nuxt shell and home-page placeholder**

Add `<NuxtPage />`, global CSS, and only enough home-page markup to make the first browser test pass.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts`

Expected: PASS.

### Task 2: Validate and remember the Chosen Name

**Files:**
- Create: `app/domain/chosen-name.ts`
- Create: `app/composables/useChosenName.ts`
- Modify: `app/pages/index.vue`
- Modify: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Write failing browser cases for invalid and remembered Chosen Names**

Cover fewer than 3 characters, more than 20 characters, punctuation, editable invalid input, successful storage under one stable key, recall after same-tab navigation, and absence in a newly opened tab.

- [ ] **Step 2: Run the focused cases and verify RED**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts -g "Chosen Name"`

Expected: FAIL because validation and storage are absent.

- [ ] **Step 3: Implement the minimal name boundary**

Expose a validator returning either `{ ok: true, value }` or `{ ok: false, message }`. Accept exactly 3–20 ASCII letters or digits without silently changing the submitted value. Wrap `sessionStorage` access in a composable that loads only on the client and writes only validated names.

- [ ] **Step 4: Run the focused cases and verify GREEN**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts -g "Chosen Name"`

Expected: PASS.

### Task 3: Create a canonical Room

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Write a failing create-flow browser test**

Submit a valid Chosen Name, expect browser-generated lowercase UUID v4 navigation to `/rooms/<uuid>`, and assert that the same tab retains the name.

- [ ] **Step 2: Run the create case and verify RED**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts -g "creates a Room"`

Expected: FAIL because Create Room does not navigate.

- [ ] **Step 3: Implement the minimal create flow**

Validate the name, persist it, call `crypto.randomUUID()`, lowercase the result, and navigate to the canonical Room route.

- [ ] **Step 4: Run the create case and verify GREEN**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts -g "creates a Room"`

Expected: PASS.

### Task 4: Normalize join targets

**Files:**
- Create: `app/domain/room-target.ts`
- Modify: `app/pages/index.vue`
- Modify: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Write failing join-flow browser cases**

Cover lowercase and uppercase UUID input, a full same-origin Room URL, a non-v4 UUID, a foreign origin, unrelated paths, and preservation of invalid input with an inline explanation.

- [ ] **Step 2: Run the join cases and verify RED**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts -g "join"`

Expected: FAIL because target normalization is absent.

- [ ] **Step 3: Implement the target parser and join flow**

Accept a UUID v4 or a same-origin `/rooms/<uuid>` URL with an optional trailing slash. Normalize the UUID to lowercase, reject all other origins and paths, validate and store the Chosen Name, then navigate to the canonical route. Return a stable inline error without clearing either field.

- [ ] **Step 4: Run the join cases and verify GREEN**

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts -g "join"`

Expected: PASS.

### Task 5: Gate direct Room links

**Files:**
- Create: `app/pages/rooms/[roomId].vue`
- Create: `tests/e2e/room-entry.spec.ts`

- [ ] **Step 1: Write failing direct-link browser cases**

Cover an empty tab showing a gate, invalid gate input remaining editable, valid submission storing the name and revealing the ready state, remembered same-tab names bypassing the gate, invalid Room IDs offering a return-home action, and no WebSocket construction during any Ticket 01 journey.

- [ ] **Step 2: Run the direct-link cases and verify RED**

Run: `pnpm test:e2e -- tests/e2e/room-entry.spec.ts`

Expected: FAIL because the Room page does not exist.

- [ ] **Step 3: Implement the minimal Room entry page**

Validate the route UUID v4 before reading the stored name. For invalid routes, render only explanatory recovery UI. For valid routes, show the Chosen Name gate until a valid name is stored, then show the canonical Room identity and a “Ready to connect” state without constructing a WebSocket.

- [ ] **Step 4: Run the direct-link cases and verify GREEN**

Run: `pnpm test:e2e -- tests/e2e/room-entry.spec.ts`

Expected: PASS.

### Task 6: Verify and close Ticket 01

**Files:**
- Modify: `.scratch/partykit-multiplayer-chat/issues/01-create-or-join-room.md` in the primary checkout after implementation is verified

- [ ] **Step 1: Run the complete browser suite**

Run: `pnpm test:e2e`

Expected: all tests PASS with no browser console errors.

- [ ] **Step 2: Run static and type verification**

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm generate`

Expected: exit 0 with static output in `.output/public`.

- [ ] **Step 3: Review the diff against every Ticket 01 acceptance criterion**

Confirm browser coverage for create, UUID join, full-URL join, validation, same-tab recall, new-tab absence, direct-link gating, invalid-route recovery, and absence of WebSocket activity.

- [ ] **Step 4: Mark the local tracker ticket resolved**

Check all acceptance boxes and change its status from `ready-for-agent` to `resolved` only after every verification command succeeds.
