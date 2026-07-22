# Ticket 05 Room Safety Limits Design

## Goal

Bound the work accepted by each anonymous Room while keeping all rejections isolated, deterministic, and understandable to the affected Participant.

## Architecture

`RoomCore` owns capacity and rolling rate-limit policy because these rules affect authoritative Room state and benefit from deterministic clock-driven tests. It exposes typed domain errors for a full Room and a rate-limited Participant so the PartyKit adapter does not infer behavior from error text.

The PartyKit adapter owns transport trust boundaries. It validates the WebSocket origin before connecting, accepts only the exact client message shape, ignores malformed or binary input, translates capacity into close code `4002` with reason `Room is full`, and translates rate limiting into a recoverable `rate-limited` server event. Existing message validation continues to use `invalid-message`.

## Core rules

- The 51st simultaneous connection is rejected before suffixes, identifiers, or join counters are consumed.
- Each Participant may have five accepted Messages whose timestamps fall strictly within the preceding 10,000 milliseconds.
- At exactly 10,000 milliseconds, the oldest acceptance no longer counts.
- Invalid or rejected Messages never consume a rate-limit slot or enter history.
- Rate-limit state is per Participant, removed on departure, and cleared with the final Room cleanup.
- A production host requires `FRONTEND_ORIGIN` and an exact request `Origin` match. An unconfigured origin is permitted only when the PartyKit request itself targets localhost, keeping local development usable without committed hostnames.

## Testing

Clock-injected Room-core tests prove capacity, rolling-window boundaries, invalid-attempt accounting, participant isolation, and cleanup without sleeping. Adapter tests prove capacity close behavior, recoverable rate-limit events, exact payload validation, hostile-input isolation, and origin enforcement. The full release gate remains unit tests, browser tests, live PartyKit tests, type-checking, and static generation.

