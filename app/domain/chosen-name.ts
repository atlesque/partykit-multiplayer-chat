export const CHOSEN_NAME_ERROR =
  'Chosen Name must contain 3–20 ASCII letters or digits.'

const CHOSEN_NAME_PATTERN = /^[A-Za-z0-9]{3,20}$/

export type ChosenNameResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

export function parseChosenName(input: string): ChosenNameResult {
  if (!CHOSEN_NAME_PATTERN.test(input)) {
    return { ok: false, message: CHOSEN_NAME_ERROR }
  }

  return { ok: true, value: input }
}
