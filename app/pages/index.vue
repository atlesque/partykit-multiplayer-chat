<script setup lang="ts">
import { parseRoomTarget } from '~/domain/room-target'

const { chosenName, rememberChosenName } = useChosenName()
const chosenNameError = ref('')
const roomTarget = ref('')
const roomTargetError = ref('')

function validateAndRememberName() {
  const result = rememberChosenName(chosenName.value)
  chosenNameError.value = result.ok ? '' : result.message
  return result.ok
}

async function createRoom() {
  if (!validateAndRememberName()) {
    return
  }

  const roomId = crypto.randomUUID().toLowerCase()
  await navigateTo(`/rooms/${roomId}`)
}

async function joinRoom() {
  if (!validateAndRememberName()) {
    return
  }

  const result = parseRoomTarget(roomTarget.value, window.location.origin)
  roomTargetError.value = result.ok ? '' : result.message

  if (!result.ok) {
    return
  }

  await navigateTo(`/rooms/${result.roomId}`)
}
</script>

<template>
  <main class="page-shell">
    <div class="entry-layout">
      <header>
        <p class="eyebrow">PartyKit multiplayer chat</p>
        <h1>Start a temporary Room</h1>
        <p class="intro">
          Pick a name, open an ephemeral Room, and share its link. No account and no
          conversation left behind.
        </p>
      </header>

      <section class="entry-card" aria-label="Room entry">
        <div class="field">
          <label class="field-label" for="chosen-name">Chosen Name</label>
          <input
            id="chosen-name"
            v-model="chosenName"
            autocomplete="off"
            :aria-describedby="chosenNameError ? 'chosen-name-error' : 'chosen-name-help'"
            :aria-invalid="chosenNameError ? 'true' : undefined"
          >
          <p id="chosen-name-help" class="field-help">Use 3–20 letters or digits.</p>
          <p
            v-if="chosenNameError"
            id="chosen-name-error"
            class="field-error"
            role="alert"
          >
            {{ chosenNameError }}
          </p>
        </div>

        <button class="button button-primary" type="button" @click="createRoom">
          Create Room
        </button>

        <div class="divider">or join one</div>

        <div class="field">
          <label class="field-label" for="room-target">Room UUID or URL</label>
          <input
            id="room-target"
            v-model="roomTarget"
            autocomplete="off"
            spellcheck="false"
            :aria-describedby="roomTargetError ? 'room-target-error' : undefined"
            :aria-invalid="roomTargetError ? 'true' : undefined"
          >
          <p
            v-if="roomTargetError"
            id="room-target-error"
            class="field-error"
            role="alert"
          >
            {{ roomTargetError }}
          </p>
        </div>

        <button class="button button-secondary" type="button" @click="joinRoom">
          Join Room
        </button>
      </section>
    </div>
  </main>
</template>
