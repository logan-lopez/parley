// Connection from this server instance to the desktop app's hub.
// One app, many server instances (one per agent session). Tool code only
// sees `AppClient`, so a second transport later doesn't touch it.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createConnection, type Socket } from 'node:net'
import {
  APP_IDENTIFIER,
  MAX_LINE_BYTES,
  PROTOCOL_VERSION,
  SOCKET_FILENAME,
  type AppToServer,
  type FormSpec,
  type ServerToApp,
  type SessionInfo,
} from '@parley/protocol'

export type AskOutcome =
  | { status: 'answered'; data: unknown }
  | { status: 'dismissed' }
  | { status: 'cancelled' }   // the MCP client cancelled the call
  | { status: 'timed_out' }

export interface AskOptions {
  timeoutMs: number
  signal: AbortSignal
  // Who's asking, for the hello. The latest non-null value wins.
  client?: SessionInfo['client']
}

export interface AppClient {
  ask(form: FormSpec, opts: AskOptions): Promise<AskOutcome>
}

const LAUNCH_WAIT_MS = 10_000
const LAUNCH_POLL_MS = 250
const RECONNECT_WINDOW_MS = 30_000
const NOT_RUNNING = "Parley isn't running. Start the app and try again."
const CLOSED = 'Parley closed before the user answered.'

const log = (...args: unknown[]) => console.error('[parley]', ...args)

export function socketPath(): string {
  if (process.platform !== 'darwin') {
    throw new Error(`Parley is macOS only for now (this is ${process.platform}).`)
  }
  return process.env.PARLEY_SOCKET
    || join(homedir(), 'Library', 'Application Support', APP_IDENTIFIER, SOCKET_FILENAME)
}

let instance: AppClient | undefined

// Lazy singleton: nothing connects until the first ask.
export function getAppClient(): AppClient {
  return (instance ??= new SocketAppClient())
}

interface Pending {
  message: Extract<ServerToApp, { type: 'ask' }>
  settle: (outcome: AskOutcome) => void
  fail: (error: Error) => void
}

class SocketAppClient implements AppClient {
  private readonly sessionId = randomUUID()
  private client: SessionInfo['client'] = null
  private readonly pending = new Map<string, Pending>()
  private socket: Socket | null = null
  private connecting = false

  ask(form: FormSpec, opts: AskOptions): Promise<AskOutcome> {
    if (opts.client) this.client = opts.client
    if (opts.signal.aborted) return Promise.resolve({ status: 'cancelled' })

    const createdAt = Date.now()
    const message: Pending['message'] = {
      type: 'ask',
      id: randomUUID(),
      form,
      createdAt,
      expiresAt: createdAt + opts.timeoutMs,
    }

    return new Promise<AskOutcome>((resolve, reject) => {
      const end = () => {
        clearTimeout(timer)
        opts.signal.removeEventListener('abort', onAbort)
        this.pending.delete(message.id)
        this.updateRef()
      }
      const cancel = (reason: 'client_cancelled' | 'timed_out', outcome: AskOutcome) => {
        end()
        this.write({ type: 'cancel', id: message.id, reason })
        resolve(outcome)
      }
      const onAbort = () => cancel('client_cancelled', { status: 'cancelled' })
      const timer = setTimeout(() => cancel('timed_out', { status: 'timed_out' }), opts.timeoutMs)
      opts.signal.addEventListener('abort', onAbort, { once: true })

      this.pending.set(message.id, {
        message,
        settle: (outcome) => { end(); resolve(outcome) },
        fail: (error) => { end(); reject(error) },
      })
      this.updateRef()

      if (this.socket) this.write(message)
      else if (!this.connecting) void this.connect({ initial: true })
      // Otherwise a connect is in flight, and it sends every pending ask once it's up.
    })
  }

  private async connect({ initial }: { initial: boolean }) {
    this.connecting = true
    try {
      const path = socketPath()
      const socket = initial ? await this.connectOrLaunch(path) : await this.reconnect(path)
      this.attach(socket)
    } catch (error) {
      this.failAll(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.connecting = false
    }
  }

  private async connectOrLaunch(path: string): Promise<Socket> {
    try {
      return await tryConnect(path)
    } catch (error) {
      if (!isNotRunning(error)) throw error
    }
    if (process.env.PARLEY_NO_LAUNCH === '1') throw new Error(NOT_RUNNING)

    log(`app not running; launching ${APP_IDENTIFIER}`)
    // `open` fails fast when the bundle isn't installed (the usual case in dev).
    if (!(await launchApp())) throw new Error(NOT_RUNNING)
    const deadline = Date.now() + LAUNCH_WAIT_MS
    while (Date.now() < deadline) {
      await sleep(LAUNCH_POLL_MS)
      try {
        return await tryConnect(path)
      } catch (error) {
        if (!isNotRunning(error)) throw error
      }
    }
    throw new Error(NOT_RUNNING)
  }

  private async reconnect(path: string): Promise<Socket> {
    const deadline = Date.now() + RECONNECT_WINDOW_MS
    let delay = 250
    while (this.pending.size > 0) {
      try {
        const socket = await tryConnect(path)
        log('reconnected')
        return socket
      } catch (error) {
        if (!isNotRunning(error)) throw error
      }
      const left = deadline - Date.now()
      if (left <= 0) break
      await sleep(Math.min(delay, left))
      delay = Math.min(delay * 2, 2_000)
    }
    throw new Error(CLOSED)
  }

  private attach(socket: Socket) {
    this.socket = socket
    this.updateRef()

    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim()) this.receive(line)
      }
      if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) {
        log('line from app over 1 MiB; closing')
        socket.destroy()
      }
    })
    socket.on('error', (error) => log('socket error:', error.message))
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.pending.size === 0) return
      log(`connection lost with ${this.pending.size} pending; reconnecting for up to 30 s`)
      if (!this.connecting) void this.connect({ initial: false })
    })

    const session: SessionInfo = { id: this.sessionId, client: this.client, cwd: process.cwd(), pid: process.pid }
    this.write({ type: 'hello', protocol: PROTOCOL_VERSION, session })
    for (const { message } of this.pending.values()) this.write(message)
  }

  private receive(line: string) {
    let message: AppToServer
    try {
      message = JSON.parse(line)
    } catch {
      log('unparseable line from app:', line.slice(0, 200))
      return
    }
    switch (message.type) {
      case 'welcome':
        log(`connected to Parley ${message.appVersion}`)
        return
      case 'answer':
        this.pending.get(message.id)?.settle({ status: 'answered', data: message.data })
        return
      case 'dismissed':
        this.pending.get(message.id)?.settle({ status: 'dismissed' })
        return
      case 'error':
        log(`app error (${message.code}${message.id ? ` for ${message.id}` : ''}): ${message.message}`)
        if (message.code === 'version_mismatch') {
          // The app closes the connection after this; don't let `close` start a reconnect.
          const socket = this.socket
          this.socket = null
          socket?.destroy()
          this.failAll(new Error(`Parley speaks a different protocol version: ${message.message}`))
        }
        return
      default:
        log('unknown message from app:', line.slice(0, 200))
    }
  }

  private write(message: ServerToApp) {
    this.socket?.write(JSON.stringify(message) + '\n')
  }

  private failAll(error: Error) {
    for (const p of [...this.pending.values()]) p.fail(error)
  }

  // An idle connection shouldn't keep the process alive (the fake-ask script relies on this).
  private updateRef() {
    if (this.pending.size > 0) this.socket?.ref()
    else this.socket?.unref()
  }
}

function tryConnect(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path)
    socket.once('connect', () => {
      socket.off('error', reject)
      resolve(socket)
    })
    socket.once('error', reject)
  })
}

function isNotRunning(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ECONNREFUSED'
}

function launchApp(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('open', ['-b', APP_IDENTIFIER], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => {
      if (code !== 0) log(`open -b ${APP_IDENTIFIER} failed: ${stderr.trim()}`)
      resolve(code === 0)
    })
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
