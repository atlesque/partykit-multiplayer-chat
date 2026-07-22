import { expect, test } from '@playwright/test'

test('shows both Room entry paths', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Start a temporary Room' })).toBeVisible()
  await expect(page.getByLabel('Chosen Name')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create Room' })).toBeVisible()
  await expect(page.getByLabel('Room UUID or URL')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Join Room' })).toBeVisible()
})

test.describe('Chosen Name', () => {
  for (const invalidName of ['Al', 'A'.repeat(21), 'Alex!']) {
    test(`explains why ${JSON.stringify(invalidName)} is invalid without erasing it`, async ({
      page,
    }) => {
      await page.goto('/')
      await page.getByLabel('Chosen Name').fill(invalidName)

      await page.getByRole('button', { name: 'Create Room' }).click()

      await expect(page.getByRole('alert')).toHaveText(
        'Chosen Name must contain 3–20 ASCII letters or digits.',
      )
      await expect(page.getByLabel('Chosen Name')).toHaveValue(invalidName)
    })
  }

  test('remembers a valid name in the current tab but not a new tab', async ({ page, context }) => {
    await page.goto('/')
    await page.getByLabel('Chosen Name').fill('Alex20')
    await page.getByRole('button', { name: 'Create Room' }).click()

    await page.goto('/')
    await expect(page.getByLabel('Chosen Name')).toHaveValue('Alex20')

    const otherTab = await context.newPage()
    await otherTab.goto('/')
    await expect(otherTab.getByLabel('Chosen Name')).toHaveValue('')
  })
})

test('creates a Room with a browser-generated canonical UUID v4', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Chosen Name').fill('Avery')

  await page.getByRole('button', { name: 'Create Room' }).click()

  await expect(page).toHaveURL(
    /\/rooms\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('partykit-chat:chosen-name')))
    .toBe('Avery')
})

test.describe('join flow', () => {
  const roomId = '550e8400-e29b-41d4-a716-446655440000'

  for (const target of [roomId, roomId.toUpperCase()]) {
    test(`joins a Room from UUID input ${JSON.stringify(target)}`, async ({ page }) => {
      await page.goto('/')
      await page.getByLabel('Chosen Name').fill('Morgan')
      await page.getByLabel('Room UUID or URL').fill(target)

      await page.getByRole('button', { name: 'Join Room' }).click()

      await expect(page).toHaveURL(`/rooms/${roomId}`)
    })
  }

  test('joins from a full application Room URL and normalizes it', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Chosen Name').fill('Morgan')
    await page
      .getByLabel('Room UUID or URL')
      .fill(`${new URL(`/rooms/${roomId.toUpperCase()}`, page.url()).toString()}/`)

    await page.getByRole('button', { name: 'Join Room' }).click()

    await expect(page).toHaveURL(`/rooms/${roomId}`)
  })

  for (const target of [
    '550e8400-e29b-11d4-a716-446655440000',
    `https://example.com/rooms/${roomId}`,
    `https://example.com/not-a-room/${roomId}`,
  ]) {
    test(`explains invalid target ${JSON.stringify(target)} without erasing it`, async ({ page }) => {
      await page.goto('/')
      await page.getByLabel('Chosen Name').fill('Morgan')
      await page.getByLabel('Room UUID or URL').fill(target)

      await page.getByRole('button', { name: 'Join Room' }).click()

      await expect(page.getByRole('alert')).toHaveText(
        'Enter a valid Room UUID or a Room URL from this application.',
      )
      await expect(page.getByLabel('Room UUID or URL')).toHaveValue(target)
      await expect(page).toHaveURL('/')
    })
  }
})
