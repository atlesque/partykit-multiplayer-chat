import { describe, expect, it } from 'vitest'
import { RateLimitError, RoomCore, RoomFullError } from './room-core'

function createRoom() {
  let nextId = 0
  let nextMessageId = 0
  return new RoomCore(
    () => `participant-${++nextId}`,
    () => `message-${++nextMessageId}`,
    () => 1_750_000_000_000 + nextMessageId,
  )
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

  it('returns authoritative presence and a transient notice for a later join', () => {
    const room = createRoom()

    const first = room.connect('Alex')
    const second = room.connect('Alex')

    expect(first.notices).toEqual([])
    expect(second.participant).toMatchObject({
      displayName: 'Alex#2',
      joinSequence: 2,
      isAdmin: false,
    })
    expect(second.presence.adminId).toBe('participant-1')
    expect(second.presence.participants.map(participant => participant.displayName)).toEqual([
      'Alex#1',
      'Alex#2',
    ])
    expect(second.notices).toEqual([{
      type: 'notice',
      kind: 'join',
      text: 'Alex#2 joined the Room.',
    }])
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

  it('returns leave presence without an Admin change for a non-Admin departure', () => {
    const room = createRoom()
    const first = room.connect('Alex')
    const second = room.connect('Blair')

    const transition = room.disconnect(second.participant.id)

    expect(transition?.presence).toEqual({
      adminId: first.participant.id,
      participants: [first.participant],
    })
    expect(transition?.notices).toEqual([{
      type: 'notice',
      kind: 'leave',
      text: 'Blair#1 left the Room.',
    }])
  })

  it('promotes the earliest remaining Participant when Admin leaves', () => {
    const room = createRoom()
    const first = room.connect('Alex')
    const second = room.connect('Blair')
    room.connect('Casey')

    const transition = room.disconnect(first.participant.id)

    expect(transition?.presence.adminId).toBe(second.participant.id)
    expect(transition?.presence.participants.map(participant => ({
      displayName: participant.displayName,
      isAdmin: participant.isAdmin,
    }))).toEqual([
      { displayName: 'Blair#1', isAdmin: true },
      { displayName: 'Casey#1', isAdmin: false },
    ])
    expect(transition?.notices).toEqual([
      { type: 'notice', kind: 'leave', text: 'Alex#1 left the Room.' },
      { type: 'notice', kind: 'admin-change', text: 'Blair#1 is now Admin.' },
    ])
    expect(room.disconnect(first.participant.id)).toBeUndefined()
  })

  it('starts a fresh Room lifetime after the final Participant disconnects', () => {
    const room = createRoom()
    const first = room.connect('Alex')

    room.disconnect(first.participant.id)
    const nextLifetime = room.connect('Alex')

    expect(nextLifetime.participant).toMatchObject({
      id: 'participant-2',
      displayName: 'Alex#1',
      joinSequence: 1,
      isAdmin: true,
    })
    expect(nextLifetime.snapshot.messages).toEqual([])
  })

  it('accepts a trimmed Message with authoritative attribution', () => {
    const room = createRoom()
    const first = room.connect('Alex')

    const message = room.acceptMessage(first.participant.id, '  Hello Room  ')

    expect(message).toEqual({
      id: 'message-1',
      participantId: first.participant.id,
      displayName: 'Alex#1',
      text: 'Hello Room',
      timestamp: 1_750_000_000_000,
    })
    expect(room.connect('Blair').snapshot.messages).toEqual([message])
  })

  it('rejects empty and over-limit Messages without adding history', () => {
    const room = createRoom()
    const first = room.connect('Alex')

    expect(() => room.acceptMessage(first.participant.id, '  \n ')).toThrow(
      'Message must contain at least one non-whitespace character.',
    )
    expect(() => room.acceptMessage(first.participant.id, 'a'.repeat(501))).toThrow(
      'Message must contain at most 500 characters.',
    )
    expect(room.connect('Blair').snapshot.messages).toEqual([])
  })

  it('counts Unicode code points instead of UTF-16 code units', () => {
    const room = createRoom()
    const first = room.connect('Alex')

    expect(room.acceptMessage(first.participant.id, '😀'.repeat(500)).text).toHaveLength(1000)
    expect(() => room.acceptMessage(first.participant.id, '😀'.repeat(501))).toThrow(
      'Message must contain at most 500 characters.',
    )
  })

  it('retains only the latest 100 Messages', () => {
    let now = 1_750_000_000_000
    let nextId = 0
    let nextMessageId = 0
    const room = new RoomCore(
      () => `participant-${++nextId}`,
      () => `message-${++nextMessageId}`,
      () => (now += 10_000),
    )
    const first = room.connect('Alex')

    for (let index = 1; index <= 101; index++) {
      room.acceptMessage(first.participant.id, `Message ${index}`)
    }

    const history = room.connect('Blair').snapshot.messages
    expect(history).toHaveLength(100)
    expect(history[0]?.text).toBe('Message 2')
    expect(history[99]?.text).toBe('Message 101')
  })

  it('rejects Messages from absent Participants', () => {
    const room = createRoom()

    expect(() => room.acceptMessage('missing', 'Hello')).toThrow(
      'Participant is not connected to this Room.',
    )
  })

  it('accepts at most 50 simultaneous Participants without consuming allocation state', () => {
    const room = createRoom()

    for (let index = 1; index <= 50; index++) {
      room.connect(`User${index}`)
    }

    expect(() => room.connect('Overflow')).toThrow(RoomFullError)
    expect(() => room.connect('Overflow')).toThrow('Room is full')
    expect(room.participantCount).toBe(50)
  })

  it('limits each Participant to five accepted Messages in a rolling ten-second window', () => {
    let now = 1_000
    let nextMessageId = 0
    const room = new RoomCore(
      () => 'participant-1',
      () => `message-${++nextMessageId}`,
      () => now,
    )
    const participant = room.connect('Alex').participant

    for (let index = 1; index <= 5; index++) {
      room.acceptMessage(participant.id, `Message ${index}`)
    }

    expect(() => room.acceptMessage(participant.id, 'Message 6')).toThrow(RateLimitError)
    expect(() => room.acceptMessage(participant.id, 'Message 6')).toThrow(
      'You can send at most 5 Messages every 10 seconds.',
    )

    now = 11_000
    expect(room.acceptMessage(participant.id, 'Message 6').text).toBe('Message 6')
  })

  it('does not charge invalid attempts against the accepted-Message limit', () => {
    const room = createRoom()
    const participant = room.connect('Alex').participant

    for (let index = 1; index <= 4; index++) {
      room.acceptMessage(participant.id, `Message ${index}`)
    }
    expect(() => room.acceptMessage(participant.id, '   ')).toThrow(
      'Message must contain at least one non-whitespace character.',
    )

    expect(room.acceptMessage(participant.id, 'Message 5').text).toBe('Message 5')
    expect(() => room.acceptMessage(participant.id, 'Message 6')).toThrow(RateLimitError)
  })

  it('isolates rate limits by Participant and clears them on disconnect', () => {
    const participantIds = ['participant-1', 'participant-2', 'participant-1']
    const room = new RoomCore(() => participantIds.shift()!)
    const first = room.connect('Alex').participant
    const second = room.connect('Blair').participant

    for (let index = 1; index <= 5; index++) {
      room.acceptMessage(first.id, `Alex ${index}`)
    }
    expect(room.acceptMessage(second.id, 'Blair 1').text).toBe('Blair 1')

    room.disconnect(first.id)
    room.disconnect(second.id)
    const fresh = room.connect('Alex').participant
    expect(room.acceptMessage(fresh.id, 'Fresh lifetime').text).toBe('Fresh lifetime')
  })
})
