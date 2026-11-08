import 'server-only'

import { binToHex, decodeCashAddress, encodeLockingBytecodeP2pkh, sha256 } from '@bitauth/libauth'

export type ElectrumHistoryItem = {
  tx_hash: string
  height: number
}

export type ElectrumUtxo = {
  tx_hash: string
  tx_pos: number
  height: number
  value: number
  /** Present when the output carries a CashToken. */
  token?: {
    category: string
    amount: bigint
    nft?: {
      capability: string
      commitment: string
    }
  }
}

type RawElectrumUtxo = {
  tx_hash: string
  tx_pos: number
  height: number
  value: number
  token_data?: {
    category: string
    amount: string | number | bigint
    nft?: {
      capability: string
      commitment: string
    }
  }
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT_MS = 20_000

function findJsonValueEnd(text: string): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') {
      depth -= 1
      if (depth <= 0) return index + 1
    }
  }

  return -1
}

/**
 * Extracts complete JSON-RPC payloads from a WebSocket frame buffer.
 *
 * Fulcrum sends each response as its own frame with no trailing newline, so a
 * newline-only delimiter never flushes the buffer. Scan for balanced JSON
 * values instead, which also handles newline-delimited servers and multiple
 * responses packed into one frame.
 */
export function takeJsonMessages(buffer: string): { messages: string[]; rest: string } {
  const messages: string[] = []
  let rest = buffer

  for (;;) {
    const brace = rest.indexOf('{')
    const bracket = rest.indexOf('[')
    const firstValue = brace < 0 ? bracket : bracket < 0 ? brace : Math.min(brace, bracket)
    if (firstValue < 0) return { messages, rest: '' }
    if (firstValue > 0) rest = rest.slice(firstValue)

    const end = findJsonValueEnd(rest)
    if (end < 0) return { messages, rest }

    messages.push(rest.slice(0, end))
    rest = rest.slice(end)
  }
}

export function getElectrumUrl(): string {
  return process.env.ELECTRUM_WSS_URL ?? 'wss://chipnet.imaginary.cash:50004'
}

export function addressToScripthash(address: string): string {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') {
    throw new Error(`Invalid BCH address: ${decoded}`)
  }
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
    throw new Error('Only P2PKH addresses are supported')
  }

  const lockingBytecode = encodeLockingBytecodeP2pkh(decoded.payload)
  return binToHex(sha256.hash(lockingBytecode).slice().reverse())
}

class ElectrumClient {
  private readonly socket: WebSocket
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 1
  private buffer = ''

  private constructor(socket: WebSocket) {
    this.socket = socket
    this.socket.addEventListener('message', (event) => this.onMessage(event))
    this.socket.addEventListener('close', () => this.failAll('Electrum connection closed'))
    this.socket.addEventListener('error', () => this.failAll('Electrum connection error'))
  }

  static async connect(url: string): Promise<ElectrumClient> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out connecting to Electrum')),
        REQUEST_TIMEOUT_MS,
      )
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timer)
          reject(new Error(`Unable to connect to Electrum at ${url}`))
        },
        { once: true },
      )
    })

    const client = new ElectrumClient(socket)
    await client.request('server.version', ['toops', '1.4']).catch(() => undefined)
    return client
  }

  request<T>(method: string, params: unknown[]): Promise<T> {
    const id = this.nextId
    this.nextId += 1

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Electrum request timed out: ${method}`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })

      try {
        this.socket.send(JSON.stringify({ id, method, params }) + '\n')
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  close(): void {
    try {
      this.socket.close()
    } catch {
      // Already closed.
    }
    this.failAll('Electrum client closed')
  }

  private onMessage(event: MessageEvent): void {
    const data = typeof event.data === 'string' ? event.data : String(event.data)
    const { messages, rest } = takeJsonMessages(this.buffer + data)
    this.buffer = rest

    for (const message of messages) this.handleLine(message)
  }

  private handleLine(line: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      message = JSON.parse(line)
    } catch {
      return
    }

    if (typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    clearTimeout(pending.timer)

    if (message.error) {
      pending.reject(new Error(message.error.message ?? 'Electrum request failed'))
      return
    }

    pending.resolve(message.result)
  }

  private failAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
    }
  }
}

export async function withElectrum<T>(fn: (client: ElectrumClient) => Promise<T>): Promise<T> {
  const client = await ElectrumClient.connect(getElectrumUrl())
  try {
    return await fn(client)
  } finally {
    client.close()
  }
}

export async function getAddressHistory(address: string): Promise<ElectrumHistoryItem[]> {
  const scripthash = addressToScripthash(address)
  return withElectrum((client) =>
    client.request<ElectrumHistoryItem[]>('blockchain.scripthash.get_history', [scripthash]),
  )
}

export async function getAddressUtxos(address: string): Promise<ElectrumUtxo[]> {
  const scripthash = addressToScripthash(address)
  const utxos = await withElectrum((client) =>
    client.request<RawElectrumUtxo[]>('blockchain.scripthash.listunspent', [
      scripthash,
      'include_tokens',
    ]),
  )

  return utxos.map((utxo) => ({
    tx_hash: utxo.tx_hash,
    tx_pos: utxo.tx_pos,
    height: utxo.height,
    value: utxo.value,
    token: utxo.token_data
      ? {
          category: utxo.token_data.category,
          amount: BigInt(utxo.token_data.amount),
          nft: utxo.token_data.nft,
        }
      : undefined,
  }))
}

export async function getTransactionHex(txid: string): Promise<string> {
  return withElectrum((client) =>
    client.request<string>('blockchain.transaction.get', [txid, false]),
  )
}

export async function broadcastTransaction(rawTransactionHex: string): Promise<string> {
  return withElectrum((client) =>
    client.request<string>('blockchain.transaction.broadcast', [rawTransactionHex]),
  )
}

export type { ElectrumClient }
