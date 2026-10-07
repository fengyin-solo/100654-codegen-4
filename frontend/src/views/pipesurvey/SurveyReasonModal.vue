<template>
  <div v-if="open" class="modal-mask" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ meta.title }} · {{ rowLabel }}</h3>
      <label class="form-item full">
        <span>{{ meta.label }}</span>
        <textarea v-model="text" rows="3" :placeholder="meta.placeholder"></textarea>
      </label>
      <p v-if="!text.trim()" class="modal-hint">{{ meta.label }}不能为空。</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" @click="emit('cancel')">取消</button>
        <button class="btn primary" type="button" :disabled="!text.trim()" @click="confirm">
          {{ meta.confirm }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { REASON_META, type ReasonMode } from './use-survey-actions'
import type { EntryRow } from '@/data/types'

const props = defineProps<{
  open: boolean
  mode: ReasonMode
  row: EntryRow | null
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [text: string]
}>()

const text = ref('')
const meta = computed(() => REASON_META[props.mode])
const rowLabel = computed(() => (props.row ? String(props.row['测量编号'] ?? '') : ''))

watch(
  () => props.open,
  (open) => {
    if (open) {
      text.value = meta.value.preset
    }
  },
)

function confirm() {
  emit('confirm', text.value.trim())
}
</script>
