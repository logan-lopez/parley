<script setup lang="ts">
import Markdown from '../Markdown.vue'

defineProps<{
  header: string
  question?: string
  required: boolean
  advanceOnPick?: boolean
  error?: string
}>()
</script>

<template>
  <section class="question" data-question :data-advance-on-pick="advanceOnPick || undefined">
    <div class="question-head">
      <span class="chip">{{ header }}</span>
      <span v-if="!required" class="optional">Optional</span>
    </div>
    <Markdown v-if="question" class="question-text" :source="question" />
    <slot />
    <p v-if="error" class="field-error">{{ error }}</p>
  </section>
</template>
