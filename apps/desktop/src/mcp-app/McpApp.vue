<script setup lang="ts">
// One ask, inline in an MCP Apps host's chat. The host mounts this after
// `ask` returns (show, then wait): the call's arguments are the questions,
// and its result carries the askId. The card answers through the server's
// app-only `parley_submit`, and long-polls `parley_status` to learn when the
// ask ends elsewhere (the Parley window, a cancel, the timeout). The window
// shows the same ask, and the first answer wins.
import { computed, ref, shallowRef } from 'vue'
import { App } from '@modelcontextprotocol/ext-apps'
import { hasPathQuestion } from '@parley/protocol'
import { askInputSchema, compileQuestions, DEFAULT_TIMEOUT_SECONDS, type AskInput, type AskOutcome } from '@parley/protocol/ask'
import AskCard from '../card/AskCard.vue'
import { setPlatform } from '../platform'
import { applyHostContext } from './theme'

// What parley_status and parley_submit report (apps/server/src/ask-lifecycle.ts).
type Status =
  | { state: 'open' }
  | { state: 'ended'; via: 'window' | 'chat'; outcome: AskOutcome }
  | { state: 'unknown' }

const shownAt = Date.now()
const input = shallowRef<AskInput>()
const inputError = ref<string>()
const askId = ref<string>()
const status = shallowRef<Status>({ state: 'open' })
const cancelled = ref(false)    // the host cancelled `ask` itself, so there's no askId
const sending = shallowRef<{ data?: unknown; note: string }>()
// What the user has typed, so a failed send doesn't lose it when the open card mounts again.
const draft: { data?: unknown; note?: string } = {}
const sendError = ref<string>()
const host = ref('Claude')

const form = computed(() => (input.value ? compileQuestions(input.value) : undefined))
// No file picker in the host's iframe: the window answers these.
const windowOnly = computed(() => !!form.value && hasPathQuestion(form.value))

const app = new App({ name: 'parley-card', version: '0.0.0' }, {}, { autoResize: true })

setPlatform({
  openExternal: async (url) => {
    await app.openLink({ url })
  },
})

app.onhostcontextchanged = (context) => applyHostContext(context)

app.ontoolinput = ({ arguments: args }) => {
  const parsed = askInputSchema.safeParse(args)
  if (parsed.success) input.value = parsed.data
  else inputError.value = parsed.error.message
}

app.ontoolresult = (result) => {
  const id = (result.structuredContent as { askId?: unknown } | undefined)?.askId
    ?? (result._meta as Record<string, unknown> | undefined)?.['parley/askId']
  if (typeof id !== 'string' || askId.value) return
  askId.value = id
  void watch(id)
}

app.ontoolcancelled = () => {
  if (!askId.value) cancelled.value = true
}

app
  .connect()
  .then(() => {
    const name = app.getHostVersion()?.name
    if (name) host.value = name
    applyHostContext(app.getHostContext())
  })
  .catch((error: unknown) => console.error('parley card: connect failed', error))

// Holds open until the ask ends, one long-poll at a time (the server holds
// each for up to 25 s).
async function watch(id: string) {
  let delay = 1000
  while (status.value.state === 'open') {
    try {
      const result = await app.callServerTool({ name: 'parley_status', arguments: { askId: id } })
      const next = result.structuredContent as Status | undefined
      if (next && status.value.state === 'open') status.value = next
      delay = 1000
    } catch (error) {
      console.warn('parley card: status failed', error)
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay = Math.min(delay * 2, 15_000)
    }
  }
}

async function send(kind: 'answer' | 'skip', data: unknown, note: string) {
  if (!askId.value || sending.value) return
  sendError.value = undefined
  sending.value = { data, note }
  try {
    const result = await app.callServerTool({
      name: 'parley_submit',
      arguments: {
        askId: askId.value,
        kind,
        // JSON Forms hands back a Vue proxy, which postMessage's structured clone can't copy.
        ...(kind === 'answer' && { data: JSON.parse(JSON.stringify(data ?? null)) }),
        ...(note.trim() && { note }),
      },
    })
    const next = result.structuredContent as (Status & { accepted?: boolean }) | undefined
    if (result.isError || !next) throw new Error(textOf(result) || "Parley didn't take the answer.")
    status.value = next
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : String(error)
  } finally {
    sending.value = undefined
  }
}

function textOf(result: { content?: { type: string; text?: string }[] }): string {
  return (result.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join(' ')
}

// What the read-only card shows, and the line under it. Undefined while it can be answered here.
const ended = computed(() => {
  const s = status.value
  if (s.state === 'ended') {
    const where = s.via === 'chat' ? 'here' : 'in Parley'
    const line = {
      answered: `Answered ${where}.`,
      dismissed: `Skipped ${where}.`,
      cancelled: 'Cancelled.',
      timed_out: 'Timed out.',
    }[s.outcome.status]
    const data = s.outcome.status === 'answered' ? s.outcome.data : undefined
    const note = 'note' in s.outcome ? s.outcome.note : undefined
    return { line, data, note }
  }
  if (s.state === 'unknown') return { line: 'This ask is no longer open.' }
  if (cancelled.value) return { line: 'Cancelled.' }
  if (windowOnly.value) return { line: 'This one has a file picker. Answer it in Parley (⌘⌃P).' }
  if (sending.value) return { line: 'Sending…', data: sending.value.data, note: sending.value.note }
  return undefined
})

const source = computed(() => `${host.value} · in the chat`)
const expiresAt = computed(() => shownAt + (input.value?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000)
</script>

<template>
  <p v-if="inputError" class="inline-message danger">Parley couldn't read this ask: {{ inputError }}</p>
  <p v-else-if="!form" class="inline-message">Loading the question…</p>
  <template v-else>
    <!-- Keyed by state, so the read-only card mounts fresh with the answers it ended with. -->
    <AskCard
      v-if="ended"
      :key="`ended:${ended.line}`"
      :form="form"
      :source="source"
      :created-at="shownAt"
      readonly
      embedded
      :initial-data="ended.data"
      :initial-note="ended.note"
    >
      <template #footer><span class="hints">{{ ended.line }}</span></template>
    </AskCard>
    <AskCard
      v-else
      key="open"
      :form="form"
      :source="source"
      :created-at="shownAt"
      :expires-at="askId ? expiresAt : undefined"
      embedded
      :initial-data="draft.data"
      :initial-note="draft.note"
      @change="draft.data = $event"
      @note="draft.note = $event"
      @submit="(data, note) => send('answer', data, note)"
      @skip="(note) => send('skip', undefined, note)"
    />
    <p v-if="sendError" class="inline-message danger">{{ sendError }}</p>
  </template>
</template>
