<script setup lang="ts">
// A list of items, one decision per row, each with an optional comment. The
// decisions are approve and reject, or the agent's own 2–4 labels, read from
// the items' `decision` enum. The data is a tuple: entry i is item i. Rows
// aren't `[data-pick]` (number keys don't scale to 30), so the row keys live
// here; with the agent's own decisions, digits pick a decision for the row.
import { computed, nextTick, onMounted, ref } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import { REVIEW_DECISIONS, type DefaultDecision, type ReviewDecision, type ReviewEntry, type ReviewItemSchema } from '@parley/protocol'
import Markdown from '../Markdown.vue'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

const items = computed(() => (Array.isArray(schema.value.items) ? schema.value.items : []) as ReviewItemSchema[])
const fallback = computed(() => (schema.value['x-default-decision'] ?? 'approve') as DefaultDecision)

const entries = computed<ReviewEntry[]>(() => {
  const d = Array.isArray(data.value) ? data.value : []
  return items.value.map((_, i) => (typeof d[i] === 'object' && d[i] !== null ? d[i] : {}))
})

// The first decision is the positive one. Approve and reject keep their own
// look (✓/✕, struck rejects) and keys; any other set gets labelled buttons.
const decisions = computed<ReviewDecision[]>(() => items.value[0]?.properties?.decision?.enum ?? [...REVIEW_DECISIONS])
const labelled = computed(() => decisions.value.length !== 2 || decisions.value.some((d, n) => d !== REVIEW_DECISIONS[n]))

const count = (decision: ReviewDecision) => entries.value.filter((e) => e.decision === decision).length
const approved = computed(() => count('approve'))
const undecided = computed(() => entries.value.filter((e) => !e.decision).length)

// Complete the data before the user touches it: the default in every entry,
// or under 'none' an empty entry per item, so the form asks for each decision
// rather than for the question. An optional 'none' review stays blank until
// the first decision.
onMounted(() => {
  const d = fallback.value === 'none' ? undefined : fallback.value
  if (!enabled.value || (!d && !frame.value.required)) return
  const complete = Array.isArray(data.value) && data.value.length === items.value.length
    && (!d || entries.value.every((e) => e.decision))
  if (!complete) set(entries.value.map((e) => (e.decision || !d ? e : { ...e, decision: d })))
})

function update(i: number, patch: ReviewEntry) {
  if (!enabled.value) return
  set(entries.value.map((e, j) => (j === i ? { ...e, ...patch } : e)))
}

const decide = (i: number, decision: ReviewDecision) => update(i, { decision })

// Space: approve ⇄ reject, or the next of the agent's decisions (the first from undecided).
function toggle(i: number) {
  const all = decisions.value
  const at = all.indexOf(entries.value[i]?.decision ?? '')
  decide(i, all[(at + 1) % all.length]!)
}

function decideAll(decision: ReviewDecision) {
  if (enabled.value) set(entries.value.map((e) => ({ ...e, decision })))
}

function setComment(i: number, text: string) {
  if (!enabled.value) return
  const { comment: _, ...rest } = entries.value[i]!
  set(entries.value.map((e, j) => (j === i ? (text ? { ...rest, comment: text } : rest) : e)))
}

// Rows: a roving tabindex. Focus lands on the first undecided row, else the first.
const list = ref<HTMLElement>()
const focused = ref<number | null>(null)
const primary = computed(() => Math.max(0, entries.value.findIndex((e) => !e.decision)))
const tabStop = computed(() => focused.value ?? primary.value)

function rowAt(i: number) {
  return list.value?.querySelector<HTMLElement>(`[data-review-row="${i}"]`) ?? undefined
}

function focusRow(i: number) {
  const row = rowAt(Math.min(Math.max(i, 0), items.value.length - 1))
  if (!row) return
  row.focus({ preventScroll: true })
  row.scrollIntoView({ block: 'nearest' })
}

// Comments open on demand and stay open while they have text.
const commentOpen = ref(new Set<number>())
const showComment = (i: number) => commentOpen.value.has(i) || !!entries.value[i]?.comment

async function openComment(i: number) {
  if (!enabled.value) return
  commentOpen.value = new Set(commentOpen.value).add(i)
  await nextTick()
  rowAt(i)?.querySelector<HTMLInputElement>('.review-comment')?.focus()
}

function closeComment(i: number) {
  if (entries.value[i]?.comment) return
  const next = new Set(commentOpen.value)
  next.delete(i)
  commentOpen.value = next
}

function onRowKey(event: KeyboardEvent, i: number) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  // The agent's decisions: digit n is decision n, for this row or, with
  // Shift, every row. By `code`, since Shift+1 is `!` in `key`. This runs
  // before the card's digit handler, which skips a handled event.
  const digit = labelled.value ? /^Digit([1-9])$/.exec(event.code) : null
  const chosen = digit ? decisions.value[Number(digit[1]) - 1] : undefined
  if (chosen) {
    event.preventDefault()
    return event.shiftKey ? decideAll(chosen) : decide(i, chosen)
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const pair = !labelled.value
  const actions: Record<string, () => void> = event.shiftKey
    ? { ...(pair && { a: () => decideAll('approve'), r: () => decideAll('reject') }) }
    : {
        ArrowDown: () => focusRow(i + 1),
        j: () => focusRow(i + 1),
        ArrowUp: () => focusRow(i - 1),
        k: () => focusRow(i - 1),
        Home: () => focusRow(0),
        End: () => focusRow(items.value.length - 1),
        ' ': () => toggle(i),
        ...(pair && { a: () => decide(i, 'approve'), r: () => decide(i, 'reject') }),
        c: () => void openComment(i),
      }
  const action = actions[key]
  if (!action) return
  event.preventDefault()
  action()
}

// In a comment, Esc goes back to the row instead of hiding the window, and
// ↑/↓ leave for the neighbouring row. Enter falls through to the card: Send.
function onCommentKey(event: KeyboardEvent, i: number) {
  const step = { Escape: 0, ArrowUp: -1, ArrowDown: 1 }[event.key]
  if (step === undefined || event.metaKey || event.ctrlKey || event.altKey) return
  event.preventDefault()
  event.stopPropagation()
  focusRow(i + step)
  closeComment(i)
}

// The focused row's preview, kept while focus stays inside the question.
const hasPreview = computed(() => items.value.some((item) => item['x-preview']))
const preview = computed(() => {
  const item = focused.value === null ? undefined : items.value[focused.value]
  return item?.['x-preview'] ? { label: item.title, source: item['x-preview'] } : undefined
})

function onFocusIn(event: FocusEvent) {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-review-row]')
  if (row) focused.value = Number(row.dataset.reviewRow)
}

function onFocusOut(event: FocusEvent) {
  const root = (event.currentTarget as HTMLElement)
  if (!root.contains(event.relatedTarget as Node | null)) focused.value = null
}

function state(i: number) {
  return entries.value[i]?.decision ?? 'undecided'
}

// The row's look. Approve and reject are their own classes; the agent's
// decisions are only "the first" or "another", so a label like "reject"
// in a custom set isn't struck.
function rowClass(i: number) {
  const decision = entries.value[i]?.decision
  if (!decision) return 'undecided'
  if (!labelled.value) return decision
  return decision === decisions.value[0] ? 'lead' : 'decided'
}
</script>

<template>
  <QuestionFrame v-bind="frame">
    <div class="review" :class="{ labelled }" @focusin="onFocusIn" @focusout="onFocusOut">
      <div class="review-head">
        <span v-if="labelled" class="review-count">
          <template v-for="(d, n) in decisions" :key="d">{{ n ? ' · ' : '' }}{{ d }} {{ count(d) }}</template><template v-if="undecided"> · <span class="review-undecided">{{ undecided }} undecided</span></template>
        </span>
        <span v-else class="review-count">
          {{ approved }} of {{ items.length }} approved<template v-if="undecided"> · <span class="review-undecided">{{ undecided }} undecided</span></template>
        </span>
        <span v-if="enabled && !labelled" class="review-all">
          <button type="button" class="link-button" tabindex="-1" @click="decideAll('approve')">Approve all <kbd>⇧A</kbd></button>
          <button type="button" class="link-button" tabindex="-1" @click="decideAll('reject')">Reject all <kbd>⇧R</kbd></button>
        </span>
      </div>

      <div ref="list" class="review-list" :class="{ bounded: hasPreview }" role="list" :aria-label="frame.header">
        <div
          v-for="(item, i) in items"
          :key="i"
          class="review-row"
          :class="rowClass(i)"
          role="listitem"
          :aria-label="`${item.title}: ${state(i)}`"
          :tabindex="enabled && i === tabStop ? 0 : -1"
          :data-review-row="i"
          :data-primary="(enabled && i === primary) || undefined"
          @keydown.self="onRowKey($event, i)"
          @click.self="focusRow(i)"
        >
          <div class="review-main" @click="focusRow(i)">
            <span class="review-body">
              <span class="review-label">{{ item.title }}</span>
              <Markdown v-if="item.description" inline class="option-desc" :source="item.description" />
            </span>
            <span class="review-actions">
              <button
                v-if="enabled && !showComment(i)"
                type="button"
                class="review-comment-button"
                tabindex="-1"
                title="Comment (c)"
                aria-label="Comment"
                @click.stop="openComment(i)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5V11.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
              </button>
              <span v-if="labelled" class="decision labelled" role="group" :aria-label="`Decision for ${item.title}`">
                <button
                  v-for="(d, n) in decisions"
                  :key="d"
                  type="button"
                  class="decision-button"
                  :class="{ lead: n === 0 }"
                  tabindex="-1"
                  :title="`${d} (${n + 1})`"
                  :aria-pressed="state(i) === d"
                  :disabled="!enabled"
                  @click.stop="decide(i, d); focusRow(i)"
                >{{ d }}</button>
              </span>
              <span v-else class="decision" role="group" :aria-label="`Decision for ${item.title}`">
                <button
                  type="button"
                  class="decision-button approve"
                  tabindex="-1"
                  title="Approve (a)"
                  :aria-pressed="state(i) === 'approve'"
                  :disabled="!enabled"
                  @click.stop="decide(i, 'approve'); focusRow(i)"
                >✓</button>
                <button
                  type="button"
                  class="decision-button reject"
                  tabindex="-1"
                  title="Reject (r)"
                  :aria-pressed="state(i) === 'reject'"
                  :disabled="!enabled"
                  @click.stop="decide(i, 'reject'); focusRow(i)"
                >✕</button>
              </span>
            </span>
          </div>
          <input
            v-if="showComment(i)"
            type="text"
            class="review-comment"
            placeholder="Comment for the agent"
            :aria-label="`Comment on ${item.title}`"
            :value="entries[i]?.comment ?? ''"
            :disabled="!enabled"
            tabindex="-1"
            maxlength="500"
            @input="setComment(i, ($event.target as HTMLInputElement).value)"
            @keydown="onCommentKey($event, i)"
            @blur="closeComment(i)"
          >
        </div>
      </div>

      <div v-if="preview?.source" class="preview" aria-live="polite">
        <div class="preview-label">{{ preview.label }}</div>
        <Markdown :source="preview.source" />
      </div>
      <div v-else-if="hasPreview" class="preview empty">Focus an item to preview it.</div>

      <p v-if="enabled && labelled" class="hint">
        <template v-for="(d, n) in decisions" :key="d"><kbd>{{ n + 1 }}</kbd> {{ d }} · </template><kbd>⇧</kbd> + digit for all · <kbd>space</kbd> next · <kbd>↑</kbd><kbd>↓</kbd> or <kbd>j</kbd><kbd>k</kbd> move · <kbd>c</kbd> comment
      </p>
      <p v-else-if="enabled" class="hint">
        <kbd>↑</kbd><kbd>↓</kbd> or <kbd>j</kbd><kbd>k</kbd> move · <kbd>space</kbd> toggle · <kbd>a</kbd> approve · <kbd>r</kbd> reject · <kbd>c</kbd> comment
      </p>
    </div>
  </QuestionFrame>
</template>
