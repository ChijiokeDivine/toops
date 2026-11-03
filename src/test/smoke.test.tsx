import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Home from '@/app/page'

describe('Home', () => {
  it('renders the project name', () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: 'toops' })).toBeInTheDocument()
  })
})
