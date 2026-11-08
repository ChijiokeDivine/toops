export const AUTH_EVENT = 'toops:auth'

export type AuthView = 'telegram' | 'wallet'
export type AuthMode = 'sign-in' | 'link'

export type AuthRequest = {
  view?: AuthView
  mode?: AuthMode
}

/**
 * Opens the global auth popup from any client component.
 * The dialog itself is mounted once in the root layout.
 */
export function openAuth(request: AuthRequest = {}): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent<AuthRequest>(AUTH_EVENT, { detail: request }))
}
