import { readonly, ref } from 'vue'
import type { Message, RoomSnapshot, ServerEvent } from '../../shared/protocol'

export type RoomConnectionStatus =
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export type RoomSocket = {
  onmessage: ((event: MessageEvent<string>) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  close: () => void
  send: (data: string) => void
}

type Schedule = (callback: () => void, delay: number) => unknown

type RoomConnectionOptions = {
  roomId: string
  chosenName: string
  host: string
  createSocket?: (url: string) => RoomSocket
  schedule?: Schedule
  cancelSchedule?: (handle: unknown) => void
  retryDelayMs?: number
}

const defaultSchedule: Schedule = (callback, delay) => setTimeout(callback, delay)

function defaultCancelSchedule(handle: unknown): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>)
}

function isLocalHost(host: string): boolean {
  const hostname = new URL(`ws://${host}`).hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function buildPartyKitWebSocketUrl(
  host: string,
  roomId: string,
  chosenName: string,
): string {
  const protocol = isLocalHost(host) ? 'ws' : 'wss'
  const url = new URL(`${protocol}://${host}/parties/main/${roomId}`)
  url.searchParams.set('name', chosenName)
  return url.toString()
}

function isParticipant(value: unknown): value is RoomSnapshot['participants'][number] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const participant = value as Record<string, unknown>
  return typeof participant.id === 'string'
    && typeof participant.chosenName === 'string'
    && typeof participant.displayName === 'string'
    && Number.isInteger(participant.joinSequence)
    && Number(participant.joinSequence) > 0
    && typeof participant.isAdmin === 'boolean'
}

function isMessage(value: unknown): value is RoomSnapshot['messages'][number] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const message = value as Record<string, unknown>
  return typeof message.id === 'string'
    && typeof message.participantId === 'string'
    && typeof message.displayName === 'string'
    && typeof message.text === 'string'
    && typeof message.timestamp === 'number'
    && Number.isFinite(message.timestamp)
}

type ParsedServerEvent =
  | ({ type: 'snapshot' } & RoomSnapshot)
  | Extract<ServerEvent, { type: 'presence' | 'notice' | 'message' | 'error' }>

function hasValidPresence(
  adminId: unknown,
  participants: unknown,
): participants is RoomSnapshot['participants'] {
  if (!Array.isArray(participants) || !participants.every(isParticipant)) {
    return false
  }
  const ids = new Set(participants.map(participant => participant.id))
  if (ids.size !== participants.length || typeof adminId !== 'string' || !ids.has(adminId)) {
    return false
  }
  if (!participants.every((participant, index) => (
    participant.isAdmin === (participant.id === adminId)
    && (index === 0 || participant.joinSequence > participants[index - 1]!.joinSequence)
  ))) {
    return false
  }
  return true
}

function parseServerEvent(data: string): ParsedServerEvent | null {
  try {
    const event = JSON.parse(data) as ServerEvent
    if (event.type === 'snapshot') {
      if (
        typeof event.selfId !== 'string'
        || !hasValidPresence(event.adminId, event.participants)
        || !event.participants.some(participant => participant.id === event.selfId)
        || !Array.isArray(event.messages)
        || !event.messages.every(isMessage)
      ) {
        return null
      }
      return event
    }
    if (event.type === 'presence') {
      return hasValidPresence(event.adminId, event.participants) ? event : null
    }
    if (event.type === 'notice') {
      return (
        ['join', 'leave', 'admin-change'].includes(event.kind)
        && typeof event.text === 'string'
        && event.text.length > 0
      ) ? event : null
    }
    if (event.type === 'message') {
      return isMessage(event.message) ? event : null
    }
    if (event.type === 'error') {
      return (
        typeof event.code === 'string'
        && typeof event.message === 'string'
        && event.message.length > 0
        && typeof event.recoverable === 'boolean'
      ) ? event : null
    }
    return null
  }
  catch {
    return null
  }
}

export function useRoomConnection(options: RoomConnectionOptions) {
  const status = ref<RoomConnectionStatus>('disconnected')
  const snapshot = ref<RoomSnapshot | null>(null)
  const activity = ref<Array<Extract<ServerEvent, { type: 'notice' }>>>([])
  const error = ref('')
  const messageError = ref('')
  const acknowledgedMessage = ref<Message | null>(null)
  const createSocket = options.createSocket ?? (url => new WebSocket(url))
  const schedule = options.schedule ?? defaultSchedule
  const cancelSchedule = options.cancelSchedule ?? defaultCancelSchedule
  const retryDelayMs = options.retryDelayMs ?? 500
  let socket: RoomSocket | null = null
  let retryHandle: unknown
  let generation = 0
  let stopped = true
  let automaticRetryAvailable = true

  function clearRetry(): void {
    if (retryHandle !== undefined) {
      cancelSchedule(retryHandle)
      retryHandle = undefined
    }
  }

  function failAttempt(attemptGeneration: number, reason?: string): void {
    if (stopped || attemptGeneration !== generation) {
      return
    }

    generation++
    socket = null

    if (automaticRetryAvailable) {
      automaticRetryAvailable = false
      activity.value = []
      status.value = 'reconnecting'
      const scheduledGeneration = generation
      retryHandle = schedule(() => {
        retryHandle = undefined
        if (!stopped && scheduledGeneration === generation) {
          openSocket('reconnecting')
        }
      }, retryDelayMs)
      return
    }

    status.value = 'disconnected'
    error.value = reason || 'Unable to connect to this Room.'
  }

  function openSocket(nextStatus: 'joining' | 'reconnecting'): void {
    clearRetry()
    activity.value = []
    status.value = nextStatus
    error.value = ''
    const attemptGeneration = ++generation
    let nextSocket: RoomSocket
    try {
      nextSocket = createSocket(buildPartyKitWebSocketUrl(
        options.host,
        options.roomId,
        options.chosenName,
      ))
    }
    catch {
      failAttempt(attemptGeneration)
      return
    }
    socket = nextSocket

    nextSocket.onmessage = (event: MessageEvent<string>) => {
      if (stopped || attemptGeneration !== generation) {
        return
      }
      const serverEvent = parseServerEvent(event.data)
      if (!serverEvent) {
        return
      }
      if (serverEvent.type === 'snapshot') {
        const { type: _type, ...nextSnapshot } = serverEvent
        snapshot.value = nextSnapshot
        status.value = 'connected'
        automaticRetryAvailable = true
      }
      else if (
        serverEvent.type === 'presence'
        && snapshot.value
        && serverEvent.participants.some(participant => participant.id === snapshot.value?.selfId)
      ) {
        snapshot.value = {
          ...snapshot.value,
          adminId: serverEvent.adminId,
          participants: serverEvent.participants,
        }
      }
      else if (serverEvent.type === 'notice') {
        activity.value = [...activity.value, { ...serverEvent }].slice(-20)
      }
      else if (serverEvent.type === 'message' && snapshot.value) {
        if (!snapshot.value.messages.some(message => message.id === serverEvent.message.id)) {
          snapshot.value = {
            ...snapshot.value,
            messages: [...snapshot.value.messages, serverEvent.message].slice(-100),
          }
        }
        if (serverEvent.message.participantId === snapshot.value.selfId) {
          acknowledgedMessage.value = serverEvent.message
          messageError.value = ''
        }
      }
      else if (serverEvent.type === 'error' && serverEvent.recoverable) {
        messageError.value = serverEvent.message
      }
    }
    nextSocket.onerror = () => failAttempt(attemptGeneration)
    nextSocket.onclose = event => failAttempt(attemptGeneration, event.reason)
  }

  function start(): void {
    stopped = false
    snapshot.value = null
    messageError.value = ''
    acknowledgedMessage.value = null
    automaticRetryAvailable = true
    openSocket('joining')
  }

  function retry(): void {
    stopSocketOnly()
    stopped = false
    snapshot.value = null
    automaticRetryAvailable = true
    openSocket('joining')
  }

  function stopSocketOnly(): void {
    clearRetry()
    generation++
    const activeSocket = socket
    socket = null
    activeSocket?.close()
  }

  function stop(): void {
    stopped = true
    stopSocketOnly()
    status.value = 'disconnected'
  }

  function sendMessage(text: string): boolean {
    if (status.value !== 'connected' || !socket) {
      return false
    }
    messageError.value = ''
    acknowledgedMessage.value = null
    socket.send(JSON.stringify({ type: 'send-message', text }))
    return true
  }

  return {
    status: readonly(status),
    snapshot: readonly(snapshot),
    activity: readonly(activity),
    error: readonly(error),
    messageError: readonly(messageError),
    acknowledgedMessage: readonly(acknowledgedMessage),
    sendMessage,
    start,
    retry,
    stop,
  }
}
