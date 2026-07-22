import { readonly, ref } from 'vue'
import type { RoomSnapshot, ServerEvent } from '../../shared/protocol'

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
  const hostname = host.split(':')[0]
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

function parseSnapshot(data: string): RoomSnapshot | null {
  try {
    const event = JSON.parse(data) as ServerEvent
    if (
      event.type !== 'snapshot'
      || typeof event.selfId !== 'string'
      || typeof event.adminId !== 'string'
      || !Array.isArray(event.participants)
      || !Array.isArray(event.messages)
    ) {
      return null
    }
    const { selfId, adminId, participants, messages } = event
    return { selfId, adminId, participants, messages }
  }
  catch {
    return null
  }
}

export function useRoomConnection(options: RoomConnectionOptions) {
  const status = ref<RoomConnectionStatus>('disconnected')
  const snapshot = ref<RoomSnapshot | null>(null)
  const error = ref('')
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
    status.value = nextStatus
    error.value = ''
    const attemptGeneration = ++generation
    const nextSocket = createSocket(buildPartyKitWebSocketUrl(
      options.host,
      options.roomId,
      options.chosenName,
    ))
    socket = nextSocket

    nextSocket.onmessage = (event: MessageEvent<string>) => {
      if (stopped || attemptGeneration !== generation) {
        return
      }
      const nextSnapshot = parseSnapshot(event.data)
      if (!nextSnapshot) {
        return
      }
      snapshot.value = nextSnapshot
      status.value = 'connected'
      automaticRetryAvailable = true
    }
    nextSocket.onerror = () => failAttempt(attemptGeneration)
    nextSocket.onclose = event => failAttempt(attemptGeneration, event.reason)
  }

  function start(): void {
    stopped = false
    snapshot.value = null
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

  return {
    status: readonly(status),
    snapshot: readonly(snapshot),
    error: readonly(error),
    start,
    retry,
    stop,
  }
}
