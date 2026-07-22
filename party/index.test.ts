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

function createConnection(name: string): FakeConnection {
  return {
    id: 'connection-1',
    uri: `http://localhost:1999/parties/main/room-1?name=${encodeURIComponent(name)}`,
    send: vi.fn(),
    close: vi.fn(),
  }
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
})
