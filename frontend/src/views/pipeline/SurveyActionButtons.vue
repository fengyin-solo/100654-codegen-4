<template>
  <span class="row-actions">
    <button
      v-for="action in actions"
      :key="action"
      class="link"
      :class="{ danger: action === '作废归档' || action === '复核退回' }"
      type="button"
      @click="onAction(action)"
    >
      {{ action }}
    </button>

    <!-- 复核退回：必须写明缺哪一份资料 -->
    <div v-if="dialog === 'return'" class="modal-mask" @click.self="close">
      <div class="modal">
        <h3>复核退回 · {{ survey.surveyNo }}</h3>
        <p class="modal-tip">退回后测量回到「现场测量」，由现场补齐资料后重新送复核。请写明缺少哪一份资料：</p>
        <label class="modal-field">
          <span>缺件说明 <i>*</i></span>
          <textarea v-model="reason" rows="4" placeholder="例如：缺少管段纵断面竣工图（监理签字页）、隐蔽工程验收记录"></textarea>
        </label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="close">取消</button>
          <button class="btn primary" type="button" @click="confirmReturn">确认退回</button>
        </div>
      </div>
    </div>

    <!-- 入库结论：落库后不许再改 -->
    <div v-else-if="dialog === 'warehouse'" class="modal-mask" @click.self="close">
      <div class="modal">
        <h3>复核通过并入库 · {{ survey.surveyNo }}</h3>
        <p class="modal-tip">入库后该测量整份只读，现场有变化只能新开补测；结论会同步到阀门井巡检待办。</p>
        <label class="modal-field">
          <span>入库结论 <i>*</i></span>
          <textarea v-model="conclusion" rows="4" placeholder="例如：竣工测量成果合格，管段起止点及附属阀门井坐标与现场一致，准予入库（GIS管网库编号）。"></textarea>
        </label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="close">取消</button>
          <button class="btn primary" type="button" @click="confirmWarehouse">确认入库</button>
        </div>
      </div>
    </div>

    <!-- 作废归档 -->
    <div v-else-if="dialog === 'void'" class="modal-mask" @click.self="close">
      <div class="modal">
        <h3>整份作废归档 · {{ survey.surveyNo }}</h3>
        <p class="modal-tip">作废后整份归档不再流转，页面上仍可查到当时的点位坐标；已入库的测量不走作废。</p>
        <label class="modal-field">
          <span>作废原因 <i>*</i></span>
          <textarea v-model="reason" rows="3" placeholder="例如：管段随道路改线废除，测量成果不再入库"></textarea>
        </label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="close">取消</button>
          <button class="btn primary danger-btn" type="button" @click="confirmVoid">确认作废</button>
        </div>
      </div>
    </div>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  availableActions,
  confirmWarehoused,
  createSupplement,
  returnToField,
  submitToReview,
  voidSurvey,
} from '@/api/pipeline-service'
import type { PipelineSurvey } from '@/data/pipeline-types'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ survey: PipelineSurvey }>()
const emit = defineEmits<{
  (e: 'done', payload: { ok: boolean; message: string; newSurveyId?: number }): void
}>()

const store = useSessionStore()
const dialog = ref<'' | 'return' | 'warehouse' | 'void'>('')
const reason = ref('')
const conclusion = ref('')

const actions = computed(() => availableActions(props.survey))

function close() {
  dialog.value = ''
  reason.value = ''
  conclusion.value = ''
}

function onAction(action: string) {
  if (action === '送资料复核') {
    const result = submitToReview(props.survey.id, store.operator)
    emit('done', { ok: result.ok, message: result.message })
    return
  }
  if (action === '复核退回') {
    reason.value = props.survey.returnedReason
    dialog.value = 'return'
    return
  }
  if (action === '复核通过并入库') {
    conclusion.value = ''
    dialog.value = 'warehouse'
    return
  }
  if (action === '作废归档') {
    reason.value = ''
    dialog.value = 'void'
    return
  }
  if (action === '新开补测') {
    const result = createSupplement(props.survey.id, props.survey.surveyor || store.operator)
    emit('done', { ok: result.ok, message: result.message, newSurveyId: result.survey?.id })
  }
}

function confirmReturn() {
  const result = returnToField(props.survey.id, reason.value, store.operator)
  if (result.ok) {
    close()
  }
  emit('done', { ok: result.ok, message: result.message })
}

function confirmWarehouse() {
  const result = confirmWarehoused(props.survey.id, conclusion.value, store.operator)
  if (result.ok) {
    close()
  }
  emit('done', { ok: result.ok, message: result.message })
}

function confirmVoid() {
  const result = voidSurvey(props.survey.id, reason.value, store.operator)
  if (result.ok) {
    close()
  }
  emit('done', { ok: result.ok, message: result.message })
}
</script>
