<script setup lang="ts">
import { parseRoomId } from '~/domain/room-target'

const route = useRoute()
const roomIdResult = computed(() => parseRoomId(String(route.params.roomId ?? '')))
const { chosenName, hasRememberedChosenName, rememberChosenName } = useChosenName({
  load: roomIdResult.value.ok,
})
const chosenNameError = ref('')
const isReady = computed(() => roomIdResult.value.ok && hasRememberedChosenName.value)
const runtimeConfig = useRuntimeConfig()
const roomConnection = shallowRef<ReturnType<typeof useRoomConnection> | null>(null)
const connectionStatus = computed(() => roomConnection.value?.status.value ?? 'joining')
const connectionStatusLabel = computed(() => ({
  joining: 'Joining',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
}[connectionStatus.value]))
const snapshot = computed(() => roomConnection.value?.snapshot.value ?? null)
const selfParticipant = computed(() => snapshot.value?.participants.find(
  participant => participant.id === snapshot.value?.selfId,
))
const connectionError = computed(() => roomConnection.value?.error.value ?? '')
const activity = computed(() => roomConnection.value?.activity.value ?? [])
const messages = computed(() => snapshot.value?.messages ?? [])
const messageDraft = ref('')
const messageLength = computed(() => Array.from(messageDraft.value).length)
const messageError = computed(() => roomConnection.value?.messageError.value ?? '')
const acknowledgedMessage = computed(() => roomConnection.value?.acknowledgedMessage.value ?? null)

function enterRoom() {
  const result = rememberChosenName(chosenName.value)
  chosenNameError.value = result.ok ? '' : result.message
}

function sendMessage() {
  roomConnection.value?.sendMessage(messageDraft.value)
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

watch(acknowledgedMessage, (accepted, previous) => {
  if (accepted && accepted.id !== previous?.id && messageDraft.value.trim() === accepted.text) {
    messageDraft.value = ''
  }
})

watch([
  isReady,
  () => roomIdResult.value.ok ? roomIdResult.value.roomId : null,
], ([ready]) => {
  roomConnection.value?.stop()
  roomConnection.value = null

  if (!ready || !roomIdResult.value.ok || !import.meta.client) {
    return
  }

  roomConnection.value = useRoomConnection({
    roomId: roomIdResult.value.roomId,
    chosenName: chosenName.value,
    host: String(runtimeConfig.public.partyKitHost),
  })
  roomConnection.value.start()
}, { immediate: true })

onBeforeUnmount(() => roomConnection.value?.stop())
</script>

<template>
  <main class="page-shell">
    <div class="room-layout">
      <section v-if="!roomIdResult.ok" class="room-card">
        <p class="eyebrow">Invalid Room</p>
        <h1>That Room link is invalid</h1>
        <p class="intro">
          Room links use a UUID v4. Check the link you received or return home to enter it again.
        </p>
        <NuxtLink class="text-link" to="/">Return home</NuxtLink>
      </section>

      <section v-else-if="!isReady" class="room-card">
        <p class="eyebrow">Room invitation</p>
        <h1>Choose a name to enter this Room</h1>
        <p class="room-id">{{ roomIdResult.roomId }}</p>
        <p class="intro">
          Your name belongs to this tab only and will be forgotten when the tab closes.
        </p>

        <div class="field">
          <label class="field-label" for="room-chosen-name">Chosen Name</label>
          <input
            id="room-chosen-name"
            v-model="chosenName"
            autocomplete="off"
            :aria-describedby="chosenNameError ? 'room-name-error' : 'room-name-help'"
            :aria-invalid="chosenNameError ? 'true' : undefined"
          >
          <p id="room-name-help" class="field-help">Use 3–20 letters or digits.</p>
          <p
            v-if="chosenNameError"
            id="room-name-error"
            class="field-error"
            role="alert"
          >
            {{ chosenNameError }}
          </p>
        </div>

        <button class="button button-primary" type="button" @click="enterRoom">
          Enter Room
        </button>
      </section>

      <section v-else class="room-card live-room-card">
        <div class="live-room-heading">
          <div>
            <p class="eyebrow">PartyKit Room</p>
            <h1>Room is live</h1>
          </div>
          <p
            class="connection-status"
            :data-state="connectionStatus"
            data-testid="connection-status"
            role="status"
            aria-live="polite"
          >
            {{ connectionStatusLabel }}
          </p>
        </div>
        <p class="room-id">{{ roomIdResult.roomId }}</p>

        <template v-if="snapshot">
          <p class="participant-identity">
            You are <strong>{{ selfParticipant?.displayName }}</strong>
            <span v-if="selfParticipant?.isAdmin" class="admin-badge">Admin</span>
          </p>

          <section class="participant-panel" aria-labelledby="participant-heading">
            <h2 id="participant-heading">Participants</h2>
            <ol class="participant-list">
              <li v-for="participant in snapshot.participants" :key="participant.id">
                <span>{{ participant.displayName }}</span>
                <span v-if="participant.isAdmin" class="admin-badge">Admin</span>
              </li>
            </ol>
          </section>

          <section
            v-if="activity.length"
            class="activity-panel"
            aria-labelledby="activity-heading"
          >
            <h2 id="activity-heading">Activity</h2>
            <ol class="activity-list" aria-label="Recent Room activity" aria-live="polite">
              <li
                v-for="(notice, index) in activity"
                :key="`${index}-${notice.kind}-${notice.text}`"
                :data-kind="notice.kind"
              >
                {{ notice.text }}
              </li>
            </ol>
          </section>

          <section class="message-panel" aria-labelledby="message-heading">
            <h2 id="message-heading">Messages</h2>
            <ol
              v-if="messages.length"
              class="message-list"
              aria-label="Conversation"
              aria-live="polite"
            >
              <li v-for="message in messages" :key="message.id">
                <div class="message-meta">
                  <strong>{{ message.displayName }}</strong>
                  <time :datetime="new Date(message.timestamp).toISOString()">
                    {{ formatTimestamp(message.timestamp) }}
                  </time>
                </div>
                <p>{{ message.text }}</p>
              </li>
            </ol>
            <p v-else class="empty-messages">No Messages yet. Start the conversation.</p>
          </section>
        </template>
        <p v-else-if="connectionStatus !== 'disconnected'" class="connection-copy">
          Establishing an authoritative participation as {{ chosenName }}.
        </p>

        <form class="composer" aria-label="Message composer" @submit.prevent="sendMessage">
          <label class="field-label" for="message-draft">Message</label>
          <textarea
            id="message-draft"
            v-model="messageDraft"
            rows="3"
            :disabled="connectionStatus !== 'connected'"
            :aria-describedby="messageError ? 'message-error message-limit' : 'message-limit'"
            :aria-invalid="messageError ? 'true' : undefined"
          />
          <div class="message-guidance">
            <p id="message-limit" class="field-help">{{ messageLength }} / 500 characters</p>
            <p v-if="messageError" id="message-error" class="field-error" role="alert">
              {{ messageError }}
            </p>
          </div>
          <button
            class="button button-primary"
            type="submit"
            :disabled="connectionStatus !== 'connected'"
          >
            Send
          </button>
        </form>

        <div v-if="connectionStatus === 'disconnected'" class="connection-recovery">
          <p role="alert">{{ connectionError || 'The Room connection ended.' }}</p>
          <button class="button button-secondary" type="button" @click="roomConnection?.retry()">
            Retry
          </button>
          <NuxtLink class="text-link" to="/">Return home</NuxtLink>
        </div>
      </section>
    </div>
  </main>
</template>
