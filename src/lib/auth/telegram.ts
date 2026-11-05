import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

export type TelegramUser = {
  id: string
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
}

type TelegramAuthPayload = Record<string, string>

const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24

/**
 * Verify data returned by the Telegram Login Widget.
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(payload: TelegramAuthPayload): TelegramUser | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return null

  const { hash, ...data } = payload
  if (!hash || !data.id || !data.auth_date) return null

  const dataCheckString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n')

  const secret = createHash('sha256').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')

  const expectedBuffer = Buffer.from(expected, 'hex')
  const receivedBuffer = Buffer.from(hash, 'hex')
  if (expectedBuffer.length !== receivedBuffer.length) return null
  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) return null

  const authDate = Number(data.auth_date)
  if (!Number.isFinite(authDate)) return null
  if (Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) return null

  return {
    id: data.id,
    firstName: data.first_name ?? 'Telegram user',
    lastName: data.last_name,
    username: data.username,
    photoUrl: data.photo_url,
  }
}
