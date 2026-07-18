import { test, expect } from './helpers/yiru-app'
import { openChecks } from './helpers/source-control-ai-generation'
import { seedPRCommentsSidebarFixture } from './helpers/pr-comments-sidebar-fixture'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.describe('PR comments sidebar cards view', () => {
  test.beforeEach(async ({ yiruPage }) => {
    await waitForSessionReady(yiruPage)
    await waitForActiveWorktree(yiruPage)
  })

  test('groups open, conversation, and resolved comments in cards layout', async ({ yiruPage }) => {
    const { worktreeId } = await seedPRCommentsSidebarFixture(yiruPage)
    await openChecks(yiruPage, worktreeId)

    const commentsSection = yiruPage.getByText('Comments', { exact: true })
    await expect(commentsSection).toBeVisible({ timeout: 10_000 })

    await expect(yiruPage.getByText('Needs review · 1')).toBeVisible()
    await expect(yiruPage.getByText('Please update this handler before merge.')).toBeVisible()
    await expect(yiruPage.getByText('alice')).toBeVisible()
    await expect(yiruPage.getByText('LGTM on the overall approach.')).toBeVisible()

    const openThreadCard = yiruPage.getByTestId('pr-comment-group').filter({
      hasText: 'Please update this handler before merge.'
    })
    const conversationCard = yiruPage.getByTestId('pr-comment-group').filter({
      hasText: 'LGTM on the overall approach.'
    })
    await expect(openThreadCard).toBeVisible()
    await expect(conversationCard).toBeVisible()

    const resolvedTrigger = yiruPage.getByRole('button', { name: 'Resolved · 1' })
    await expect(resolvedTrigger).toBeVisible()
    await expect(yiruPage.getByText('Already fixed upstream.')).toBeHidden()

    await resolvedTrigger.click()
    await expect(yiruPage.getByText('Already fixed upstream.')).toBeVisible()
    await expect(yiruPage.getByText('Resolved', { exact: true })).toBeVisible()
    await expect(
      yiruPage
        .getByTestId('pr-comment-group')
        .filter({ hasText: 'Already fixed upstream.' })
        .getByRole('button', { name: 'Unresolve', exact: true })
    ).toBeVisible()

    await expect(yiruPage.getByRole('button', { name: /^Add$/ })).toHaveCount(0)
  })

  test('can switch from grouped to chronological timeline order', async ({ yiruPage }) => {
    const { worktreeId } = await seedPRCommentsSidebarFixture(yiruPage)
    await openChecks(yiruPage, worktreeId)

    await expect(yiruPage.getByText('Needs review · 1')).toBeVisible({ timeout: 10_000 })
    await yiruPage.getByRole('button', { name: 'Comment display options' }).click()
    await yiruPage.getByRole('menuitemradio', { name: 'Timeline' }).click()

    await expect(yiruPage.getByText('Needs review · 1')).toHaveCount(0)
    await expect(yiruPage.getByText('Already fixed upstream.')).toBeVisible()

    const commentTexts = [
      'Already fixed upstream.',
      'Please update this handler before merge.',
      'LGTM on the overall approach.'
    ]
    const commentGroups = await yiruPage.getByTestId('pr-comment-group').allTextContents()
    const positions = commentTexts.map((comment) =>
      commentGroups.findIndex((group) => group.includes(comment))
    )
    expect(positions).toEqual([0, 1, 2])
  })

  test('queues an open thread for the agent from the visible row action and menu fallback', async ({
    yiruPage
  }) => {
    const { worktreeId } = await seedPRCommentsSidebarFixture(yiruPage)
    await openChecks(yiruPage, worktreeId)

    await expect(yiruPage.getByText('Needs review · 1')).toBeVisible({ timeout: 10_000 })

    const openThreadCard = yiruPage.getByTestId('pr-comment-group').filter({
      hasText: 'Please update this handler before merge.'
    })
    await openThreadCard.hover()
    const visibleQueueButton = openThreadCard.getByRole('button', { name: 'Queue for agent' })
    await expect(visibleQueueButton).toBeVisible()
    await visibleQueueButton.click()
    await expect(visibleQueueButton).toBeHidden()
    await expect(
      yiruPage.getByRole('button', { name: 'Send 1 queued comments to AI' })
    ).toBeVisible()
    await expect(yiruPage.getByText('Queued', { exact: true })).toBeVisible()

    await yiruPage.getByRole('button', { name: 'Clear queued comments' }).click()
    await expect(
      yiruPage.getByRole('button', { name: 'Send 1 queued comments to AI' })
    ).toBeHidden()
    await openThreadCard.hover()
    await expect(visibleQueueButton).toBeVisible()

    const actionsMenu = openThreadCard.getByRole('button', { name: 'More comment actions' })
    await actionsMenu.evaluate((element) => (element as HTMLElement).focus())
    await actionsMenu.press('Enter')
    const queueMenuItem = yiruPage.getByRole('menuitem', { name: 'Queue for agent' })
    await queueMenuItem.click({ force: true })
    await expect(queueMenuItem).toBeHidden()

    await expect(
      yiruPage.getByRole('button', { name: 'Send 1 queued comments to AI' })
    ).toBeVisible()
    await expect(yiruPage.getByText('Queued', { exact: true })).toBeVisible()
  })
})
