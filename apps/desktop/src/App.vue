<script setup lang="ts">
import { ref } from 'vue'
import { JsonForms } from '@jsonforms/vue'
import type { JsonFormsChangeEvent } from '@jsonforms/vue'
import type { FormSpec } from '@parley/protocol'
import { renderers } from './forms/renderers'

// TODO: replace with forms that arrive from the hub.
const form: FormSpec = {
  title: 'Sample ask',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Free text' },
      count: { type: 'integer', minimum: 0 },
      confirm: { type: 'boolean', title: 'Looks good?' },
      approach: { type: 'string', enum: ['Workspace', 'Single package', 'Something else'] },
    },
    required: ['approach'],
  },
}

const data = ref<unknown>({})

function onChange(event: JsonFormsChangeEvent) {
  data.value = event.data
}

function submit() {
  // TODO: send the answer back through the hub.
  console.log('answer', data.value)
}
</script>

<template>
  <main>
    <h1 v-if="form.title">{{ form.title }}</h1>
    <p v-if="form.description">{{ form.description }}</p>
    <JsonForms :data="data" :schema="form.schema" :renderers="renderers" @change="onChange" />
    <button type="button" @click="submit">Send</button>
  </main>
</template>

<style>
main {
  padding: 1rem;
  font-family: system-ui, sans-serif;
}
</style>
