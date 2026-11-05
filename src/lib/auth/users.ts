import 'server-only'

import type { User } from '@prisma/client'
import { Prisma } from '@prisma/client'
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

export class WalletAlreadyLinkedError extends Error {
  constructor() {
    super('That wallet is already linked to another account.')
    this.name = 'WalletAlreadyLinkedError'
  }
}

/** Links a verified payout wallet to an existing (e.g. Telegram) account. */
export async function linkBchAddress(userId: string, address: string): Promise<User> {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: { bchAddress: address },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new WalletAlreadyLinkedError()
    }
    throw error
  }
}
