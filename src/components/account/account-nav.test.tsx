import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountNav } from './account-nav'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

afterEach(cleanup)

const props = {
  name: 'Wallet Smoke Test',
  username: null,
  imageUrl: null,
  xp: 120,
  claimAvailable: true,
  balanceSats: '123456',
  platformAddress: 'bchtest:qtestaddress',
  network: 'chipnet',
  connectedAddress: 'bchtest:qpayoutaddress',
  withdrawalFeeSats: '1000',
}

describe('AccountNav', () => {
  it('links the profile menu item to the profile page', () => {
    render(<AccountNav {...props} />)

    fireEvent.click(screen.getByLabelText('Account menu'))

    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/profile')
  })

  it('opens the wallet dialog from the profile menu', () => {
    render(<AccountNav {...props} />)

    fireEvent.click(screen.getByLabelText('Account menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Wallet' }))

    expect(screen.getByRole('dialog', { name: 'Wallet' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Wallet' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Withdraw' })).toBeInTheDocument()
    expect(screen.getByText('Deposit address')).toBeInTheDocument()
    expect(screen.getByText('bchtest:qtestaddress')).toBeInTheDocument()
  })

  it('switches the wallet dialog to the withdraw tab', () => {
    render(<AccountNav {...props} />)

    fireEvent.click(screen.getByLabelText('Account menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Wallet' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Withdraw' }))

    expect(screen.getByText('Amount (sats)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
  })
})
