import Image from 'next/image'
import { ImageIcon } from './icons'

type MediaSlotProps = {
  /** Path in /public (e.g. "/img/roulette.png"). Leave empty to show the placeholder. */
  src?: string
  alt?: string
  label?: string
  /** 'box' = dashed placeholder panel, 'bare' = just a faint icon */
  variant?: 'box' | 'bare'
  fit?: 'cover' | 'contain'
  /** Must position the slot (e.g. "absolute inset-0") so <Image fill> has a parent to fill. */
  className?: string
  priority?: boolean
}

export function MediaSlot({
  src,
  alt = '',
  label = 'Image',
  variant = 'box',
  fit = 'cover',
  className = '',
  priority,
}: MediaSlotProps) {
  if (src) {
    return (
      <div className={className}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 25vw, 60vw"
          className={fit === 'cover' ? 'object-cover' : 'object-contain'}
        />
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className={`flex flex-col items-center justify-center gap-1 text-white/30 ${
        variant === 'box' ? 'rounded-2xl border border-dashed border-white/15 bg-white/[0.03]' : ''
      } ${className}`}
    >
      <ImageIcon className="h-6 w-6" />
      {variant === 'box' && (
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      )}
    </div>
  )
}
