// Stands in for the desktop app: listens on a socket, logs every ask, and
// answers on a script. For testing how models use the tool without anyone
// at the keyboard.
//
//   pnpm --filter @parley/server fake-hub <socket> [--log <file.jsonl>] [--reply <policy>]...
//
// Point the server at it with PARLEY_SOCKET=<socket> (and PARLEY_NO_LAUNCH=1).
// Each ask takes the next --reply; the last one repeats. Policies:
//
//   first | second | last   pick that option in every choice question
//   other:<text>            answer every choice question with free text
//   skip                    dismiss
//   none                    never answer (let it time out or be cancelled)
//   delay:<s>:<policy>      wait, then apply the policy

import { createServer, type Socket } from 'node:net'
import { appendFileSync, existsSync, unlinkSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { PROTOCOL_VERSION, type AppToServer, type FormSpec, type ServerToApp } from '@parley/protocol'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    log: { type: 'string' },
    reply: { type: 'string', multiple: true, default: ['first'] },
  },
})

const path = positionals[0]
if (!path) {
  console.error('usage: fake-hub <socket> [--log <file.jsonl>] [--reply <policy>]...')
  process.exit(2)
}

const replies = values.reply
let asked = 0

if (existsSync(path)) unlinkSync(path)
createServer(serve).listen(path, () => console.error(`fake-hub: listening on ${path}`))

function serve(socket: Socket) {
  const send = (message: AppToServer) => socket.write(JSON.stringify(message) + '\n')
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    buffer += chunk
    let newline: number
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const message = JSON.parse(buffer.slice(0, newline)) as ServerToApp
      buffer = buffer.slice(newline + 1)
      receive(message)
    }
  })
  socket.on('error', () => {})

  function receive(message: ServerToApp) {
    log({ at: new Date().toISOString(), ...message })
    if (message.type === 'hello') return send({ type: 'welcome', protocol: PROTOCOL_VERSION, appVersion: 'fake-hub' })
    if (message.type !== 'ask') return
    const policy = replies[Math.min(asked++, replies.length - 1)]!
    void reply(message.id, message.form, policy)
  }

  async function reply(id: string, form: FormSpec, policy: string) {
    const delayed = /^delay:(\d+):(.+)$/.exec(policy)
    if (delayed) {
      await new Promise((resolve) => setTimeout(resolve, Number(delayed[1]) * 1000))
      policy = delayed[2]!
    }
    console.error(`fake-hub: ask ${id.slice(0, 8)} → ${policy}`)
    if (policy === 'none') return
    if (policy === 'skip') return send({ type: 'dismissed', id })
    const data = fill(form, policy)
    log({ at: new Date().toISOString(), type: 'reply', id, data })
    send({ type: 'answer', id, data })
  }
}

// Answers every question the way a hurried user would.
function fill(form: FormSpec, policy: string): Record<string, unknown> {
  const properties = (form.schema.properties ?? {}) as Record<string, Record<string, any>>
  const data: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(properties)) {
    switch (prop['x-widget']) {
      case 'choice': {
        const branches = (prop.items ?? prop).anyOf ?? (prop.items ?? prop).oneOf ?? []
        const labels: string[] = branches.filter((b: any) => 'const' in b).map((b: any) => b.const)
        const other = policy.startsWith('other:') ? policy.slice(6) : undefined
        const label = other ?? (policy === 'second' ? labels[1] : policy === 'last' ? labels.at(-1) : labels[0])
        data[key] = prop.type === 'array' ? [label] : label
        break
      }
      case 'text': data[key] = 'as you see fit'; break
      case 'number': data[key] = prop.minimum ?? 1; break
      case 'boolean': data[key] = policy !== 'second'; break
      case 'path': data[key] = prop.type === 'array' ? ['/tmp/example'] : '/tmp/example'; break
    }
  }
  return data
}

function log(entry: object) {
  if (values.log) appendFileSync(values.log, JSON.stringify(entry) + '\n')
}
