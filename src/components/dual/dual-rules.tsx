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
      <details id="rules" className="dual-card group/section p-4 sm:p-5 bg-[#050910]">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">How Dual Crash works</h2>
           
          </div>
          <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
            ＋
          </span>
        </summary>

        <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {RULES.map((rule, index) => (
            <li key={rule.title} className="rounded-xl">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg  text-[#ffffff]">
                  {index + 1}
                </span>
                <h3 className="text-[13px] font-bold text-white">{rule.title}</h3>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--t-muted)]">
                {rule.body}
              </p>
            </li>
          ))}
        </ol>
      </details>

      <div className="grid gap-3 ">
        <details className="dual-card group/section p-4 sm:p-5 bg-[#050910]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">Payouts &amp; fees</h2>
            <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
              ＋
            </span>
          </summary>
         

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
            <li>
              • The fee is taken from the pot when a winner is paid, never from a single player.
            </li>
            <li>• PUSD is a 2-decimal CashToken, so every amount is exact to the base unit.</li>
           
          </ul>
        </details>
      </div>

      <details className="dual-card group/section p-4 sm:p-5 bg-[#050910]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">Edge cases</h2>
          <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
            ＋
          </span>
        </summary>
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
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--t-muted)]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </details>
    </div>
  )
}
