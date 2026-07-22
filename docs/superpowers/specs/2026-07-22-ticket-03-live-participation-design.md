# Ticket 03: Live Participation and Admin Succession Design

## Scope

Extend the live Room so every connected client sees authoritative Participants in join order, deterministic Admin succession, and transient activity notices. The work covers duplicate-name allocation, refresh and reconnect ordering, orderly and abrupt departure, and complete in-memory reset after the final Participant leaves. Message exchange and public safety limits remain in Tickets 04 and 05.

## Architecture

The existing boundaries remain intact:

- `server/room-core.ts` owns all participation state and returns immutable transition results for joins and departures.
- `party/index.ts` maps PartyKit connections to authoritative Participant IDs and broadcasts transition events.
- `shared/protocol.ts` remains the typed wire contract for snapshots, presence, and transient System Notices.
- `app/composables/useRoomConnection.ts` reduces server events into current authoritative Room state and a bounded transient activity feed.
- `app/pages/rooms/[roomId].vue` presents Participants, Admin status, connection state, and recent activity without adding Admin-only operations.

The Room core does not know about WebSockets, and the adapter does not derive domain transitions by comparing snapshots. This keeps name suffixes, ordering, succession, and lifetime reset deterministic at the framework-independent seam.

## Room Transitions

`RoomCore.connect()` continues to validate and allocate the Participant, but its result also describes the authoritative presence state and transient notices caused by the join. The joining client receives one snapshot. Clients that were already present receive the resulting presence update and a join notice. Creating the first participation establishes Admin state in the snapshot without sending the new Participant a replay-like notice.

`RoomCore.disconnect()` is idempotent. An unknown Participant ID returns no transition. Removing a current Participant returns the updated presence state, a leave notice, and—when the departing Participant was Admin and someone remains—an Admin-change notice naming the successor. The final departure produces no recipient broadcasts and resets suffix counters, join counters, retained Messages, rate-limit state, and Admin state after the transition has been determined.

Participants are always ordered by increasing join sequence. The current Participant with the lowest join sequence is Admin. Every occurrence of a Chosen Name receives the next suffix for that name during the Room lifetime, including after a prior occurrence leaves. Refresh and reconnect are ordinary disconnect/connect pairs, so the new participation receives a new ID, suffix, and position at the back of the order.

## PartyKit Broadcast Semantics

The adapter keeps active connection objects alongside its existing connection-to-Participant mapping. On connect it captures the connections that were already present, creates the authoritative participation, sends only the snapshot to the joining connection, then sends presence and join notices to the pre-existing connections. This ordering prevents the joiner from receiving its own join notice and ensures it cannot receive notices from before its snapshot.

On close or error the adapter removes the connection mapping exactly once, asks the core for the departure transition, and sends the resulting presence, leave, and optional Admin-change events to every remaining connection. Duplicate lifecycle callbacks and unknown connections produce no events.

System Notices remain transient wire events. They are never placed in `RoomSnapshot.messages`, retained by the core, or replayed to a late joiner.

## Browser State and Presentation

The Room connection composable parses snapshot, presence, and notice events. A snapshot replaces the authoritative identity, Participant list, Admin ID, and retained Messages. A presence event replaces only the current Participant list and Admin ID while preserving self identity and retained Messages. Invalid or structurally inconsistent events are ignored.

Notice events append to an in-memory first-in, first-out activity feed capped at 20 entries. The feed is cleared when `start()` or manual `retry()` begins a fresh connection cycle and is not reconstructed from a snapshot. Automatic reconnect also begins a new authoritative participation and clears stale activity so notices from the prior participation are not presented as current context.

The Room page renders the feed chronologically beneath the Participant list using a polite live region. Participant Display Names and notice text use Vue interpolation only. Admin remains a visible badge with no privileged buttons or protocol operations.

## Error and Edge-Case Handling

- Duplicate close and error callbacks cannot remove or announce the same Participant twice.
- An unknown disconnect leaves Room state unchanged and produces no notice.
- A non-Admin departure does not generate an Admin-change notice.
- An Admin departure generates one presence update followed by distinct leave and Admin-change notices.
- A late joiner receives its current snapshot but no historical System Notices.
- The final departure resets the Room lifetime even though no clients remain to receive its transition.
- Stale socket callbacks remain guarded by the composable's generation token and cannot mutate the new participation.

## Testing

Tests follow red-green-refactor at four seams:

1. Room-core tests prove duplicate-name suffixes, join ordering, authoritative presence transitions, Admin succession, idempotent departure, and same-UUID lifetime reset.
2. PartyKit adapter tests use multiple fake connections to prove recipient selection, event order, distinct notices, and close/error idempotency.
3. Composable tests prove presence reduction, bounded chronological activity, clearing across reconnection, and rejection of malformed events.
4. A real local PartyKit multi-browser test proves duplicate names, ordered presence on both clients, Admin handoff after orderly close, refresh placement at the back, no notice replay for late joiners, and a fresh `#1` Admin after everyone leaves and the same UUID is reused. Abrupt loss is exercised when Playwright can trigger it reliably without making the suite timing-dependent.

The completion gate runs all unit tests, entry-flow browser tests, live PartyKit browser tests, Nuxt type-checking, and static generation before Ticket 03 is resolved.
