import 'server-only'

import type { User } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ensurePlatformWallet } from '@/lib/wallet/platform-wallet'
import type { TelegramUser } from './telegram'

export async function ensureTelegramUser(telegram: TelegramUser): Promise<User> {
  const displayName = [telegram.firstName, telegram.lastName].filter(Boolean).join(' ')

  const user = await prisma.user.upsert({
    where: { telegramId: telegram.id },
    update: {
      displayName,
      telegramUsername: telegram.username ?? null,
      telegramPhotoUrl: telegram.photoUrl ?? null,
    },
    create: {
      telegramId: telegram.id,
      displayName,
      telegramUsername: telegram.username ?? null,
      telegramPhotoUrl: telegram.photoUrl ?? null,
    },
  })

  await ensurePlatformWallet(user.id)
  return user
}

export async function ensureBchUser(address: string): Promise<User> {
  const user = await prisma.user.upsert({
    where: { bchAddress: address },
    update: {},
    create: {
      bchAddress: address,
      displayName: `BCH ${address.slice(-6)}`,
    },
  })

  await ensurePlatformWallet(user.id)
  return user
}
