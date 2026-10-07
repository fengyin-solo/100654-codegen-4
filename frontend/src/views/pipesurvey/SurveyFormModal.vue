<template>
  <div v-if="open" class="modal-mask" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ title }}</h3>
      <div class="form-grid">
        <label class="form-item">
          <span>测量编号</span>
          <input v-model="form.测量编号" placeholder="例：CL-2026-0006" />
        </label>
        <label class="form-item">
          <span>管段编号</span>
          <input v-model="form.管段编号" placeholder="例：GS-DN300-城东-002" />
        </label>
        <label class="form-item">
          <span>管段起点</span>
          <input v-model="form.管段起点" placeholder="例：城东水厂出厂口" />
        </label>
        <label class="form-item">
          <span>管段止点</span>
          <input v-model="form.管段止点" placeholder="例：朝阳路阀门井" />
        </label>
        <label class="form-item full">
          <span>点位坐标</span>
          <textarea
            v-model="form.点位坐标"
            rows="3"
            placeholder="例：P1(50231.418, 33892.156); P2(50310.772, 33905.441)"
          ></textarea>
        </label>
        <label class="form-item">
          <span>测量人员</span>
          <input v-model="form.测量人员" placeholder="例：测量一组·王工" />
        </label>
        <label class="form-item">
          <span>测量日期</span>
          <input v-model="form.测量日期" type="date" />
        </label>
      </div>
      <p class="modal-hint">同一管段已有在办测量时重复报送会被拦下，只留一条。</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" @click="emit('cancel')">取消</button>
        <button class="btn primary" type="button" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

import type { SurveyPayload } from '@/api/pipesurvey-service'

const props = defineProps<{
  open: boolean
  title: string
  initial: SurveyPayload
}>()

const emit = defineEmits<{
  cancel: []
  save: [payload: SurveyPayload]
}>()

const form = reactive<SurveyPayload>({ ...props.initial })

watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(form, props.initial)
    }
  },
)

function save() {
  emit('save', { ...form })
}
</script>
