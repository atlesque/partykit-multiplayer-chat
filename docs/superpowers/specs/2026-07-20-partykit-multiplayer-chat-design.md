# PartyKit Multiplayer Chat MVP Design

## Goal

Build and deploy a demonstration chat application in which anonymous Participants create or join ephemeral Rooms and exchange real-time Messages. The frontend is a statically generated Nuxt 4 SPA. PartyKit provides one authoritative real-time server per Room, deployed in cloud-prem mode to the existing Cloudflare account.

The demo succeeds when multiple browser tabs can join the same Room, see the same ordered conversation and Participant List, observe deterministic Admin succession, and see a Room reset after its final Participant leaves.

## Scope

The MVP includes:

- Anonymous, unlisted Rooms addressed by UUID v4.
- Anonymous Participants with self-chosen names.
- Server-assigned unique Display Names.
- Real-time plain-text Messages and a bounded live history.
- A live Participant List and visible-only Admin role.
- System Notices for joins, leaves, and Admin succession.
- Client and server validation, room capacity, and message rate limiting.
- Local development, automated tests, and two Cloudflare deployments.

The MVP excludes accounts, authentication, invitations, passwords, moderation actions, private-room authorization, typing indicators, reactions, attachments, editing, deletion, read receipts, search, durable history, and offline delivery.

## Domain Rules

### Participant identity

One live browser-tab WebSocket connection is one Participant. A disconnect, refresh, or connection failure ends that participation. Reconnecting creates a new Participant at the back of the join order, even when the tab remembers and reuses the same Chosen Name.

The Chosen Name:

- Is entered by the Participant.
- Contains 3–20 ASCII letters or digits only.
- Is remembered only in that tab's `sessionStorage`.

The Room assigns a Display Name by adding an occurrence suffix to the Chosen Name. Every Display Name includes a suffix: `Alex#1`, `Alex#2`, and so on. Suffix counters are scoped to one Room lifetime and increase monotonically; suffixes are never reused while the Room exists.

### Room lifecycle

A Room is identified by a canonical lowercase UUID v4. The first Participant to connect starts the Room and becomes Admin. Any valid but inactive UUID starts a new Room rather than returning “not found.”

The Room exists only while at least one Participant is connected. When its final Participant leaves, its Messages, Participant state, suffix counters, join counters, and rate-limit state are cleared immediately. Returning to that UUID later starts a fresh Room.

Room state is in memory only. PartyKit hibernation is disabled, and the application uses no PartyKit storage or external database. If the PartyKit process terminates, its connections close and the Room ends under the same lifecycle rule.

Each Room allows at most 50 simultaneous Participants. An additional connection is rejected with a specific “Room is full” reason.

### Admin succession

Admin is a visible role without permissions. The earliest-connected current Participant is Admin. When the Admin leaves, the Participant with the lowest remaining join sequence becomes Admin. A System Notice announces the change and the Participant List is updated.

### Messages and notices

A Message:

- Is plain text only.
- Contains 1–500 Unicode code points after leading and trailing whitespace are removed.
- Is assigned an ID and timestamp by the PartyKit server.
- Is broadcast by the server before clients render it; clients do not optimistically append Messages.

The Room retains the latest 100 Messages in memory. A newly joined Participant receives that history with each Message's author Display Name and timestamp. The 101st Message evicts the oldest.

Each Participant may send at most five accepted Messages in any rolling ten-second window. Rejected attempts do not enter history or reach other Participants.

System Notices announce Participant joins, leaves, and Admin changes to current connections. They are transient, are not Messages, and are not included in retained history.

## User Experience

### Home page

The home page contains a Chosen Name field and two paths:

1. **Create Room** validates the name, generates a UUID v4 with `crypto.randomUUID()`, stores the Chosen Name in `sessionStorage`, and navigates to `/rooms/<uuid>`.
2. **Join Room** validates the name and accepts either a UUID or a full application Room URL. It extracts and normalizes the UUID, stores the Chosen Name, and navigates to the canonical Room URL.

Invalid input remains editable and receives an inline explanation.

### Direct Room links

Opening `/rooms/<uuid>` in a tab without a stored Chosen Name shows a join gate and does not open a WebSocket until a valid name is submitted. A tab with a remembered Chosen Name connects immediately. An invalid Room route offers a return to the home page rather than opening a connection.

### Room page

The Room page shows:

- The Room UUID and a copy-link control.
- Joining, connected, reconnecting, and disconnected status.
- The ordered conversation with Message author and locally formatted timestamp.
- Live System Notices visually distinct from Messages.
- A Participant List ordered by join sequence, with Admin first and badged.
- A plain-text composer with remaining-character feedback.

The composer is disabled unless connected. Server validation and rate-limit errors appear inline without erasing the draft.

## Architecture

The repository contains three clear modules:

1. **Nuxt application** — routing, forms, WebSocket client lifecycle, reactive Room state, and presentation.
2. **PartyKit adapter** — PartyKit lifecycle hooks, connection handling, protocol parsing, and broadcasts.
3. **Room core** — framework-independent state transitions and validation for Participants, Admin succession, naming, Messages, capacity, and rate limits.

Shared TypeScript protocol definitions form the boundary between the Nuxt client and PartyKit adapter. Neither side relies on untyped ad hoc payloads.

PartyKit maps each Room UUID to one isolated server backed by a Cloudflare Durable Object. The Room core remains authoritative for all state changes. The Nuxt client treats server snapshots and broadcasts as authoritative.

## Real-Time Protocol

All WebSocket payloads are discriminated JSON objects. The shared protocol module defines these wire shapes:

```ts
type ClientEvent =
  | { type: "message:send"; text: string };

type ParticipantView = {
  id: string;
  displayName: string;
  joinedAt: string;
};

type MessageView = {
  id: string;
  participantId: string;
  displayName: string;
  text: string;
  sentAt: string;
};

type ServerEvent =
  | {
      type: "room:snapshot";
      selfId: string;
      adminId: string;
      participants: ParticipantView[];
      messages: MessageView[];
    }
  | { type: "message:created"; message: MessageView }
  | {
      type: "system:notice";
      kind: "participant-joined" | "participant-left" | "admin-changed";
      text: string;
      occurredAt: string;
    }
  | {
      type: "room:presence";
      adminId: string;
      participants: ParticipantView[];
    }
  | {
      type: "error";
      code: "invalid-message" | "rate-limited";
      message: string;
    };
```

Timestamps are server-generated ISO 8601 strings. Participant IDs and Message IDs are opaque strings. The WebSocket URL carries the Chosen Name in a `name` query parameter.

The connection request carries the Chosen Name. On connection, the server validates the name, checks capacity, assigns the suffix and join sequence, assigns Admin if necessary, sends the snapshot, and broadcasts the new presence state.

On an orderly close or connection error, the server removes that Participant, reassigns Admin if necessary, broadcasts the resulting state, and clears all state if no connections remain.

Malformed JSON, binary payloads, unknown message types, and invalid fields are rejected without being broadcast and without crashing the Room.

## Validation and Security Boundary

Client validation provides immediate feedback; server validation is authoritative. The server enforces name rules, message type and length, room capacity, and rate limiting.

Vue renders all participant-provided content as text. The application never uses `v-html` for Chosen Names, Display Names, Messages, or System Notices.

Production PartyKit connections allow only the configured frontend origin. The PartyKit host is supplied to Nuxt through public runtime configuration.

Rooms are anonymous and unlisted. UUIDs reduce accidental discovery but are not credentials and provide no security guarantee. Admin has no privileged protocol operations.

## Build and Hosting

Nuxt runs with `ssr: false`. The frontend build command is `nuxt generate`, exposed as `pnpm generate`, and produces `.output/public`.

The generated directory is deployed separately through Cloudflare Workers Static Assets. Wrangler points its asset directory to `.output/public` and uses SPA not-found handling so direct Room URLs return the Nuxt shell. Generated output is not committed.

The PartyKit server is deployed separately in cloud-prem mode to the existing Cloudflare account. Account IDs, API tokens, and production hostnames are supplied through deployment configuration or environment variables and are never committed. Implementation and deployment should use the already configured Cloudflare plugin where it can safely discover account context or perform the requested operation, prompting before consequential account changes.

The README documents installation, local Nuxt and PartyKit development, test commands, `pnpm generate`, frontend deployment, PartyKit cloud-prem deployment, and required configuration.

## Error Handling

- Invalid home-page input remains on the page with a field-specific message.
- Invalid direct Room routes do not attempt a WebSocket connection.
- A full Room closes the attempted connection with a recognizable application close code and explanation.
- Recoverable Message validation and rate-limit errors leave the connection open and preserve the draft.
- Unexpected disconnects move the UI into reconnecting state. A successful reconnect creates a new Participant under the agreed connection-scoped identity model.
- A terminal connection failure disables the composer and offers an explicit retry or return-home action.

## Testing Strategy

### Unit tests

The Room core is unit-tested for:

- Chosen Name and Message validation.
- Monotonic duplicate-name suffixes beginning at `#1`.
- Join ordering and initial Admin assignment.
- Admin succession after orderly and erroneous disconnects.
- Room capacity.
- Rolling 100-Message retention.
- Five-per-ten-second rolling rate limiting.
- Complete cleanup after the final Participant leaves.

The PartyKit adapter is tested with mocked connections for protocol parsing, snapshots, targeted errors, and broadcasts. Nuxt composables and components are tested for input normalization, direct-link gating, session-scoped name recall, authoritative state updates, and connection/error states.

### End-to-end tests

Playwright uses multiple isolated browser contexts to verify:

- Creating a Room and joining by UUID or full URL.
- Duplicate Chosen Names receiving `#1`, `#2`, and non-reused later suffixes.
- Real-time Message delivery and late-join history.
- Live Participant List and Admin handoff.
- Refresh producing a new Participant at the back of the queue.
- Room capacity and message rate-limit feedback.
- The same UUID starting with empty state after all Participants leave.

Type-checking, unit tests, end-to-end tests, and `nuxt generate` must pass before deployment.

## Sources

- [PartyKit architecture and Room routing](https://docs.partykit.io/how-partykit-works/)
- [PartyKit deployment to a Cloudflare account](https://docs.partykit.io/guides/deploy-to-cloudflare/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
