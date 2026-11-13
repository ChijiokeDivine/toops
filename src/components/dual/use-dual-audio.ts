'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useSoundMuted } from '@/components/settings/use-sound-muted'

export type DualSound = 'tick' | 'launch' | 'cashout' | 'crash' | 'win' | 'lose' | 'queue' | 'click'

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const global = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return global.AudioContext ?? global.webkitAudioContext ?? null
}

/**
 * Tiny synthesized sound kit: no asset downloads, no autoplay violations.
 * The first user gesture creates/resumes the AudioContext.
 */
export function useDualAudio() {
  const contextRef = useRef<AudioContext | null>(null)
  const { muted, mutedRef, toggle } = useSoundMuted()

  const ensureContext = useCallback((): AudioContext | null => {
    const Ctor = audioContextCtor()
    if (!Ctor) return null
    if (!contextRef.current) {
      contextRef.current = new Ctor()
    }
    const context = contextRef.current
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
    return context
  }, [])

  const tone = useCallback(
    (
      context: AudioContext,
      options: {
        frequency: number
        endFrequency?: number
        duration: number
        delay?: number
        type?: OscillatorType
        volume?: number
      },
    ) => {
      const start = context.currentTime + 0.01 + (options.delay ?? 0)
      const end = start + options.duration
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = options.type ?? 'sine'
      oscillator.frequency.setValueAtTime(options.frequency, start)
      if (options.endFrequency != null) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFrequency), end)
      }
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(options.volume ?? 0.05, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(end + 0.02)
    },
    [],
  )

  const noise = useCallback(
    (
      context: AudioContext,
      options: { duration: number; volume?: number; cutoff?: number; delay?: number },
    ) => {
      const start = context.currentTime + 0.01 + (options.delay ?? 0)
      const length = Math.max(1, Math.floor(context.sampleRate * options.duration))
      const buffer = context.createBuffer(1, length, context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < length; index++) {
        const decay = 1 - index / length
        data[index] = (Math.random() * 2 - 1) * decay
      }
      const source = context.createBufferSource()
      source.buffer = buffer
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = options.cutoff ?? 1_200
      const gain = context.createGain()
      gain.gain.setValueAtTime(options.volume ?? 0.08, start)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)
      source.connect(filter).connect(gain).connect(context.destination)
      source.start(start)
    },
    [],
  )

  const play = useCallback(
    (sound: DualSound) => {
      if (mutedRef.current) return
      const context = ensureContext()
      if (!context) return

      switch (sound) {
        case 'tick':
          tone(context, { frequency: 880, duration: 0.07, type: 'square', volume: 0.025 })
          break
        case 'launch':
          noise(context, { duration: 0.45, volume: 0.1, cutoff: 900 })
          tone(context, {
            frequency: 110,
            endFrequency: 520,
            duration: 0.5,
            type: 'sawtooth',
            volume: 0.04,
          })
          break
        case 'cashout':
          tone(context, { frequency: 740, duration: 0.09, volume: 0.06 })
          tone(context, { frequency: 1_108, duration: 0.14, delay: 0.07, volume: 0.05 })
          break
        case 'crash':
          noise(context, { duration: 0.65, volume: 0.16, cutoff: 500 })
          tone(context, {
            frequency: 130,
            endFrequency: 38,
            duration: 0.55,
            type: 'sawtooth',
            volume: 0.09,
          })
          break
        case 'win':
          ;[523.25, 659.25, 783.99, 1_046.5].forEach((frequency, index) => {
            tone(context, {
              frequency,
              duration: 0.22,
              delay: index * 0.09,
              type: 'triangle',
              volume: 0.06,
            })
          })
          break
        case 'lose':
          tone(context, {
            frequency: 240,
            endFrequency: 90,
            duration: 0.45,
            type: 'triangle',
            volume: 0.07,
          })
          break
        case 'queue':
          tone(context, {
            frequency: 440,
            endFrequency: 720,
            duration: 0.16,
            type: 'sine',
            volume: 0.05,
          })
          break
        case 'click':
          tone(context, { frequency: 620, duration: 0.045, volume: 0.03 })
          break
      }
    },
    [ensureContext, noise, tone],
  )

  const toggleMuted = useCallback(() => {
    const next = toggle()
    if (!next) {
      // Unmuting: give a tiny confirmation.
      window.setTimeout(() => {
        play('click')
      }, 0)
    }
  }, [play, toggle])

  useEffect(() => {
    return () => {
      contextRef.current?.close().catch(() => undefined)
      contextRef.current = null
    }
  }, [])

  return { play, muted, toggleMuted }
}
