<script setup lang="ts">
// Crude on purpose: brief 2 replaces this UI.
import { computed, ref, watch } from 'vue'
import { JsonForms } from '@jsonforms/vue'
import type { JsonFormsChangeEvent } from '@jsonforms/vue'
import { renderers } from './forms/renderers'
import { sourceLabel } from './asks/source'
import { answer, dismiss, queue } from './asks/store'

const head = computed(() => queue.value[0])
const data = ref<unknown>({})

watch(() => head.value?.id, () => { data.value = {} })

function onChange(event: JsonFormsChangeEvent) {
  data.value = event.data
}
</script>

<template>
  <main v-if="head" :key="head.id">
    <p class="meta">{{ sourceLabel(head.session) }} · 1 of {{ queue.length }}</p>
    <h1 v-if="head.form.title">{{ head.form.title }}</h1>
    <p v-if="head.form.description">{{ head.form.description }}</p>
    <JsonForms :data="data" :schema="head.form.schema" :renderers="renderers" @change="onChange" />
    <button type="button" @click="answer(head.id, data)">Send</button>
    <button type="button" @click="dismiss(head.id)">Skip</button>
  </main>
  <main v-else>
    <p class="meta">Nothing is waiting.</p>
  </main>
</template>

<style>
main {
  padding: 1rem;
  font-family: system-ui, sans-serif;
}
.meta {
  color: #666;
  font-size: 0.85em;
}
</style>
