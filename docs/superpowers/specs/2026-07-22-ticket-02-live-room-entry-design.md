# Ticket 02: Live Room Entry Design

## Scope

Connect a valid Room page to a real PartyKit Room and establish the first authoritative Participant. The work introduces the shared protocol, framework-independent Room core, PartyKit lifecycle adapter, browser connection lifecycle, and the initial connected Room presentation. Message exchange, multi-participant presence changes, Admin succession, and safety limits remain in later tickets.

## Architecture

The feature keeps four boundaries:

- `shared/protocol.ts` defines discriminated server-to-client and client-to-server event types for snapshots, presence, Messages, System Notices, and recoverable errors. Ticket 02 uses the snapshot and error variants, while later-ticket variants are typed now to prevent protocol drift.
- `server/room-core.ts` owns authoritative in-memory Room state independently of PartyKit. It validates Chosen Names, assigns opaque Participant IDs, allocates monotonic name suffixes and join sequence numbers, and selects the earliest current Participant as Admin.
- `party/index.ts` adapts PartyKit WebSocket lifecycle events to the Room core. It reads the `name` query parameter, connects a Participant, sends the authoritative initial snapshot, and removes the participation on close or error.
- `app/composables/useRoomConnection.ts` owns one browser WebSocket and exposes explicit connection state to the Room page. The page only renders state and invokes connection actions.

The PartyKit server is authoritative for identity, Display Name, join ordering, and Admin assignment. Browser state never supplies or restores an authoritative Participant identity.

## Shared Protocol

Protocol messages use a `type` discriminant. The initial snapshot contains:

- the receiving Participant's opaque ID;
- the current Admin ID;
- Participants in join order, each with ID, Chosen Name, Display Name, join sequence, and Admin status;
- an empty retained Message list for this ticket.

The shared contract also defines presence updates, authoritative Messages, transient System Notices, and recoverable error events needed by subsequent tickets. Runtime input remains narrow: the server accepts the Chosen Name only from the connection query and validates it with the same 3–20 ASCII-alphanumeric rule as the browser.

## Room Core

The Room core is a plain TypeScript class with no PartyKit or Vue imports. Connecting validates the Chosen Name, creates an opaque Participant ID through an injected ID factory, increments the chosen name's suffix counter and the Room join counter, and returns a snapshot. The first Participant receives `<Chosen Name>#1` and becomes Admin.

Disconnect removes the current participation. State needed by later tickets is modeled without implementing later behavior. Reconnecting never restores a removed Participant: every accepted WebSocket connection calls the normal connect operation and therefore receives a new ID, suffix, and join sequence.

## Browser Connection Lifecycle

The composable exposes `joining`, `connected`, `reconnecting`, and `disconnected` states plus the latest snapshot and terminal error. It opens no socket until the Room route is valid and the current tab has a valid remembered Chosen Name.

An unexpected loss starts one automatic reconnect after a short fixed delay. That attempt opens a new WebSocket and therefore creates a new participation. If the attempt also fails, the state becomes `disconnected` and the UI offers Retry and Return home. Manual Retry starts a fresh cycle with one connection attempt and, after a later unexpected loss, one automatic reconnect. Intentional teardown during navigation or component unmount closes the socket without scheduling a reconnect.

The Message composer is rendered as the initial shell for later work and remains disabled unless connection state is `connected`.

## Room Presentation

The existing direct-link join gate remains the only pre-connection entry point. Once a valid name exists, the Room page shows:

- a visible label for the current connection state;
- the connected Participant's authoritative Display Name;
- an Admin badge when the snapshot identifies them as Admin;
- the authoritative Participant list from the snapshot;
- a disabled composer outside the connected state;
- Retry and Return home actions after terminal failure.

Participant-provided values are rendered through Vue text interpolation only.

## Error Handling

An invalid Chosen Name is rejected authoritatively before the Room core changes state. The PartyKit adapter closes that connection with an application-specific close code and a readable reason. Protocol parse failures and hostile client messages are deferred to the dedicated public-safety ticket, but the adapter does not trust client identity or Admin claims because Ticket 02 defines no client event that can set either value.

Connection construction errors, pre-open socket failures, and a failed automatic reconnect all converge on the terminal disconnected presentation. Stale socket callbacks are ignored so an earlier attempt cannot overwrite a newer connection's state.

## Testing

Room-core unit tests are written first and prove:

- invalid Chosen Names are rejected without adding a Participant;
- the first valid Participant receives suffix `#1`;
- join sequence values are monotonic;
- the first current Participant is Admin in the authoritative snapshot;
- reconnecting through a new core connection creates a distinct participation.

A real local PartyKit and Playwright test then proves the browser journey: no WebSocket before completing the direct-link name gate, one connection after entry, an authoritative `#1` Display Name and Admin badge, connected composer behavior, and the explicit connection-state UI. Existing entry-flow browser tests continue to pass.

The release check for this ticket runs focused core tests, the complete Playwright suite against local Nuxt and PartyKit servers, Nuxt type-checking, and static generation.
