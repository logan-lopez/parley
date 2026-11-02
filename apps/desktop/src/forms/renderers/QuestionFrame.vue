<script setup lang="ts">
import Markdown from '../Markdown.vue'

defineProps<{
  header: string
  question?: string
  required: boolean
  advanceOnPick?: boolean
  passive?: boolean   // nothing to answer (a show): no "Optional", and first focus skips it
  error?: string
}>()
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
    </div>
    <Markdown v-if="question" class="question-text" :source="question" />
    <slot />
    <p v-if="error" class="field-error">{{ error }}</p>
  </section>
</template>
