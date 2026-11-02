<script setup lang="ts">
import { computed, inject } from 'vue'
import Markdown from '../Markdown.vue'
import { REMEMBER } from '../remember'

const props = defineProps<{
  id?: string         // the question's id, which "Don't ask again here" is keyed by
  rememberable?: boolean   // single choice and boolean: offers "Don't ask again here"
  header: string
  question?: string
  required: boolean
  advanceOnPick?: boolean
  passive?: boolean   // nothing to answer (a show): no "Optional", and first focus skips it
  error?: string
}>()

const remember = inject(REMEMBER, null)
const on = computed(() => !!props.id && !!remember?.ids.value.includes(props.id))
// Locked (history, withdrawn): only a toggle that was on shows, as a mark.
const offered = computed(() => !!remember && !!props.rememberable && !!props.id && (!remember.locked.value || on.value))
</script>

<template>
  <section
    class="question"
    data-question
    :data-advance-on-pick="advanceOnPick || undefined"
    :data-passive="passive || undefined"
  >
    <div class="question-head">
      <span class="chip" :title="header">{{ header }}</span>
      <span v-if="!required && !passive" class="optional">Optional</span>
      <template v-if="offered">
        <span v-if="remember!.locked.value" class="remember on">Don't ask again</span>
        <button
          v-else
          type="button"
          class="remember"
          :class="{ on }"
          :aria-pressed="on"
          tabindex="-1"
          @click="remember!.toggle(id!)"
        >Don't ask again here</button>
      </template>
    </div>
    <Markdown v-if="question" class="question-text" :source="question" />
    <p v-if="on && !remember!.locked.value" class="hint remember-hint">The agent will draft a line for AGENTS.md for you to approve.</p>
    <slot />
    <p v-if="error" class="field-error">{{ error }}</p>
  </section>
</template>
