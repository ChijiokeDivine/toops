export const GAME_COUNT = 5

export type Category = {
  slug: 'multiplayer' | 'dual'
  title: string
  playing: number
  href: string
  /** Put the image in /public and set the path, e.g. '/img/casino.png' */
  image?: string
}

export const CATEGORIES: Category[] = [
  {
    slug: 'multiplayer',
    title: 'Multiplayer',
    playing: 1233,
    href: '/multiplayer',
    image: '/images/multiplayer.webp',
  },
  { slug: 'dual', title: 'Dual', playing: 1660, href: '/dual', image: '/images/dual.webp' },
]

export type Game = {
  slug: string
  name: string
  /** Placeholder background, hidden behind the artwork once you add `image` */
  gradient: string
  /** e.g. '/games/slide.png' (portrait, ~3:4) */
  image?: string
}

export const ORIGINALS: Game[] = [
  {
    slug: 'pocket-dice',
    name: 'Pocket Dice',
    gradient: 'linear-gradient(180deg,#05080c 0%,#0a2a2e 45%,#19d6c6 100%)',
    image: '/images/dice.webp',
  },
  {
    slug: 'twist',
    name: 'Twist',
    gradient: 'linear-gradient(180deg,#a33af0 0%,#6a15c9 55%,#34086f 100%)',
    image: '/images/twist.webp',
  },
  {
    slug: 'Rando',
    name: 'Rando',
    gradient: 'linear-gradient(180deg,#2a0626 0%,#c0278f 45%,#ff63c8 100%)',
    image: '/images/rando1.webp',
  },
  {
    slug: 'mines',
    name: 'Mines',
    gradient: 'linear-gradient(180deg,#07130f 0%,#0b6b4a 60%,#17d98a 100%)',
    image: '/images/mines.webp',
  },
  {
    slug: 'crash',
    name: 'Crash',
    gradient: 'linear-gradient(180deg,#2a0a0a 0%,#c8321e 55%,#ff8a3d 100%)',
    image: '/images/crash1.webp',
  },
]
