<script setup lang="ts">
// Dev only (`?gallery`): every shared fixture through the real compiler and
// card, without the hub. Submitting shows what the model would get back.
import { computed, ref, watch } from 'vue'
import { askInputSchema, compileQuestions, shapeAnswer, DEFAULT_TIMEOUT_SECONDS, type AskOutcome } from '@parley/protocol/ask'
import AskCard from '../card/AskCard.vue'

const modules = import.meta.glob<{ default: unknown }>('../../../../packages/protocol/fixtures/*.json', { eager: true })
const fixtures = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.split('/').pop()!.replace(/\.json$/, ''), mod.default]),
)
const names = Object.keys(fixtures)

const initial = new URLSearchParams(location.search).get('fixture')
const name = ref(initial && initial in fixtures ? initial : names[0]!)
const loadedAt = ref(Date.now())
const result = ref<ReturnType<typeof shapeAnswer>>()
const run = ref(0)   // remounts the card

const parsed = computed(() => askInputSchema.safeParse(fixtures[name.value]))
const input = computed(() => (parsed.value.success ? parsed.value.data : undefined))
const form = computed(() => (input.value ? compileQuestions(input.value) : undefined))

watch(name, (value) => {
  const url = new URL(location.href)
  url.searchParams.set('fixture', value)
  history.replaceState(null, '', url)
  reset()
})

function reset() {
  result.value = undefined
  loadedAt.value = Date.now()
  run.value++
}

function finish(outcome: AskOutcome) {
  if (input.value) result.value = shapeAnswer(input.value, outcome)
}
</script>

<template>
  <div class="gallery">
    <nav class="gallery-bar">
      <select v-model="name" aria-label="Fixture">
        <option v-for="n in names" :key="n" :value="n">{{ n }}</option>
      </select>
      <button type="button" class="button" @click="reset">Reset</button>
    </nav>

    <div class="gallery-frame">
      <pre v-if="!parsed.success" class="gallery-error">{{ parsed.error.message }}</pre>
      <div v-else-if="result" class="gallery-result" data-testid="result">
        <h2>Text</h2>
        <pre data-testid="result-text">{{ result.text }}</pre>
        <h2>Structured</h2>
        <pre data-testid="result-structured">{{ JSON.stringify(result.structured, null, 2) }}</pre>
        <button type="button" class="button" @click="reset">Again</button>
      </div>
      <AskCard
        v-else-if="form"
        :key="`${name}-${run}`"
        :form="form"
        source="gallery · fixtures"
        :created-at="loadedAt"
        :expires-at="loadedAt + (input?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000"
        :position="1"
        :total="1"
        @submit="finish({ status: 'answered', data: $event })"
        @skip="finish({ status: 'dismissed' })"
      />
    </div>
  </div>
</template>
