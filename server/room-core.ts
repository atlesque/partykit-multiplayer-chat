import { parseChosenName } from '../app/domain/chosen-name'
import type { Participant, RoomSnapshot } from '../shared/protocol'

export type ConnectedParticipant = {
  participant: Participant
  snapshot: RoomSnapshot
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

    const participant: Participant = {
      id: this.#createParticipantId(),
      chosenName: chosenName.value,
      displayName: `${chosenName.value}#${suffix}`,
      joinSequence: ++this.#nextJoinSequence,
      isAdmin: this.#participants.size === 0,
    }
    this.#participants.set(participant.id, participant)

    return {
      participant: { ...participant },
      snapshot: this.#snapshotFor(participant.id),
    }
  }

  disconnect(participantId: string): void {
    this.#participants.delete(participantId)
  }

  #snapshotFor(selfId: string): RoomSnapshot {
    const ordered = [...this.#participants.values()]
      .sort((left, right) => left.joinSequence - right.joinSequence)
    const adminId = ordered[0]?.id ?? ''
    const participants = ordered.map(participant => ({
      ...participant,
      isAdmin: participant.id === adminId,
    }))

    return {
      selfId,
      adminId,
      participants,
      messages: [],
    }
  }
}
