'use client'

import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { openAuth, type AuthMode, type AuthView } from './auth-events'

type AuthTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  view?: AuthView
  mode?: AuthMode
}

/**
 * A button that opens the auth popup. Rendered by server components such as
 * the header and hero so no auth form is ever shown inline.
 */
export function AuthTrigger({
  view = 'telegram',
  mode = 'sign-in',
  onClick,
  type,
  ...props
}: AuthTriggerProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event)
    if (!event.defaultPrevented) openAuth({ view, mode })
  }

  return <button {...props} type={type ?? 'button'} onClick={handleClick} />
}
