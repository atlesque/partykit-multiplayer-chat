export const ROOM_TARGET_ERROR =
  'Enter a valid Room UUID or a Room URL from this application.'

const UUID_V4_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID_V4_PATTERN = new RegExp(`^${UUID_V4_SOURCE}$`, 'i')
const ROOM_PATH_PATTERN = new RegExp(`^/rooms/(${UUID_V4_SOURCE})/?$`, 'i')

export type RoomTargetResult =
  | { ok: true; roomId: string }
  | { ok: false; message: string }

export function parseRoomId(input: string): RoomTargetResult {
  if (!UUID_V4_PATTERN.test(input)) {
    return { ok: false, message: ROOM_TARGET_ERROR }
  }

  return { ok: true, roomId: input.toLowerCase() }
}

export function parseRoomTarget(input: string, applicationOrigin: string): RoomTargetResult {
  const normalizedInput = input.trim()
  const roomIdResult = parseRoomId(normalizedInput)

  if (roomIdResult.ok) {
    return roomIdResult
  }

  try {
    const url = new URL(normalizedInput)
    const match = ROOM_PATH_PATTERN.exec(url.pathname)

    if (
      url.origin !== applicationOrigin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !match
    ) {
      return { ok: false, message: ROOM_TARGET_ERROR }
    }

    return { ok: true, roomId: match[1]!.toLowerCase() }
  } catch {
    return { ok: false, message: ROOM_TARGET_ERROR }
  }
}
