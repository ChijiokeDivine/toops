import { CategoryCard } from './_components/category-card'
import { CATEGORIES, GAME_COUNT, ORIGINALS } from './_components/data'
import { GameSearch } from './_components/game-search'
import { Hero } from './_components/hero'
import { OriginalsRow } from './_components/originals-row'

export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-10">
      <div className="grid gap-2.5 lg:grid-cols-[1.7fr_1fr]">
        <Hero />

        <div className="grid gap-2.5 lg:h-72 lg:grid-rows-2">
          {CATEGORIES.map((category) => (
            <CategoryCard key={category.slug} {...category} />
          ))}
        </div>
      </div>

      <div className="mt-4 lg:max-w-md">
        <GameSearch count={GAME_COUNT} />
      </div>

      <div className="mt-7 space-y-7">
        <OriginalsRow games={ORIGINALS} />
      </div>
    </main>
  )
}
