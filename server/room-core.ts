import { parseChosenName } from '../app/domain/chosen-name'
import type { Participant, RoomSnapshot, ServerEvent } from '../shared/protocol'

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

export class RoomCore {
  readonly #createParticipantId: () => string
  readonly #participants = new Map<string, Participant>()
  readonly #suffixes = new Map<string, number>()
  #nextJoinSequence = 0

  constructor(createParticipantId: () => string) {
    this.#createParticipantId = createParticipantId
  }

  get participantCount(): number {
    return this.#participants.size
  }

  connect(input: string): ConnectedParticipant {
    const chosenName = parseChosenName(input)
    if (!chosenName.ok) {
      throw new Error(chosenName.message)
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
        messages: [],
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
      this.#nextJoinSequence = 0
    }

    return { presence, notices }
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
