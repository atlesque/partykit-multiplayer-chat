import { parseChosenName } from '~/domain/chosen-name'

const STORAGE_KEY = 'partykit-chat:chosen-name'

export function useChosenName(options: { load?: boolean } = {}) {
  const chosenName = ref('')
  const hasRememberedChosenName = ref(false)

  onMounted(() => {
    if (options.load !== false) {
      chosenName.value = sessionStorage.getItem(STORAGE_KEY) ?? ''
      hasRememberedChosenName.value = parseChosenName(chosenName.value).ok
    }
  })

  function rememberChosenName(input: string) {
    const result = parseChosenName(input)

    if (result.ok) {
      sessionStorage.setItem(STORAGE_KEY, result.value)
      chosenName.value = result.value
      hasRememberedChosenName.value = true
    }

    return result
  }

  return {
    chosenName,
    hasRememberedChosenName,
    rememberChosenName,
  }
}
