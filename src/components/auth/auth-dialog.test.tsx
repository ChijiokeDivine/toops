import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthDialog } from './auth-dialog'
import { openAuth } from './auth-events'
import { AuthTrigger } from './auth-trigger'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

afterEach(cleanup)

describe('auth popup', () => {
  it('opens when an auth trigger is clicked', () => {
    render(
      <>
        <AuthTrigger>Sign in</AuthTrigger>
        <AuthDialog />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('dialog', { name: 'Sign in to toops' })).toBeInTheDocument()
  })

  it('opens a request that arrived before the dialog mounted', async () => {
    openAuth({ view: 'telegram' })

    render(<AuthDialog />)

    expect(await screen.findByRole('dialog', { name: 'Sign in to toops' })).toBeInTheDocument()
  })
})
