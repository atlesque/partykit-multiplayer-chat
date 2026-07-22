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

function createServer() {
  const room = { id: 'room-1' } as Party.Room
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
})
