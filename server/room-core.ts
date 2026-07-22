import { parseChosenName } from '../app/domain/chosen-name'
import type { Message, Participant, RoomSnapshot, ServerEvent } from '../shared/protocol'

export type PresenceState = Pick<RoomSnapshot, 'adminId' | 'participants'>
export type RoomNotice = Extract<ServerEvent, { type: 'notice' }>

export type ConnectedParticipant = {
  participant: Participant
  snapshot: RoomSnapshot
  presence: PresenceState
  notices: RoomNotice[]
}

export type DisconnectedParticipant = {
  presence: PresenceState
  notices: RoomNotice[]
}

export class RoomFullError extends Error {
  constructor() {
    super('Room is full')
    this.name = 'RoomFullError'
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('You can send at most 5 Messages every 10 seconds.')
    this.name = 'RateLimitError'
  }
}

const MAX_PARTICIPANTS = 50
const MAX_MESSAGES_PER_WINDOW = 5
const MESSAGE_WINDOW_MS = 10_000

export class RoomCore {
  readonly #createParticipantId: () => string
  readonly #createMessageId: () => string
  readonly #now: () => number
  readonly #participants = new Map<string, Participant>()
  readonly #suffixes = new Map<string, number>()
  readonly #messages: Message[] = []
  readonly #acceptedMessageTimes = new Map<string, number[]>()
  #nextJoinSequence = 0

  constructor(
    createParticipantId: () => string,
    createMessageId: () => string = () => crypto.randomUUID(),
    now: () => number = () => Date.now(),
  ) {
    this.#createParticipantId = createParticipantId
    this.#createMessageId = createMessageId
    this.#now = now
  }

  get participantCount(): number {
    return this.#participants.size
  }

  connect(input: string): ConnectedParticipant {
    const chosenName = parseChosenName(input)
    if (!chosenName.ok) {
      throw new Error(chosenName.message)
    }
    if (this.#participants.size >= MAX_PARTICIPANTS) {
      throw new RoomFullError()
    }

    const suffix = (this.#suffixes.get(chosenName.value) ?? 0) + 1
    this.#suffixes.set(chosenName.value, suffix)

    const hadParticipants = this.#participants.size > 0
    const participant: Participant = {
      id: this.#createParticipantId(),
      chosenName: chosenName.value,
      displayName: `${chosenName.value}#${suffix}`,
      joinSequence: ++this.#nextJoinSequence,
      isAdmin: this.#participants.size === 0,
    }
    this.#participants.set(participant.id, participant)
    const presence = this.#presence()

    return {
      participant: { ...presence.participants.find(current => current.id === participant.id)! },
      snapshot: {
        selfId: participant.id,
        ...presence,
        messages: this.#messages.map(message => ({ ...message })),
      },
      presence,
      notices: hadParticipants
        ? [{
            type: 'notice',
            kind: 'join',
            text: `${participant.displayName} joined the Room.`,
          }]
        : [],
    }
  }

  disconnect(participantId: string): DisconnectedParticipant | undefined {
    const participant = this.#participants.get(participantId)
    if (!participant) {
      return undefined
    }

    const wasAdmin = this.#presence().adminId === participantId
    this.#participants.delete(participantId)
    this.#acceptedMessageTimes.delete(participantId)
    const presence = this.#presence()
    const notices: RoomNotice[] = [{
      type: 'notice',
      kind: 'leave',
      text: `${participant.displayName} left the Room.`,
    }]
    if (wasAdmin && presence.participants.length > 0) {
      const admin = presence.participants[0]!
      notices.push({
        type: 'notice',
        kind: 'admin-change',
        text: `${admin.displayName} is now Admin.`,
      })
    }

    if (this.#participants.size === 0) {
      this.#suffixes.clear()
      this.#messages.length = 0
      this.#acceptedMessageTimes.clear()
      this.#nextJoinSequence = 0
    }

    return { presence, notices }
  }

  acceptMessage(participantId: string, input: string): Message {
    const participant = this.#participants.get(participantId)
    if (!participant) {
      throw new Error('Participant is not connected to this Room.')
    }

    const text = input.trim()
    if (!text) {
      throw new Error('Message must contain at least one non-whitespace character.')
    }
    if (Array.from(text).length > 500) {
      throw new Error('Message must contain at most 500 characters.')
    }

    const now = this.#now()
    const windowStart = now - MESSAGE_WINDOW_MS
    const acceptedTimes = (this.#acceptedMessageTimes.get(participantId) ?? [])
      .filter(timestamp => timestamp > windowStart)
    if (acceptedTimes.length >= MAX_MESSAGES_PER_WINDOW) {
      this.#acceptedMessageTimes.set(participantId, acceptedTimes)
      throw new RateLimitError()
    }
    acceptedTimes.push(now)
    this.#acceptedMessageTimes.set(participantId, acceptedTimes)

    const message: Message = {
      id: this.#createMessageId(),
      participantId,
      displayName: participant.displayName,
      text,
      timestamp: now,
    }
    this.#messages.push(message)
    if (this.#messages.length > 100) {
      this.#messages.shift()
    }
    return { ...message }
  }

  #presence(): PresenceState {
    const ordered = [...this.#participants.values()]
      .sort((left, right) => left.joinSequence - right.joinSequence)
    const adminId = ordered[0]?.id ?? ''
    const participants = ordered.map(participant => ({
      ...participant,
      isAdmin: participant.id === adminId,
    }))

    return { adminId, participants }
  }
}
