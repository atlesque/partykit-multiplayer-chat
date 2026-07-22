# 05 — Enforce public Room safety limits

**What to build:** Bound the work an anonymous public Room can accept and give Participants clear, recoverable feedback when they exceed those boundaries. Full Rooms, excessive Message rates, hostile protocol input, and unauthorized production origins must be rejected without corrupting state or disrupting valid Participants.

**Blocked by:** 04 — Exchange authoritative Messages with bounded history.

**Status:** resolved

- [x] A Room accepts at most 50 simultaneous Participants and rejects the next connection with the agreed application-specific close code and human-readable “Room is full” reason.
- [x] Each Participant may contribute at most five accepted Messages in any rolling ten-second window; further attempts receive a recoverable rate-limit error, keep the connection open, and preserve the draft.
- [x] Rejected Message attempts do not consume accepted-Message history or reach other Participants, and rate-limit state is isolated per Participant and cleared with the Room lifetime.
- [x] Malformed JSON, binary payloads, unknown event types, invalid fields, and client attempts to claim authoritative identity or Admin state are rejected without broadcast, Room failure, or state corruption.
- [x] Production WebSocket upgrades accept only the configured frontend origin, while local development remains explicitly configurable without committing an environment-specific hostname.
- [x] Time-dependent Room-core tests use an injected clock, comprehensively prove capacity and rolling rate limits, and do not sleep.
- [x] Targeted integration checks prove the capacity close reason, recoverable rate-limit feedback, hostile-input isolation, and production-origin rejection at the real adapter boundary.

## Comments

- 2026-07-22: Implemented Room capacity, rolling per-Participant Message limits, exact client-event validation, hostile-input isolation, and configured production-origin enforcement. Verified with 44 passing unit and adapter tests, 16 passing entry-flow Playwright tests, 3 passing real local PartyKit multi-browser tests, a clean Nuxt type-check, and successful static generation.
