import { describe, expect, it } from 'vitest'
import { takeJsonMessages } from './electrum'

describe('takeJsonMessages', () => {
  it('splits back-to-back responses sent without a trailing newline', () => {
    const frame = '{"id":1,"result":["Fulcrum 2.1.4"]}{"id":2,"result":[]}'

    expect(takeJsonMessages(frame)).toEqual({
      messages: ['{"id":1,"result":["Fulcrum 2.1.4"]}', '{"id":2,"result":[]}'],
      rest: '',
    })
  })

  it('keeps a partial frame buffered until the rest arrives', () => {
    const { messages, rest } = takeJsonMessages('{"id":1,"result":["Ful')

    expect(messages).toEqual([])
    expect(rest).toBe('{"id":1,"result":["Ful')
  })

  it('handles newline-delimited responses and surrounding whitespace', () => {
    expect(takeJsonMessages('{"id":1}\n {"id":2}\n')).toEqual({
      messages: ['{"id":1}', '{"id":2}'],
      rest: '',
    })
  })

  it('ignores braces inside JSON strings', () => {
    const frame = '{"id":1,"result":{"note":"a } b {"}}'

    expect(takeJsonMessages(frame)).toEqual({ messages: [frame], rest: '' })
  })

  it('resumes parsing after a complete frame', () => {
    expect(takeJsonMessages('{"id":1}{"id":2,"result":{"partial":')).toEqual({
      messages: ['{"id":1}'],
      rest: '{"id":2,"result":{"partial":',
    })
  })
})
