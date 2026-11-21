import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
const uid = '00000000-0000-4000-8000-000000000001'
const cid = '00000000-0000-4000-8000-000000000002'
// All fixture data is synthetic. Never contact the real backend in this suite.
async function backend(page: Page, signedIn = false) {
  await page.route('https://*.supabase.co/**', async route => {
    const u = new URL(route.request().url())
    if (u.pathname.startsWith('/auth/')) return route.fulfill({ json: { user: { id: uid, email: 'example@example.invalid' } } })
    const table = u.pathname.split('/').pop()
    const fixtures: Record<string, unknown> = {
      profiles: { id: uid, name: 'Pessoa Exemplo', email: 'example@example.invalid', phone: '', color: '#7c3aed', circle_id: cid },
      circles: { id: cid, name: 'Família Exemplo', owner_id: uid, invite_code: 'ABC234' },
      circle_members: [{ user_id: uid }],
      locations: [{ user_id: uid, name: 'Pessoa Exemplo', color: '#7c3aed', lat: null, lng: null, accuracy: null, battery: null, charging: null, sharing: true, updated_at: null }],
      places: [], events: [], shares: [], checkins: [], history: [], get_share: [],
    }
    return route.fulfill({ json: fixtures[table || ''] || [] })
  })
  await page.route('https://*.tile.openstreetmap.org/**', route => route.fulfill({ status: 204 }))
  if (signedIn) {
    const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: uid, exp: 4102444800, aud: 'authenticated', role: 'authenticated' })).toString('base64url') + '.fixture'
    await page.addInitScript(({ token, uid }) => localStorage.setItem('sb-otaecjtrkyfzydimnydj-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic-only', token_type: 'bearer', expires_in: 31536000, expires_at: 4102444800, user: { id: uid, email: 'example@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } })), { token, uid })
  }
}

test('login and signup remain navigable and accessible on mobile', async ({ page }) => {
  await backend(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.getByRole('link', { name: 'Criar uma conta gratuita' }).click()
  await expect(page.getByRole('heading', { name: 'Criar sua conta' })).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
})

test('SOS is honest, keyboard accessible and never submitted by opening', async ({ page }) => {
  await backend(page, true)
  let posts = 0
  page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/rest/v1/events')) posts++ })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Enviar SOS', exact: true })
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('não aciona serviços de emergência')
  await expect(page.getByRole('dialog')).toContainText('confirmação de leitura')
  const cancel = page.getByRole('button', { name: 'Cancelar', exact: true })
  await cancel.focus(); await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(posts).toBe(0)
  await page.screenshot({ path: 'test-results/mapa-mobile.png' })
})

test('settings explain pause and switch has a name', async ({ page }) => {
  await backend(page, true)
  await page.goto('/ajustes')
  await expect(page.getByRole('switch', { name: 'Compartilhar minha localização' })).toBeVisible()
  await expect(page.getByText('Pausar interrompe novas atualizações.', { exact: false })).toBeVisible()
  await page.screenshot({ path: 'test-results/ajustes-mobile.png', fullPage: true })
})

test('expired public share does not reveal coordinates', async ({ page }) => {
  await backend(page)
  await page.goto('/s/syntheticinvalidtoken1234567890')
  await expect(page.getByRole('heading', { name: 'Este link expirou' })).toBeVisible()
  await expect(page.locator('.leaflet-container')).toHaveCount(0)
})
