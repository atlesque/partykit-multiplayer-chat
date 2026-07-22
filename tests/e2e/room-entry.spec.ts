import { expect, test, type Page } from '@playwright/test'

const roomId = '550e8400-e29b-41d4-a716-446655440000'

async function countWebSocketAttempts(page: Page) {
  await page.addInitScript(() => {
    const counterWindow = window as typeof window & { __webSocketUrls: string[] }
    counterWindow.__webSocketUrls = []
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, argumentsList) {
        counterWindow.__webSocketUrls.push(String(argumentsList[0]))
        return Reflect.construct(target, argumentsList)
      },
    })
  })
}

async function expectNoWebSocketAttempt(page: Page) {
  await expect.poll(() =>
    page.evaluate(
      () =>
        (window as typeof window & { __webSocketUrls: string[] }).__webSocketUrls.filter(
          (url) => !new URL(url).pathname.startsWith('/_nuxt/'),
        ),
    ),
  ).toEqual([])
}

async function expectPartyKitWebSocketAttempt(page: Page) {
  await expect.poll(() =>
    page.evaluate(
      () =>
        (window as typeof window & { __webSocketUrls: string[] }).__webSocketUrls.filter(
          url => new URL(url).pathname.startsWith('/parties/main/'),
        ).length,
    ),
  ).toBeGreaterThan(0)
}

test('gates a valid direct Room link until a Chosen Name is submitted', async ({ page }) => {
  await countWebSocketAttempts(page)
  await page.goto(`/rooms/${roomId}`)

  await expect(page.getByRole('heading', { name: 'Choose a name to enter this Room' })).toBeVisible()
  await expect(page.getByLabel('Chosen Name')).toHaveValue('')
  await expectNoWebSocketAttempt(page)

  await page.getByLabel('Chosen Name').fill('Jordan')
  await page.getByRole('button', { name: 'Enter Room' }).click()

  await expect(page.getByRole('heading', { name: 'Room is live' })).toBeVisible()
  await expect(page.getByText(roomId)).toBeVisible()
  await expectPartyKitWebSocketAttempt(page)
})

test('explains an invalid gate name without erasing it', async ({ page }) => {
  await page.goto(`/rooms/${roomId}`)
  await page.getByLabel('Chosen Name').fill('Jo!')

  await page.getByRole('button', { name: 'Enter Room' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Chosen Name must contain 3–20 ASCII letters or digits.',
  )
  await expect(page.getByLabel('Chosen Name')).toHaveValue('Jo!')
})

test('uses a remembered same-tab Chosen Name without showing the gate', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('partykit-chat:chosen-name', 'Riley'))

  await page.goto(`/rooms/${roomId}`)

  await expect(page.getByRole('heading', { name: 'Room is live' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enter Room' })).toHaveCount(0)
})

test('rejects an invalid direct Room route before any connection attempt', async ({ page }) => {
  await countWebSocketAttempts(page)
  await page.goto('/rooms/not-a-room')

  await expect(page.getByRole('heading', { name: 'That Room link is invalid' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/')
  await expectNoWebSocketAttempt(page)
})
