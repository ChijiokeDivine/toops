export const AUTH_EVENT = 'toops:auth'

export type AuthView = 'telegram' | 'wallet'
export type AuthMode = 'sign-in' | 'link'

export type AuthRequest = {
  view?: AuthView
  mode?: AuthMode
}

/**
 * A request can be dispatched before the dialog finishes hydrating. Keep the
 * latest one around so the dialog can pick it up on mount instead of losing it.
 */
let pendingRequest: AuthRequest | null = null

/**
 * Opens the global auth popup from any client component.
 * The dialog itself is mounted once in the root layout.
 */
export function openAuth(request: AuthRequest = {}): void {
  if (typeof window === 'undefined') return

  pendingRequest = request
  window.dispatchEvent(new CustomEvent<AuthRequest>(AUTH_EVENT, { detail: request }))
}

/** Returns the request buffered before the dialog was ready, if any. */
export function consumePendingAuth(): AuthRequest | null {
  const request = pendingRequest
  pendingRequest = null
  return request
}
