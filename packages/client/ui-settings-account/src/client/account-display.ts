/** Display facts derived once per account snapshot for every account surface. */
import type { AccountDetails } from '@deepseek-ai/dsh-deepseek-account/types'
import { formatBalance } from './formatBalance.ts'

/**
 * Read the signed-in profile name once the profile read is ready.
 * @param details - sanitized profile and balance outcomes, absent while loading.
 * @returns the profile name, or undefined while it is not ready.
 */
export function displayNameOf(details: Partial<AccountDetails> | undefined): string | undefined {
  const profile = details?.profile
  return profile?.status === 'ready' ? profile.value.name ?? undefined : undefined
}

/**
 * Render recharge wallets with the Account settings currency rules.
 * Bonus wallets stay off the status line; consumers receive one display text and
 * never reformat a raw balance, so every surface truncates cents identically.
 * @param details - sanitized profile and balance outcomes, absent while loading.
 * @returns space-separated wallet text, or undefined when no recharge balance is known.
 */
export function balanceTextOf(details: Partial<AccountDetails> | undefined): string | undefined {
  const balance = details?.balance
  if (balance?.status !== 'ready' || balance.value.length === 0) return undefined
  return balance.value.map(wallet => formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$')).join(' ')
}
