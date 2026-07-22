<script setup lang="ts">
import { parseRoomId } from '~/domain/room-target'

const route = useRoute()
const roomIdResult = computed(() => parseRoomId(String(route.params.roomId ?? '')))
const { chosenName, hasRememberedChosenName, rememberChosenName } = useChosenName({
  load: roomIdResult.value.ok,
})
const chosenNameError = ref('')
const isReady = computed(() => roomIdResult.value.ok && hasRememberedChosenName.value)

function enterRoom() {
  const result = rememberChosenName(chosenName.value)
  chosenNameError.value = result.ok ? '' : result.message
}
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

      <section v-else class="room-card">
        <p class="eyebrow">Room found</p>
        <h1>Ready to connect</h1>
        <p class="room-id">{{ roomIdResult.roomId }}</p>
        <p class="ready-status">Joining as {{ chosenName }}</p>
        <p class="intro">
          Your name is set. This Room is ready for its live connection.
        </p>
        <NuxtLink class="text-link" to="/">Return home</NuxtLink>
      </section>
    </div>
  </main>
</template>
