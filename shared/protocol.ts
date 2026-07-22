export type Participant = {
  id: string
  chosenName: string
  displayName: string
  joinSequence: number
  isAdmin: boolean
}

export type Message = {
  id: string
  participantId: string
  displayName: string
  text: string
  timestamp: number
}

export type RoomSnapshot = {
  selfId: string
  adminId: string
  participants: Participant[]
  messages: Message[]
}

export type SystemNoticeKind = 'join' | 'leave' | 'admin-change'

export type ServerEvent =
  | ({ type: 'snapshot' } & RoomSnapshot)
  | { type: 'presence'; adminId: string; participants: Participant[] }
  | { type: 'message'; message: Message }
  | { type: 'notice'; kind: SystemNoticeKind; text: string }
  | { type: 'error'; code: string; message: string; recoverable: boolean }

export type ClientEvent =
  | { type: 'send-message'; text: string }

export function serializeServerEvent(event: ServerEvent): string {
  return JSON.stringify(event)
}
