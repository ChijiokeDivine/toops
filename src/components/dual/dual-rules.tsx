const RULES = [
  {
    title: 'Queue at the same stake',
    body: 'Pick a preset or a custom PUSD amount and join the queue. You are paired with a random player who chose the exact same stake. Your stake is locked as soon as you queue.',
  },
  {
    title: 'Both players load, then launch',
    body: 'The round does not start until both players are on the match screen. A short countdown begins once both are ready. If someone drops before launch, the match is cancelled and both stakes are refunded.',
  },
  {
    title: 'Cash out before the crash',
    body: 'Press Cash out (or Space) while the rocket is flying. Your cashout is recorded at the server-authoritative multiplier. Cashouts stay hidden from the other player until the round ends.',
  },
  {
    title: 'Last cashout wins the pot',
    body: 'If both players cash out, the later cashout takes the whole pot and the earlier cashout receives nothing. If only one player cashes out and the rocket crashes, that player wins. If neither cashes out, the same stakes replay automatically with a fresh server seed and nonce.',
  },
]

const FAQ = [
  {
    question: 'What happens if I disconnect?',
    answer:
      'Before launch, a missed heartbeat cancels the match and refunds both stakes. After launch there is no auto-cashout: you risk crashing like everyone else. Reconnect to see the settled result.',
  },
  {
    question: 'Can I cancel a match?',
    answer:
      'Yes, while the match is waiting or counting down. Cancelling refunds both players in full. Once the rocket is flying, the round cannot be cancelled.',
  },
  {
    question: 'What if both players bust?',
    answer:
      'The match enters a short intermission, then replays automatically with the same locked stakes and a new server seed, nonce, and crash point. No fee is charged until a winner exists.',
  },
  {
    question: 'How are disputes handled?',
    answer:
      'Use “Report issue” on the result screen. A dispute raised before launch cancels and refunds the match. A dispute raised after launch flags the round for review while preserving the settled result and its verification data.',
  },
  {
    question: 'Can the result be invalid?',
    answer:
      'Every round can be recomputed from the revealed seeds. If the stored crash point does not match the HMAC result, the match is flagged with an integrity failure and is reviewable.',
  },
]

export function DualRules() {
  return (
    <div className="mt-4 space-y-3">
      <section id="rules" className="dual-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">How Dual Crash works</h2>
            <p className="mt-0.5 text-[12px] text-[var(--t-muted)]">
              Everything is server-authoritative. The UI only animates between polls.
            </p>
          </div>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
            Rules
          </span>
        </div>

        <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {RULES.map((rule, index) => (
            <li
              key={rule.title}
              className="rounded-xl border border-white/[0.06] bg-[#070b13]/55 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[#00fa7f]/20 bg-[#00fa7f]/10 text-[11px] font-black text-[#00fa7f]">
                  {index + 1}
                </span>
                <h3 className="text-[13px] font-bold text-white">{rule.title}</h3>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--t-muted)]">{rule.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="dual-card p-4 sm:p-5">
          <h2 className="text-lg font-bold text-white">Payouts &amp; fees</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--t-muted)]">
            Both stakes form one pot. The platform fee is 1% of the pot, rounded down to the nearest
            PUSD base unit. The winner receives the rest.
          </p>

          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06]">
            <div className="grid grid-cols-4 gap-2 bg-white/[0.04] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--t-muted)]">
              <span>Each stake</span>
              <span className="text-right">Pot</span>
              <span className="text-right">1% fee</span>
              <span className="text-right">Winner</span>
            </div>
            {[
              ['$1.00', '$2.00', '$0.02', '$1.98'],
              ['$2.00', '$4.00', '$0.04', '$3.96'],
              ['$10.00', '$20.00', '$0.20', '$19.80'],
              ['$50.00', '$100.00', '$1.00', '$99.00'],
            ].map((row) => (
              <div
                key={row[0]}
                className="grid grid-cols-4 gap-2 border-t border-white/[0.04] px-3 py-2 text-[11px] tabular-nums text-white/70"
              >
                <span>{row[0]}</span>
                <span className="text-right">{row[1]}</span>
                <span className="text-right text-white/45">{row[2]}</span>
                <span className="text-right font-semibold text-[#00fa7f]">{row[3]}</span>
              </div>
            ))}
          </div>

          <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-[var(--t-muted)]">
            <li>• No fee on a cancelled match or a both-bust replay.</li>
            <li>• The fee is taken from the pot when a winner is paid, never from a single player.</li>
            <li>• PUSD is a 2-decimal CashToken, so every amount is exact to the base unit.</li>
            <li>• Maximum multiplier cap: 100,000.00x.</li>
          </ul>
        </section>

        <section className="dual-card p-4 sm:p-5">
          <h2 className="text-lg font-bold text-white">Randomness &amp; provable fairness</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--t-muted)]">
            The crash point is not chosen by the client and is not changed after launch. It is derived
            from three inputs that are fixed before the round starts.
          </p>

          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-white/[0.06] bg-[#070b13]/55 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#00fa7f]">
                HMAC-SHA256(serverSeed, sortedClientSeeds + &quot;:&quot; + nonce)
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--t-muted)]">
                Take the first 8 hex characters as an unsigned 32-bit integer <code>h</code>, then
                compute <code>crash = 2³² / (2³² − h)</code>. Floor to two decimals, with a 1.01x floor
                and a 100,000x cap.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <p className="text-[10px] font-semibold text-white/75">Server seed</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--t-muted)]">
                  Generated per round. Only its SHA-256 hash is published before launch. The seed is
                  revealed when the round ends.
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <p className="text-[10px] font-semibold text-white/75">Client seeds</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--t-muted)]">
                  Each player has a client seed. Both are snapshotted when the match starts and
                  revealed with the server seed. You can rotate yours between matches.
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <p className="text-[10px] font-semibold text-white/75">Nonce</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--t-muted)]">
                  Starts at 0 and increments for every automatic replay, so a replayed round cannot
                  reuse the same crash point.
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <p className="text-[10px] font-semibold text-white/75">Verification</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--t-muted)]">
                  Recompute the HMAC and crash point from the fairness panel, or call{' '}
                  <code>/api/dual/verify?matchId=…</code>. A mismatch flags the match.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="dual-card p-4 sm:p-5">
        <h2 className="text-lg font-bold text-white">Edge cases</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FAQ.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-white/[0.06] bg-[#070b13]/55 p-3 open:border-white/[0.1]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-semibold text-white/80">
                {item.question}
                <span className="text-white/30 transition group-open:rotate-45">＋</span>
              </summary>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--t-muted)]">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
