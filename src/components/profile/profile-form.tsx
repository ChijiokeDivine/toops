'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type ChangeEvent } from 'react'
import { UploadIcon, UserIcon } from '@/app/_components/icons'

type ProfileFormProps = {
  initialUsername: string | null
  initialEmail: string | null
  initialAvatarUrl: string | null
}

type Field = 'avatar' | 'username' | 'email'
type Feedback = { ok: boolean; text: string }

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_FILE_BYTES = 2 * 1024 * 1024
const AVATAR_SIZE = 256

/** Downscales the picked image before storing it, so avatars stay small. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, AVATAR_SIZE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to process that image.')

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return canvas.toDataURL('image/jpeg', 0.85)
}

const fieldShell = 'rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-4 lg:p-5'
const labelClass = 'text-sm font-medium text-white'
const inputClass =
  'h-11 min-w-0 flex-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3.5 text-sm text-white outline-none transition placeholder:text-[var(--t-muted)] focus:border-[var(--t-green)]'
const saveClass =
  'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--t-green)] px-5 text-sm font-semibold text-[var(--t-green-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45'

export function ProfileForm({ initialUsername, initialEmail, initialAvatarUrl }: ProfileFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [username, setUsername] = useState(initialUsername ?? '')
  const [email, setEmail] = useState(initialEmail ?? '')
  const [avatar, setAvatar] = useState(initialAvatarUrl)
  const [pending, setPending] = useState<Field | null>(null)
  const [feedback, setFeedback] = useState<Partial<Record<Field, Feedback>>>({})

  const usernameDirty = username.trim() !== (initialUsername ?? '')
  const emailDirty = email.trim().toLowerCase() !== (initialEmail ?? '')
  const usernameValid = username.trim().length >= 2 && username.trim().length <= 24

  async function save(field: Field, patch: Record<string, string | null>): Promise<boolean> {
    setPending(field)
    setFeedback((current) => ({ ...current, [field]: undefined }))

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to save your profile right now.')
      }

      setFeedback((current) => ({
        ...current,
        [field]: { ok: true, text: field === 'avatar' ? 'Avatar updated.' : 'Saved.' },
      }))
      router.refresh()
      return true
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [field]: {
          ok: false,
          text: error instanceof Error ? error.message : 'Unable to save your profile right now.',
        },
      }))
      return false
    } finally {
      setPending(null)
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!AVATAR_TYPES.includes(file.type)) {
      setFeedback((current) => ({
        ...current,
        avatar: { ok: false, text: 'Choose a PNG, JPG, GIF, or WebP image.' },
      }))
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      setFeedback((current) => ({
        ...current,
        avatar: { ok: false, text: 'That image is larger than 2 MB.' },
      }))
      return
    }

    const previous = avatar
    try {
      const dataUrl = await toAvatarDataUrl(file)
      setAvatar(dataUrl)
      const saved = await save('avatar', { avatarUrl: dataUrl })
      if (!saved) setAvatar(previous)
    } catch (error) {
      setAvatar(previous)
      setFeedback((current) => ({
        ...current,
        avatar: {
          ok: false,
          text: error instanceof Error ? error.message : 'Unable to process that image.',
        },
      }))
    }
  }

  return (
    <div className="space-y-3">
      <section className={fieldShell}>
        <p className={labelClass}>Avatar</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="Your avatar" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-[var(--t-surface-2)] text-[var(--t-muted)]">
              <UserIcon className="h-8 w-8" />
            </span>
          )}

          <div className="min-w-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending !== null}
              className={saveClass}
            >
              <UploadIcon className="mr-2 h-4 w-4" />
              {pending === 'avatar' ? 'Uploading…' : 'Upload'}
            </button>
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              Supported files: All common image formats (PNG, JPG, GIF, WebP etc.) · Max 2 MB
            </p>
            {feedback.avatar && (
              <p
                role="status"
                className={`mt-1 text-xs ${
                  feedback.avatar.ok ? 'text-[var(--t-green)]' : 'text-red-400'
                }`}
              >
                {feedback.avatar.text}
              </p>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={AVATAR_TYPES.join(',')}
          onChange={(event) => void handleAvatarChange(event)}
          className="sr-only"
          aria-label="Upload avatar"
        />
      </section>

      <section className={fieldShell}>
        <label htmlFor="profile-username" className={labelClass}>
          Your username
        </label>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="profile-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Choose a username"
            maxLength={24}
            autoComplete="username"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void save('username', { displayName: username.trim() })}
            disabled={pending !== null || !usernameDirty || !usernameValid}
            className={saveClass}
          >
            {pending === 'username' ? 'Saving…' : 'Save'}
          </button>
        </div>
        {feedback.username && (
          <p
            role="status"
            className={`mt-2 text-xs ${
              feedback.username.ok ? 'text-[var(--t-green)]' : 'text-red-400'
            }`}
          >
            {feedback.username.text}
          </p>
        )}
      </section>

      <section className={fieldShell}>
        <label htmlFor="profile-email" className={labelClass}>
          Email address
        </label>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            maxLength={254}
            autoComplete="email"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void save('email', { email: email.trim() || null })}
            disabled={pending !== null || !emailDirty}
            className={saveClass}
          >
            {pending === 'email' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--t-muted)]">
          Used for account recovery and important updates only.
        </p>
        {feedback.email && (
          <p
            role="status"
            className={`mt-1 text-xs ${
              feedback.email.ok ? 'text-[var(--t-green)]' : 'text-red-400'
            }`}
          >
            {feedback.email.text}
          </p>
        )}
      </section>
    </div>
  )
}
