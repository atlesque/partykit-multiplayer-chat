import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '../../shared/protocol'
import {
  buildPartyKitWebSocketUrl,
  useRoomConnection,
  type RoomSocket,
} from './useRoomConnection'

class FakeSocket implements RoomSocket {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  close = vi.fn()

  message(event: ServerEvent) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>)
  }

  rawMessage(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>)
  }

  fail() {
    this.onerror?.(new Event('error'))
  }

  disconnect(reason = '') {
    this.onclose?.({ reason } as CloseEvent)
  }
}

function snapshot(selfId = 'participant-1'): ServerEvent {
  return {
    type: 'snapshot',
    selfId,
    adminId: selfId,
    participants: [{
      id: selfId,
      chosenName: 'Alex',
      displayName: 'Alex#1',
      joinSequence: 1,
      isAdmin: true,
    }],
    messages: [],
  }
}

function setup() {
  const sockets: FakeSocket[] = []
  const scheduled: Array<() => void> = []
  const connection = useRoomConnection({
    roomId: '550e8400-e29b-41d4-a716-446655440000',
    chosenName: 'Alex',
    host: '127.0.0.1:1999',
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    schedule: callback => {
      scheduled.push(callback)
      return scheduled.length
    },
    cancelSchedule: vi.fn(),
  })
  return { connection, sockets, scheduled }
}

describe('useRoomConnection', () => {
  it('builds local and production PartyKit WebSocket URLs without identity state', () => {
    const roomId = '550e8400-e29b-41d4-a716-446655440000'
    expect(buildPartyKitWebSocketUrl('127.0.0.1:1999', roomId, 'Alex A')).toBe(
      `ws://127.0.0.1:1999/parties/main/${roomId}?name=Alex+A`,
    )
    expect(buildPartyKitWebSocketUrl('chat.example.com', roomId, 'Alex')).toBe(
      `wss://chat.example.com/parties/main/${roomId}?name=Alex`,
    )
    expect(buildPartyKitWebSocketUrl('[::1]:1999', roomId, 'Alex')).toBe(
      `ws://[::1]:1999/parties/main/${roomId}?name=Alex`,
    )
  })

  it('moves from joining to connected only after an authoritative snapshot', () => {
    const { connection, sockets } = setup()

    connection.start()
    expect(connection.status.value).toBe('joining')
    expect(sockets).toHaveLength(1)

    sockets[0]!.message(snapshot())
    expect(connection.status.value).toBe('connected')
    expect(connection.snapshot.value?.selfId).toBe('participant-1')
  })

  it('automatically reconnects once, then falls back to manual retry', () => {
    const { connection, sockets, scheduled } = setup()
    connection.start()
    sockets[0]!.message(snapshot())

    sockets[0]!.disconnect('network lost')
    expect(connection.status.value).toBe('reconnecting')
    expect(scheduled).toHaveLength(1)

    scheduled[0]!()
    expect(sockets).toHaveLength(2)
    sockets[1]!.fail()
    expect(connection.status.value).toBe('disconnected')
    expect(connection.error.value).toBe('Unable to connect to this Room.')

    connection.retry()
    expect(connection.status.value).toBe('joining')
    expect(sockets).toHaveLength(3)
  })

  it('ignores callbacks from stale sockets', () => {
    const { connection, sockets, scheduled } = setup()
    connection.start()
    sockets[0]!.disconnect()
    scheduled[0]!()

    sockets[0]!.message(snapshot('stale-participant'))
    expect(connection.snapshot.value).toBeNull()

    sockets[1]!.message(snapshot('current-participant'))
    expect(connection.snapshot.value?.selfId).toBe('current-participant')
  })

  it('stops intentionally without scheduling a reconnect', () => {
    const { connection, sockets, scheduled } = setup()
    connection.start()
    sockets[0]!.message(snapshot())

    connection.stop()
    sockets[0]!.disconnect()

    expect(sockets[0]!.close).toHaveBeenCalledOnce()
    expect(connection.status.value).toBe('disconnected')
    expect(scheduled).toHaveLength(0)
  })

  it('rejects malformed nested snapshot values', () => {
    const { connection, sockets } = setup()
    connection.start()

    sockets[0]!.rawMessage({
      ...snapshot(),
      participants: [null],
    })

    expect(connection.status.value).toBe('joining')
    expect(connection.snapshot.value).toBeNull()
  })

  it('replaces authoritative presence while preserving self identity and Messages', () => {
    const { connection, sockets } = setup()
    connection.start()
    sockets[0]!.message(snapshot())

    sockets[0]!.message({
      type: 'presence',
      adminId: 'participant-2',
      participants: [
        {
          id: 'participant-1',
          chosenName: 'Alex',
          displayName: 'Alex#1',
          joinSequence: 1,
          isAdmin: false,
        },
        {
          id: 'participant-2',
          chosenName: 'Blair',
          displayName: 'Blair#1',
          joinSequence: 2,
          isAdmin: true,
        },
      ],
    })

    expect(connection.snapshot.value).toMatchObject({
      selfId: 'participant-1',
      adminId: 'participant-2',
      messages: [],
    })
    expect(connection.snapshot.value?.participants.map(participant => participant.id)).toEqual([
      'participant-1',
      'participant-2',
    ])
  })

  it('ignores structurally inconsistent presence events', () => {
    const { connection, sockets } = setup()
    connection.start()
    sockets[0]!.message(snapshot())
    const initialSnapshot = connection.snapshot.value

    sockets[0]!.rawMessage({
      type: 'presence',
      adminId: 'missing-participant',
      participants: initialSnapshot?.participants,
    })

    expect(connection.snapshot.value).toBe(initialSnapshot)
  })

  it('keeps the latest 20 transient notices in chronological order', () => {
    const { connection, sockets } = setup()
    connection.start()
    sockets[0]!.message(snapshot())

    for (let index = 1; index <= 21; index++) {
      sockets[0]!.message({
        type: 'notice',
        kind: 'join',
        text: `Participant ${index} joined the Room.`,
      })
    }

    expect(connection.activity.value).toHaveLength(20)
    expect(connection.activity.value[0]?.text).toBe('Participant 2 joined the Room.')
    expect(connection.activity.value[19]?.text).toBe('Participant 21 joined the Room.')
  })

  it('ignores malformed notices and clears activity for each new participation', () => {
    const { connection, sockets, scheduled } = setup()
    connection.start()
    sockets[0]!.message(snapshot())
    sockets[0]!.message({
      type: 'notice',
      kind: 'leave',
      text: 'Blair#1 left the Room.',
    })
    sockets[0]!.rawMessage({ type: 'notice', kind: 'unknown', text: 'Ignored' })
    expect(connection.activity.value.map(notice => notice.text)).toEqual([
      'Blair#1 left the Room.',
    ])

    sockets[0]!.disconnect()
    expect(connection.activity.value).toEqual([])
    scheduled[0]!()
    sockets[1]!.message(snapshot('participant-2'))
    sockets[1]!.message({ type: 'notice', kind: 'join', text: 'Casey#1 joined the Room.' })
    connection.retry()
    expect(connection.activity.value).toEqual([])
  })

  it('routes synchronous socket-construction failures through retry and terminal recovery', () => {
    const scheduled: Array<() => void> = []
    const connection = useRoomConnection({
      roomId: '550e8400-e29b-41d4-a716-446655440000',
      chosenName: 'Alex',
      host: '127.0.0.1:1999',
      createSocket: () => {
        throw new Error('socket construction failed')
      },
      schedule: callback => {
        scheduled.push(callback)
        return scheduled.length
      },
    })

    expect(() => connection.start()).not.toThrow()
    expect(connection.status.value).toBe('reconnecting')
    scheduled[0]!()
    expect(connection.status.value).toBe('disconnected')
    expect(connection.error.value).toBe('Unable to connect to this Room.')
  })
})
