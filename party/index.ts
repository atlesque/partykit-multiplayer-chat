import type * as Party from 'partykit/server'
import { RateLimitError, RoomCore, RoomFullError } from '../server/room-core'
import { serializeServerEvent, type ClientEvent } from '../shared/protocol'

const INVALID_NAME_CLOSE_CODE = 4001
const ROOM_FULL_CLOSE_CODE = 4002
const ORIGIN_NOT_ALLOWED_CLOSE_CODE = 4003

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function isAllowedOrigin(request: Request, configuredOrigin: unknown): boolean {
  if (typeof configuredOrigin === 'string' && configuredOrigin.length > 0) {
    try {
      return request.headers.get('Origin') === new URL(configuredOrigin).origin
    }
    catch {
      return false
    }
  }
  return isLocalHostname(new URL(request.url).hostname)
}

function parseClientEvent(message: string): ClientEvent | null {
  try {
    const event = JSON.parse(message) as unknown
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return null
    }
    const record = event as Record<string, unknown>
    if (
      Object.keys(record).length !== 2
      || record.type !== 'send-message'
      || typeof record.text !== 'string'
    ) {
      return null
    }
    return { type: 'send-message', text: record.text }
  }
  catch {
    return null
  }
}

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
    if (!isAllowedOrigin(context.request, this.room.env.FRONTEND_ORIGIN)) {
      connection.close(ORIGIN_NOT_ALLOWED_CLOSE_CODE, 'Origin is not allowed')
      return
    }
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
      if (error instanceof RoomFullError) {
        connection.close(ROOM_FULL_CLOSE_CODE, error.message)
        return
      }
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

    const event = parseClientEvent(message)
    if (!event) {
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
      const rateLimited = error instanceof RateLimitError
      sender.send(serializeServerEvent({
        type: 'error',
        code: rateLimited ? 'rate-limited' : 'invalid-message',
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
