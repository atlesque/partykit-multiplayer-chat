import type * as Party from 'partykit/server'
import { RoomCore } from '../server/room-core'
import { serializeServerEvent } from '../shared/protocol'

const INVALID_NAME_CLOSE_CODE = 4001

export default class Server implements Party.Server {
  readonly options = { hibernate: false }
  readonly #core = new RoomCore(() => crypto.randomUUID())
  readonly #participantByConnection = new Map<string, string>()

  constructor(readonly room: Party.Room) {}

  async onConnect(
    connection: Party.Connection,
    context: Party.ConnectionContext,
  ): Promise<void> {
    const name = new URL(context.request.url).searchParams.get('name') ?? ''

    try {
      const connected = this.#core.connect(name)
      this.#participantByConnection.set(connection.id, connected.participant.id)
      connection.send(serializeServerEvent({
        type: 'snapshot',
        ...connected.snapshot,
      }))
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

  #disconnect(connectionId: string): void {
    const participantId = this.#participantByConnection.get(connectionId)
    if (!participantId) {
      return
    }

    this.#participantByConnection.delete(connectionId)
    this.#core.disconnect(participantId)
  }
}
