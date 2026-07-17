import { test, expect } from './helpers/yiru-app'
import { getStoreState, waitForSessionReady } from './helpers/store'

test.describe('usage overview', () => {
  test.beforeEach(async ({ yiruPage }) => {
    await waitForSessionReady(yiruPage)
  })

  test('Stats & Usage opens on the combined overview with provider controls', async ({
    yiruPage
  }) => {
    await yiruPage.evaluate(() => {
      const state = window.__store!.getState()
      state.openSettingsPage()
    })

    await expect
      .poll(async () => getStoreState<string>(yiruPage, 'activeView'), { timeout: 5_000 })
      .toBe('settings')
    await yiruPage.getByRole('button', { name: 'Stats & Usage' }).click()
    await expect(yiruPage.getByRole('heading', { name: 'Usage Analytics' })).toBeVisible()
    const providerDropdown = yiruPage.getByTestId('usage-provider-select')
    await expect(providerDropdown).toHaveAttribute(
      'aria-label',
      'Usage analytics provider: Overview'
    )
    await expect(yiruPage.getByTestId('usage-overview-pane')).toBeVisible()
    await expect(yiruPage.getByRole('heading', { name: 'Usage Overview' })).toBeVisible()
    await expect(yiruPage.getByRole('heading', { name: 'Providers' })).toBeVisible()
    await expect(yiruPage.getByRole('button', { name: 'Enable Claude' })).toBeVisible()
    await expect(yiruPage.getByRole('button', { name: 'Enable Codex' })).toBeVisible()
    await expect(yiruPage.getByRole('button', { name: 'Enable OpenCode' })).toBeVisible()

    await providerDropdown.click()
    await yiruPage.getByRole('menuitem', { name: 'Codex', exact: true }).click()
    await expect(yiruPage.getByRole('heading', { name: 'Codex Usage Tracking' })).toBeVisible()
    await expect(providerDropdown).toHaveAttribute('aria-label', 'Usage analytics provider: Codex')

    await providerDropdown.click()
    await yiruPage.getByRole('menuitem', { name: 'OpenCode', exact: true }).click()
    await expect(yiruPage.getByRole('heading', { name: 'OpenCode Usage Tracking' })).toBeVisible()
    await expect(providerDropdown).toHaveAttribute(
      'aria-label',
      'Usage analytics provider: OpenCode'
    )
  })
})
