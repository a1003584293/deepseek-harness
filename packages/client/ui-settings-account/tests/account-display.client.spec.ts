/** Display facts every account surface reads from one account snapshot. */
import { expect, it } from 'vitest'
import { balanceTextOf, displayNameOf } from '../src/client/account-display.ts'

const wallet = (balance: string, currency: 'CNY' | 'USD' = 'CNY') => ({ currency, balance })
it('reads the profile name only from a ready profile', () => {
  expect(displayNameOf(undefined)).toBeUndefined()
  expect(displayNameOf({})).toBeUndefined()
  expect(displayNameOf({ profile: { status: 'failed' } })).toBeUndefined()
  expect(displayNameOf({ profile: { status: 'ready', value: { id: null, name: null, contact: null } } })).toBeUndefined()
  expect(displayNameOf({ profile: { status: 'ready', value: { id: null, name: 'User', contact: null } } })).toBe('User')
})

it('renders recharge wallets with the Account settings currency rules', () => {
  expect(balanceTextOf(undefined)).toBeUndefined()
  expect(balanceTextOf({})).toBeUndefined()
  expect(balanceTextOf({ balance: { status: 'failed' } })).toBeUndefined()
  // Bonus wallets never reach the status line.
  expect(balanceTextOf({ balance: { status: 'ready', value: [], bonusWallets: [wallet('9.99')] } })).toBeUndefined()
  // The Platform balance can carry sub-cent precision: truncate, never round.
  expect(balanceTextOf({ balance: { status: 'ready', value: [wallet('2.335')], bonusWallets: [] } })).toBe('¥2.33')
  expect(balanceTextOf({ balance: { status: 'ready', value: [wallet('1234.56999'), wallet('0.001', 'USD')], bonusWallets: [] } }))
    .toBe('¥1,234.56 <$0.01')
})
