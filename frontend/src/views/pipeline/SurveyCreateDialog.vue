<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal modal-wide">
      <h3>新建竣工测量（现场测量）</h3>
      <p class="modal-tip">
        测量编号登记时自动生成。同一管段已有在办或已入库测量时不再重复登记；已入库测量的变更请在该条上「新开补测」。
      </p>
      <div class="modal-grid">
        <label class="modal-field">
          <span>管段编号 <i>*</i></span>
          <input v-model="form.segmentCode" placeholder="如 PG-DB-107" />
        </label>
        <label class="modal-field">
          <span>管段名称 <i>*</i></span>
          <input v-model="form.segmentName" placeholder="如 朝阳路DN300给水管（A路—B路）" />
        </label>
        <label class="modal-field">
          <span>起点位置 <i>*</i></span>
          <input v-model="form.startPoint" placeholder="如 朝阳路西阀门井" />
        </label>
        <label class="modal-field">
          <span>止点位置 <i>*</i></span>
          <input v-model="form.endPoint" placeholder="如 河滨东路交汇井" />
        </label>
        <label class="modal-field">
          <span>起点X坐标 <i>*</i></span>
          <input v-model="form.startX" placeholder="如 502145.32" />
        </label>
        <label class="modal-field">
          <span>起点Y坐标 <i>*</i></span>
          <input v-model="form.startY" placeholder="如 3478120.46" />
        </label>
        <label class="modal-field">
          <span>止点X坐标 <i>*</i></span>
          <input v-model="form.endX" placeholder="如 502688.10" />
        </label>
        <label class="modal-field">
          <span>止点Y坐标 <i>*</i></span>
          <input v-model="form.endY" placeholder="如 3478255.71" />
        </label>
        <label class="modal-field">
          <span>管材</span>
          <input v-model="form.material" placeholder="如 球墨铸铁管" />
        </label>
        <label class="modal-field">
          <span>管径</span>
          <input v-model="form.diameter" placeholder="如 DN300" />
        </label>
        <label class="modal-field">
          <span>测量人员 <i>*</i></span>
          <input v-model="form.surveyor" :placeholder="store.operator" />
        </label>
        <label class="modal-field">
          <span>测量日期</span>
          <input v-model="form.surveyedAt" type="date" />
        </label>
      </div>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="button" @click="submit">登记并进入现场测量</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

import { createSurvey } from '@/api/pipeline-service'
import type { SurveyDraft } from '@/data/pipeline-types'
import { useSessionStore } from '@/stores/session'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', payload: { message: string; id: number }): void
}>()

const store = useSessionStore()
const errorMessage = ref('')

const today = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const form = reactive<SurveyDraft>({
  segmentCode: '',
  segmentName: '',
  startPoint: '',
  endPoint: '',
  startX: '',
  startY: '',
  endX: '',
  endY: '',
  material: '',
  diameter: '',
  surveyor: '',
  surveyedAt: today(),
})

function submit() {
  errorMessage.value = ''
  if (form.surveyor.trim() === '') {
    form.surveyor = store.operator
  }
  const result = createSurvey({ ...form }, store.operator)
  if (!result.ok || !result.survey) {
    errorMessage.value = result.message
    return
  }
  emit('created', { message: result.message, id: result.survey.id })
}
</script>
