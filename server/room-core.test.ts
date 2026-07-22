import { describe, expect, it } from 'vitest'
import { RoomCore } from './room-core'

function createRoom() {
  let nextId = 0
  return new RoomCore(() => `participant-${++nextId}`)
}

describe('RoomCore', () => {
  it('rejects an invalid Chosen Name without changing Room state', () => {
    const room = createRoom()

    expect(() => room.connect('Al!')).toThrow(
      'Chosen Name must contain 3–20 ASCII letters or digits.',
    )
    expect(room.participantCount).toBe(0)
  })

  it('assigns the first Participant suffix #1, first join order, and Admin', () => {
    const room = createRoom()

    const first = room.connect('Alex')

    expect(first.participant).toMatchObject({
      id: 'participant-1',
      chosenName: 'Alex',
      displayName: 'Alex#1',
      joinSequence: 1,
      isAdmin: true,
    })
    expect(first.snapshot).toMatchObject({
      selfId: 'participant-1',
      adminId: 'participant-1',
      messages: [],
    })
    expect(first.snapshot.participants).toEqual([first.participant])
  })

  it('allocates monotonic join order to later Participants', () => {
    const room = createRoom()

    room.connect('Alex')
    const second = room.connect('Blair')

    expect(second.participant.joinSequence).toBe(2)
    expect(second.snapshot.participants.map(participant => participant.id)).toEqual([
      'participant-1',
      'participant-2',
    ])
    expect(second.snapshot.adminId).toBe('participant-1')
  })

  it('creates a distinct later participation after disconnect and reconnect', () => {
    const room = createRoom()
    const first = room.connect('Alex')
    room.connect('Alex')

    room.disconnect(first.participant.id)
    const reconnected = room.connect('Alex')

    expect(reconnected.participant).toMatchObject({
      id: 'participant-3',
      displayName: 'Alex#3',
      joinSequence: 3,
      isAdmin: false,
    })
    expect(reconnected.snapshot.adminId).toBe('participant-2')
    expect(reconnected.snapshot.participants.map(participant => participant.id)).toEqual([
      'participant-2',
      'participant-3',
    ])
  })
})
