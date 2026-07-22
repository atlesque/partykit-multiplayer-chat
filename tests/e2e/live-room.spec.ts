import { expect, test } from '@playwright/test'

const roomId = '550e8400-e29b-41d4-a716-446655440000'
const secondRoomId = '6ba7b810-9dad-41d1-80b4-00c04fd430c8'
const isolatedRoomId = '6ba7b811-9dad-41d1-80b4-00c04fd430c8'
const participationRoomId = '47f4ad70-d227-4fae-bbab-9dcfa3b4a3dc'
const messagingRoomId = '85a7bf10-4974-4de4-92a1-a2aa11dfad71'

async function enterRoom(page: import('@playwright/test').Page, room: string, name: string) {
  await page.goto(`/rooms/${room}`)
  await page.getByLabel('Chosen Name').fill(name)
  await page.getByRole('button', { name: 'Enter Room' }).click()
  await expect(page.getByTestId('connection-status')).toHaveText('Connected')
}

test('enters a real PartyKit Room as its first authoritative Participant', async ({ page, browser }) => {
  const partySockets: string[] = []
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname.startsWith('/parties/main/')) {
      partySockets.push(socket.url())
    }
  })

  await page.goto(`/rooms/${roomId}`)

  await expect(page.getByRole('heading', { name: 'Choose a name to enter this Room' })).toBeVisible()
  await expect.poll(() => partySockets).toHaveLength(0)

  await page.getByLabel('Chosen Name').fill('Alex')
  await page.getByRole('button', { name: 'Enter Room' }).click()

  await expect(page.getByTestId('connection-status')).toHaveText('Connected')
  await expect(page.getByRole('heading', { name: 'Room is live' })).toBeVisible()
  const participants = page.getByLabel('Participants')
  await expect(participants.getByText('Alex#1', { exact: true })).toBeVisible()
  await expect(participants.getByText('Admin', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
  await expect.poll(() => partySockets).toHaveLength(1)

  const socketUrl = new URL(partySockets[0]!)
  expect(socketUrl.pathname).toBe(`/parties/main/${roomId}`)
  expect(socketUrl.searchParams.get('name')).toBe('Alex')
  expect(socketUrl.searchParams.has('participantId')).toBe(false)

  await page.goto(`/rooms/${secondRoomId}`)
  await expect(page.getByTestId('connection-status')).toHaveText('Connected')
  await expect.poll(() => partySockets).toHaveLength(2)
  expect(new URL(partySockets[1]!).pathname).toBe(`/parties/main/${secondRoomId}`)

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  await secondPage.goto(`/rooms/${isolatedRoomId}`)
  await secondPage.getByLabel('Chosen Name').fill('Blair')
  await secondPage.getByRole('button', { name: 'Enter Room' }).click()
  await expect(secondPage.getByTestId('connection-status')).toHaveText('Connected')
  await expect(secondPage.getByLabel('Participants').getByText('Blair#1')).toBeVisible()
  await expect(secondPage.getByLabel('Participants').getByText('Admin')).toBeVisible()
  await secondContext.close()
})

test('synchronizes duplicate Participants, Admin succession, and Room reset', async ({ browser }) => {
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const firstPage = await firstContext.newPage()
  const secondPage = await secondContext.newPage()

  await enterRoom(firstPage, participationRoomId, 'Alex')
  await enterRoom(secondPage, participationRoomId, 'Alex')

  for (const participantPage of [firstPage, secondPage]) {
    const rows = participantPage.locator('.participant-list li')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Alex#1')
    await expect(rows.nth(0).getByText('Admin', { exact: true })).toBeVisible()
    await expect(rows.nth(1)).toContainText('Alex#2')
    await expect(rows.nth(1).getByText('Admin', { exact: true })).toHaveCount(0)
  }
  await expect(firstPage.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(firstPage.getByLabel('Recent Room activity')).toContainText(
    'Alex#2 joined the Room.',
  )
  await expect(secondPage.getByRole('heading', { name: 'Activity' })).toHaveCount(0)

  await secondPage.reload()
  await expect(secondPage.getByTestId('connection-status')).toHaveText('Connected')
  await expect(secondPage.locator('.participant-list li')).toHaveCount(2)
  await expect(secondPage.locator('.participant-list li').nth(0)).toContainText('Alex#1')
  await expect(secondPage.locator('.participant-list li').nth(1)).toContainText('Alex#3')

  await firstContext.close()
  const remainingRows = secondPage.locator('.participant-list li')
  await expect(remainingRows).toHaveCount(1)
  await expect(remainingRows.nth(0)).toContainText('Alex#3')
  await expect(remainingRows.nth(0).getByText('Admin', { exact: true })).toBeVisible()
  await expect(secondPage.getByLabel('Recent Room activity')).toContainText(
    'Alex#1 left the Room.',
  )
  await expect(secondPage.getByLabel('Recent Room activity')).toContainText(
    'Alex#3 is now Admin.',
  )

  await secondContext.close()
  const freshContext = await browser.newContext()
  const freshPage = await freshContext.newPage()
  await enterRoom(freshPage, participationRoomId, 'Alex')
  await expect(freshPage.locator('.participant-list li')).toHaveCount(1)
  await expect(freshPage.locator('.participant-list li').first()).toContainText('Alex#1')
  await expect(freshPage.locator('.participant-list li').first().getByText('Admin', { exact: true })).toBeVisible()
  await expect(freshPage.getByRole('heading', { name: 'Activity' })).toHaveCount(0)
  await freshContext.close()
})

test('delivers authoritative Messages, preserves rejected drafts, and replays safe history', async ({ browser }) => {
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const firstPage = await firstContext.newPage()
  const secondPage = await secondContext.newPage()
  await enterRoom(firstPage, messagingRoomId, 'Alex')
  await enterRoom(secondPage, messagingRoomId, 'Blair')

  const firstDraft = firstPage.getByRole('textbox', { name: 'Message' })
  await firstDraft.fill('  Hello Blair  ')
  await firstPage.getByRole('button', { name: 'Send' }).click()

  await expect(firstDraft).toHaveValue('')
  for (const participantPage of [firstPage, secondPage]) {
    const conversation = participantPage.getByLabel('Conversation')
    await expect(conversation.getByText('Alex#1', { exact: true })).toBeVisible()
    await expect(conversation.getByText('Hello Blair', { exact: true })).toBeVisible()
  }

  await firstDraft.fill('   ')
  await firstPage.getByRole('button', { name: 'Send' }).click()
  await expect(firstDraft).toHaveValue('   ')
  await expect(firstPage.getByRole('alert')).toHaveText(
    'Message must contain at least one non-whitespace character.',
  )

  const longDraft = '😀'.repeat(501)
  await firstDraft.fill(longDraft)
  await firstPage.getByRole('button', { name: 'Send' }).click()
  await expect(firstDraft).toHaveValue(longDraft)
  await expect(firstPage.getByRole('alert')).toHaveText(
    'Message must contain at most 500 characters.',
  )
  await expect(firstPage.getByText('501 / 500 characters')).toBeVisible()

  const hostileText = '<img src=x onerror="document.body.dataset.attacked=true">'
  await firstDraft.fill(hostileText)
  await firstPage.getByRole('button', { name: 'Send' }).click()
  await expect(secondPage.getByLabel('Conversation').getByText(hostileText, { exact: true })).toBeVisible()
  await expect(secondPage.getByLabel('Conversation').locator('img')).toHaveCount(0)
  await expect(secondPage.locator('body')).not.toHaveAttribute('data-attacked', 'true')

  const lateContext = await browser.newContext()
  const latePage = await lateContext.newPage()
  await enterRoom(latePage, messagingRoomId, 'Casey')
  const lateConversation = latePage.getByLabel('Conversation')
  await expect(lateConversation.getByText('Hello Blair', { exact: true })).toBeVisible()
  await expect(lateConversation.getByText(hostileText, { exact: true })).toBeVisible()

  await lateContext.close()
  await secondContext.close()
  await firstContext.close()
})
