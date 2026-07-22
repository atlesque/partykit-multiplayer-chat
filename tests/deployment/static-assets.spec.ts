import { expect, test } from '@playwright/test'

const roomId = '550e8400-e29b-41d4-a716-446655440000'

test('serves the generated home page from Workers Static Assets', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Start a temporary Room' })).toBeVisible()
})

test('serves the Nuxt shell for a direct canonical Room navigation', async ({ page }) => {
  const response = await page.goto(`/rooms/${roomId}`)

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Choose a name to enter this Room' })).toBeVisible()
})
