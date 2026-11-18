/** Account state and presentation extension points shared with client plugins. */
import type { AccountClientMetadata, AccountView } from '@deepseek-ai/dsh-deepseek-account/types'

/** Latest account-stream availability and display-ready account facts, without notification state. */
export interface AccountUiState {
  readonly view: AccountView | undefined
  readonly failed: boolean
  /** Signed-in profile name, once the profile read is ready. */
  readonly displayName: string | undefined
  /** Recharge balance text formatted exactly like the Account settings rows; absent while loading, unavailable, or empty. */
  readonly balanceText: string | undefined
}

/** Read the account stream already owned by the account settings plugin. */
export interface AccountUi {
  /** Read the current state from the existing account snapshot.
   * @returns the latest account state.
   */
  getSnapshot(): AccountUiState
  /** Subscribe to account snapshot changes, including profile and balance reads.
   * @param listener - called after the snapshot is replaced.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void
  /** Build metadata for one account request.
   * @param locale - requested language.
   * @returns this client's version, language, and timezone.
   */
  clientMetadata(locale: string): AccountClientMetadata
}

/** Account presentation facts supplied to its notification extension. */
export interface AccountNotificationsOwnerProps {
  /** Whether a signed-in account can display notifications outside onboarding. */
  active: boolean
  /** Open the account section in the existing settings shell. */
  openAccount: () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context { accountUi: AccountUi }
  interface Events {
    /** Account stream update or loss of access. @mode parallel
     * @param state - latest account state.
     * @param reset - whether account availability, credentials, or the connection lifetime changed.
     */
    'account-ui/change'(state: AccountUiState, reset: boolean): void
    /** Explicit account refresh from Settings or a returned Platform page. @mode parallel */
    'account-ui/refresh'(): Promise<void>
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Notifications in the row above the account launcher; the contribution owns its markup and lifecycle. */
    'settings.launcher.notifications': { kind: 'single'; scope: 'root'; owner: AccountNotificationsOwnerProps }
  }
}
