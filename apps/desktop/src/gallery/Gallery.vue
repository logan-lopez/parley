<script setup lang="ts">
// Dev only (`?gallery`): every shared fixture through the real compiler and
// card, without the hub. Submitting shows what the model would get back.
import { computed, ref, watch } from 'vue'
import { isMediaGlob, looksLikeSound, type Media, type ShowFiles } from '@parley/protocol'
import { askInputSchema, askMediaRefs, compileQuestions, questionIds, shapeAnswer, DEFAULT_TIMEOUT_SECONDS, type AskInput, type AskOutcome } from '@parley/protocol/ask'
import { setAutoplay } from '../forms/audition'
import { setPlatform } from '../platform'
import AskCard from '../card/AskCard.vue'
import ZoomControl from '../ZoomControl.vue'

const modules = import.meta.glob<{ default: unknown }>('../../../../packages/protocol/fixtures/*.json', { eager: true })
const fixtures = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.split('/').pop()!.replace(/\.json$/, ''), mod.default]),
)
const names = Object.keys(fixtures)

// Files only the fixtures use, so a show of one loads here as the server would
// read it. Anything else stays "isn't loaded here". The hash is a stand-in:
// the gallery never writes.
const FILES = 'packages/protocol/fixtures/files/'
const fileTexts = import.meta.glob<string>('../../../../packages/protocol/fixtures/files/*', { query: '?raw', import: 'default', eager: true })
const fileUrls = import.meta.glob<string>('../../../../packages/protocol/fixtures/files/*.{png,wav}', { query: '?url', import: 'default', eager: true })
const fixturePaths = Object.keys(fileUrls).map((key) => key.replace('../../../../', ''))
setPlatform({
  mediaUrls: async (entries) => new Map(Object.values(entries).flatMap((entry) => entry.files.map((file) => [
    file.sha256, { status: 'ok' as const, url: fileUrls[`../../../../${file.path}`] },
  ]))),
})

// As the server would resolve them, for the fixtures' own files: a glob
// expands within its directory, sorted by name. The path stands in for a hash.
function fixtureMedia(input: AskInput, files: ShowFiles): Media {
  const media: Media = {}
  for (const src of askMediaRefs(input, files)) {
    const paths = isMediaGlob(src) ? fixturePaths.filter((path) => globMatch(src, path)).sort() : fixturePaths.includes(src) ? [src] : []
    if (!paths.length) continue
    const sound = looksLikeSound(src)
    media[src] = { kind: sound ? 'audio' : 'image', files: paths.map((path) => ({ path, abs: path, sha256: path, bytes: 0, mime: sound ? 'audio/wav' : 'image/png' })) }
  }
  return media
}
function globMatch(glob: string, path: string): boolean {
  const re = glob.replace(/[.+^$(){}|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  return new RegExp(`^${re}$`).test(path)
}
function fixtureFiles(input: AskInput): ShowFiles {
  const ids = questionIds(input.questions)
  const files: ShowFiles = {}
  input.questions.forEach((q, i) => {
    const text = q.type === 'show' && q.path?.startsWith(FILES) && !q.lines
      ? fileTexts[`../../../../${q.path}`]
      : undefined
    if (text === undefined) return
    files[ids[i]!] = { path: q.path!, text, totalLines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0), sha256: 'gallery' }
  })
  return files
}

const params = new URLSearchParams(location.search)
// `&autoplay=1` is settings.json's `autoplay`, which the gallery doesn't read.
setAutoplay(params.get('autoplay') === '1')
const initial = params.get('fixture')
// What the meta row says is asking; screenshots set a realistic one.
const source = params.get('source') ?? 'gallery · fixtures'
const name = ref(initial && initial in fixtures ? initial : names[0]!)
const loadedAt = ref(Date.now())
const result = ref<ReturnType<typeof shapeAnswer>>()
const run = ref(0)   // remounts the card

const parsed = computed(() => askInputSchema.safeParse(fixtures[name.value]))
const input = computed(() => (parsed.value.success ? parsed.value.data : undefined))
const form = computed(() => {
  if (!input.value) return undefined
  const files = fixtureFiles(input.value)
  return compileQuestions(input.value, files, fixtureMedia(input.value, files))
})

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
  if (input.value) result.value = shapeAnswer(input.value, outcome, { files: fixtureFiles(input.value) })
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
        :source="source"
        :created-at="loadedAt"
        :expires-at="loadedAt + (input?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000"
        :position="1"
        :total="1"
        @submit="(data, note, remember) => finish({ status: 'answered', data, note, remember })"
        @skip="(note) => finish({ status: 'dismissed', note })"
      >
        <template #meta><ZoomControl /></template>
      </AskCard>
    </div>
  </div>
</template>
