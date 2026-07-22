import type * as Party from 'partykit/server'
import { RoomCore } from '../server/room-core'
import { serializeServerEvent, type ClientEvent } from '../shared/protocol'

const INVALID_NAME_CLOSE_CODE = 4001

export default class Server implements Party.Server {
  readonly options = { hibernate: false }
  readonly #core = new RoomCore(() => crypto.randomUUID())
  readonly #participantByConnection = new Map<string, string>()
  readonly #connections = new Map<string, Party.Connection>()

  constructor(readonly room: Party.Room) {}

  async onConnect(
    connection: Party.Connection,
    context: Party.ConnectionContext,
  ): Promise<void> {
    const name = new URL(context.request.url).searchParams.get('name') ?? ''

    try {
      const existingConnections = [...this.#connections.values()]
      const connected = this.#core.connect(name)
      this.#participantByConnection.set(connection.id, connected.participant.id)
      this.#connections.set(connection.id, connection)
      connection.send(serializeServerEvent({
        type: 'snapshot',
        ...connected.snapshot,
      }))
      const events = [
        serializeServerEvent({ type: 'presence', ...connected.presence }),
        ...connected.notices.map(serializeServerEvent),
      ]
      for (const existingConnection of existingConnections) {
        for (const event of events) {
          existingConnection.send(event)
        }
      }
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : 'Invalid Chosen Name.'
      connection.close(INVALID_NAME_CLOSE_CODE, reason)
    }
  }

  async onClose(connection: Party.Connection): Promise<void> {
    this.#disconnect(connection.id)
  }

  async onError(connection: Party.Connection): Promise<void> {
    this.#disconnect(connection.id)
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection): Promise<void> {
    if (typeof message !== 'string') {
      return
    }

    let event: ClientEvent
    try {
      event = JSON.parse(message) as ClientEvent
    }
    catch {
      return
    }
    if (event.type !== 'send-message' || typeof event.text !== 'string') {
      return
    }

    const participantId = this.#participantByConnection.get(sender.id)
    if (!participantId) {
      return
    }

    try {
      const accepted = this.#core.acceptMessage(participantId, event.text)
      const serialized = serializeServerEvent({ type: 'message', message: accepted })
      for (const connection of this.#connections.values()) {
        connection.send(serialized)
      }
    }
    catch (error) {
      sender.send(serializeServerEvent({
        type: 'error',
        code: 'invalid-message',
        message: error instanceof Error ? error.message : 'Message was rejected.',
        recoverable: true,
      }))
    }
  }

  #disconnect(connectionId: string): void {
    const participantId = this.#participantByConnection.get(connectionId)
    if (!participantId) {
      return
    }

    this.#participantByConnection.delete(connectionId)
    this.#connections.delete(connectionId)
    const disconnected = this.#core.disconnect(participantId)
    if (!disconnected) {
      return
    }

    const events = [
      serializeServerEvent({ type: 'presence', ...disconnected.presence }),
      ...disconnected.notices.map(serializeServerEvent),
    ]
    for (const remainingConnection of this.#connections.values()) {
      for (const event of events) {
        remainingConnection.send(event)
      }
    }
  }
}
