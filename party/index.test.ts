import type * as Party from 'partykit/server'
import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '../shared/protocol'
import Server from './index'

type FakeConnection = {
  id: string
  uri: string
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function createConnection(name: string, id = 'connection-1'): FakeConnection {
  return {
    id,
    uri: `http://localhost:1999/parties/main/room-1?name=${encodeURIComponent(name)}`,
    send: vi.fn(),
    close: vi.fn(),
  }
}

function events(connection: FakeConnection): ServerEvent[] {
  return connection.send.mock.calls.map(call => JSON.parse(call[0] as string) as ServerEvent)
}

async function connect(server: Server, connection: FakeConnection): Promise<void> {
  await server.onConnect(
    connection as unknown as Party.Connection,
    { request: new Request(connection.uri) } as Party.ConnectionContext,
  )
}

function createServer(env: Record<string, unknown> = {}) {
  const room = { id: 'room-1', env } as Party.Room
  return new Server(room)
}

describe('PartyKit Room adapter', () => {
  it('sends the first Participant an authoritative snapshot', async () => {
    const server = createServer()
    const connection = createConnection('Alex')

    await server.onConnect(
      connection as unknown as Party.Connection,
      { request: new Request(connection.uri) } as Party.ConnectionContext,
    )

    expect(connection.send).toHaveBeenCalledOnce()
    const event = JSON.parse(connection.send.mock.calls[0]![0] as string) as ServerEvent
    expect(event).toMatchObject({
      type: 'snapshot',
      adminId: expect.any(String),
      selfId: expect.any(String),
      participants: [
        {
          chosenName: 'Alex',
          displayName: 'Alex#1',
          joinSequence: 1,
          isAdmin: true,
        },
      ],
      messages: [],
    })
  })

  it('closes an invalid Chosen Name without sending a snapshot', async () => {
    const server = createServer()
    const connection = createConnection('Al!')

    await server.onConnect(
      connection as unknown as Party.Connection,
      { request: new Request(connection.uri) } as Party.ConnectionContext,
    )

    expect(connection.send).not.toHaveBeenCalled()
    expect(connection.close).toHaveBeenCalledWith(
      4001,
      'Chosen Name must contain 3–20 ASCII letters or digits.',
    )
  })

  it('broadcasts a later join only to Participants who were already present', async () => {
    const server = createServer()
    const first = createConnection('Alex', 'connection-1')
    const second = createConnection('Alex', 'connection-2')

    await connect(server, first)
    await connect(server, second)

    expect(events(first).map(event => event.type)).toEqual(['snapshot', 'presence', 'notice'])
    expect(events(first)[1]).toMatchObject({
      type: 'presence',
      adminId: events(first)[0]?.type === 'snapshot' ? events(first)[0].selfId : '',
      participants: [
        { displayName: 'Alex#1', isAdmin: true },
        { displayName: 'Alex#2', isAdmin: false },
      ],
    })
    expect(events(first)[2]).toEqual({
      type: 'notice',
      kind: 'join',
      text: 'Alex#2 joined the Room.',
    })
    expect(events(second).map(event => event.type)).toEqual(['snapshot'])
    expect(events(second)[0]).toMatchObject({
      type: 'snapshot',
      participants: [
        { displayName: 'Alex#1', isAdmin: true },
        { displayName: 'Alex#2', isAdmin: false },
      ],
    })
  })

  it('broadcasts deterministic Admin succession once when the Admin leaves', async () => {
    const server = createServer()
    const first = createConnection('Alex', 'connection-1')
    const second = createConnection('Blair', 'connection-2')
    const third = createConnection('Casey', 'connection-3')
    await connect(server, first)
    await connect(server, second)
    await connect(server, third)
    first.send.mockClear()
    second.send.mockClear()
    third.send.mockClear()

    await server.onClose(first as unknown as Party.Connection)

    for (const remaining of [second, third]) {
      expect(events(remaining).map(event => event.type)).toEqual([
        'presence',
        'notice',
        'notice',
      ])
      expect(events(remaining)[0]).toMatchObject({
        type: 'presence',
        participants: [
          { displayName: 'Blair#1', isAdmin: true },
          { displayName: 'Casey#1', isAdmin: false },
        ],
      })
      expect(events(remaining).slice(1)).toEqual([
        { type: 'notice', kind: 'leave', text: 'Alex#1 left the Room.' },
        { type: 'notice', kind: 'admin-change', text: 'Blair#1 is now Admin.' },
      ])
    }

    await server.onError(first as unknown as Party.Connection)
    expect(events(second)).toHaveLength(3)
    expect(events(third)).toHaveLength(3)
  })

  it('does not announce an Admin change when a non-Admin leaves', async () => {
    const server = createServer()
    const first = createConnection('Alex', 'connection-1')
    const second = createConnection('Blair', 'connection-2')
    await connect(server, first)
    await connect(server, second)
    first.send.mockClear()

    await server.onClose(second as unknown as Party.Connection)

    expect(events(first).map(event => event.type)).toEqual(['presence', 'notice'])
    expect(events(first)[1]).toEqual({
      type: 'notice',
      kind: 'leave',
      text: 'Blair#1 left the Room.',
    })
  })

  it('broadcasts an authoritative accepted Message to every current Participant', async () => {
    const server = createServer()
    const first = createConnection('Alex', 'connection-1')
    const second = createConnection('Blair', 'connection-2')
    await connect(server, first)
    await connect(server, second)
    first.send.mockClear()
    second.send.mockClear()

    await server.onMessage(
      JSON.stringify({ type: 'send-message', text: '  Hello Blair  ' }),
      first as unknown as Party.Connection,
    )

    for (const connection of [first, second]) {
      expect(events(connection)).toHaveLength(1)
      expect(events(connection)[0]).toMatchObject({
        type: 'message',
        message: {
          id: expect.any(String),
          participantId: expect.any(String),
          displayName: 'Alex#1',
          text: 'Hello Blair',
          timestamp: expect.any(Number),
        },
      })
    }
    expect(events(first)[0]).toEqual(events(second)[0])
  })

  it('returns a recoverable error only to the sender for an invalid Message', async () => {
    const server = createServer()
    const first = createConnection('Alex', 'connection-1')
    const second = createConnection('Blair', 'connection-2')
    await connect(server, first)
    await connect(server, second)
    first.send.mockClear()
    second.send.mockClear()

    await server.onMessage(
      JSON.stringify({ type: 'send-message', text: '   ' }),
      first as unknown as Party.Connection,
    )

    expect(events(first)).toEqual([{
      type: 'error',
      code: 'invalid-message',
      message: 'Message must contain at least one non-whitespace character.',
      recoverable: true,
    }])
    expect(events(second)).toEqual([])
    expect(first.close).not.toHaveBeenCalled()
  })

  it('closes the 51st Participant with the Room capacity code and reason', async () => {
    const server = createServer()
    const connections = Array.from(
      { length: 51 },
      (_, index) => createConnection(`User${index + 1}`, `connection-${index + 1}`),
    )

    for (const connection of connections) {
      await connect(server, connection)
    }

    expect(connections[50]!.send).not.toHaveBeenCalled()
    expect(connections[50]!.close).toHaveBeenCalledWith(4002, 'Room is full')
    expect(connections[0]!.close).not.toHaveBeenCalled()
  })

  it('returns recoverable rate-limit feedback without disrupting peers', async () => {
    const server = createServer()
    const first = createConnection('Alex', 'connection-1')
    const second = createConnection('Blair', 'connection-2')
    await connect(server, first)
    await connect(server, second)
    first.send.mockClear()
    second.send.mockClear()

    for (let index = 1; index <= 6; index++) {
      await server.onMessage(
        JSON.stringify({ type: 'send-message', text: `Message ${index}` }),
        first as unknown as Party.Connection,
      )
    }

    expect(events(first).slice(0, 5).every(event => event.type === 'message')).toBe(true)
    expect(events(first)[5]).toEqual({
      type: 'error',
      code: 'rate-limited',
      message: 'You can send at most 5 Messages every 10 seconds.',
      recoverable: true,
    })
    expect(events(second)).toHaveLength(5)
    expect(first.close).not.toHaveBeenCalled()
  })

  it('isolates malformed, binary, unknown, and authority-claiming payloads', async () => {
    const server = createServer()
    const first = createConnection('Alex', 'connection-1')
    const second = createConnection('Blair', 'connection-2')
    await connect(server, first)
    await connect(server, second)
    first.send.mockClear()
    second.send.mockClear()

    const hostilePayloads: Array<string | ArrayBuffer> = [
      '{',
      new ArrayBuffer(8),
      JSON.stringify({ type: 'unknown', text: 'Injected' }),
      JSON.stringify({ type: 'send-message', text: 'Injected', isAdmin: true }),
      JSON.stringify({ type: 'send-message', text: 'Injected', participantId: 'forged' }),
      JSON.stringify({ type: 'send-message', text: 42 }),
    ]
    for (const payload of hostilePayloads) {
      await server.onMessage(payload, first as unknown as Party.Connection)
    }

    expect(events(first)).toEqual([])
    expect(events(second)).toEqual([])
    expect(first.close).not.toHaveBeenCalled()
  })

  it('rejects a configured origin mismatch before joining Room state', async () => {
    const server = createServer({ FRONTEND_ORIGIN: 'https://chat.example.com' })
    const rejected = createConnection('Alex', 'connection-1')
    const request = new Request(rejected.uri, {
      headers: { Origin: 'https://evil.example.com' },
    })

    await server.onConnect(
      rejected as unknown as Party.Connection,
      { request } as Party.ConnectionContext,
    )

    expect(rejected.send).not.toHaveBeenCalled()
    expect(rejected.close).toHaveBeenCalledWith(4003, 'Origin is not allowed')
  })

  it('accepts an exact configured origin', async () => {
    const server = createServer({ FRONTEND_ORIGIN: 'https://chat.example.com' })
    const accepted = createConnection('Alex', 'connection-1')
    const request = new Request(accepted.uri, {
      headers: { Origin: 'https://chat.example.com' },
    })

    await server.onConnect(
      accepted as unknown as Party.Connection,
      { request } as Party.ConnectionContext,
    )

    expect(accepted.close).not.toHaveBeenCalled()
    expect(events(accepted)[0]?.type).toBe('snapshot')
  })

  it('requires origin configuration when the PartyKit endpoint is not local', async () => {
    const server = createServer()
    const rejected = createConnection('Alex', 'connection-1')
    const request = new Request(
      'https://partykit.example.com/parties/main/room-1?name=Alex',
      { headers: { Origin: 'https://chat.example.com' } },
    )

    await server.onConnect(
      rejected as unknown as Party.Connection,
      { request } as Party.ConnectionContext,
    )

    expect(rejected.send).not.toHaveBeenCalled()
    expect(rejected.close).toHaveBeenCalledWith(4003, 'Origin is not allowed')
  })
})
