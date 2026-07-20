# Multiplayer Chat

This context describes temporary shared conversations and the people currently present in them.

## Language

**Room**:
An ephemeral shared conversation identified by a UUID and existing only while at least one Participant is connected. After its final Participant leaves, revisiting the UUID starts a new Room.
_Avoid_: Channel, group, server

**Participant**:
A person represented by one live browser-tab connection to a Room. Refreshing or disconnecting ends that participation; reconnecting creates a new Participant.
_Avoid_: User, member, account

**Chosen Name**:
A Participant's self-chosen, anonymous name, composed only of letters and digits.
_Avoid_: Username, base name, account name

**Display Name**:
The unique label a Room assigns to a Participant by appending an occurrence suffix to the Chosen Name, including `#1` for its first use.
_Avoid_: Chosen Name, username, account name

**Message**:
A text contribution authored by one Participant within the lifetime of a Room.
_Avoid_: Post, comment, event

**System Notice**:
A transient Room announcement about a Participant joining, leaving, or becoming Admin. It is not a Message and is not part of conversation history.
_Avoid_: Message, notification

**Admin**:
The currently designated Participant in a Room, shown as a visible role without special permissions.
_Avoid_: Owner, moderator, host
