<template>
  <section class="page" v-if="survey">
    <header class="page-head">
      <div>
        <h2>
          测量详情 · {{ survey.surveyNo }}
          <span class="tag" :class="statusClass(survey.status)">{{ survey.status }}</span>
          <span v-if="survey.supersedesId" class="tag tag-version">第{{ survey.version }}版补测</span>
        </h2>
        <p class="page-desc">
          管段 {{ survey.segmentCode }}（{{ survey.segmentName }}）。
          <template v-if="survey.status === '已入库'">
            本测量已入库，记录整份只读；现场如有变化只能新开补测版本。
          </template>
          <template v-else-if="survey.status === '已作废'">
            本测量已整份作废归档，以下坐标与资料为归档时留存，仅供查询。
          </template>
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/pipeline">返回台账列表</RouterLink>
        <button
          v-if="sourceSurvey"
          class="btn"
          type="button"
          @click="$router.push(`/pipeline/${sourceSurvey.id}`)"
        >
          查看原测量 {{ sourceSurvey.surveyNo }}
        </button>
      </div>
    </header>

    <!-- 流程节点：只许逐格走，当前在哪格一目了然 -->
    <ol class="flow-bar">
      <li
        v-for="(step, idx) in flowSteps"
        :key="step.name"
        class="flow-step"
        :class="stepClass(step.name)"
      >
        <span class="flow-index">{{ idx + 1 }}</span>
        <span class="flow-name">{{ step.name }}</span>
        <span v-if="step.time" class="flow-time">{{ step.time }}</span>
        <span v-if="step.name === '现场测量' && survey.returnedReason" class="flow-badge">退回重测</span>
      </li>
    </ol>

    <div v-if="survey.returnedReason" class="callout callout-warn">
      <strong>最近一次复核退回（缺件）：</strong>{{ survey.returnedReason }}
    </div>
    <div v-if="survey.warehouseConclusion" class="callout callout-done">
      <strong>入库结论（{{ survey.warehousedAt }} · {{ survey.warehouseOperator }}）：</strong>
      {{ survey.warehouseConclusion }}
    </div>
    <div v-if="survey.status === '已作废'" class="callout callout-void">
      <strong>作废归档（{{ survey.voidedAt }}）：</strong>{{ survey.voidReason }}
    </div>

    <div class="detail-grid">
      <article class="detail-card">
        <h3>测量与管段</h3>
        <dl class="detail-list">
          <dt>测量编号</dt><dd>{{ survey.surveyNo }}</dd>
          <dt>版次</dt><dd>第{{ survey.version }}版<template v-if="sourceSurvey">（补测自 {{ sourceSurvey.surveyNo }}）</template></dd>
          <dt>管段编号</dt><dd>{{ survey.segmentCode }}</dd>
          <dt>管段名称</dt><dd>{{ survey.segmentName }}</dd>
          <dt>管材 / 管径</dt><dd>{{ survey.material || '—' }} / {{ survey.diameter || '—' }}</dd>
          <dt>测量人员</dt><dd>{{ survey.surveyor }}</dd>
          <dt>测量日期</dt><dd>{{ survey.surveyedAt }}</dd>
        </dl>
      </article>

      <article class="detail-card">
        <h3>管段起止与点位坐标</h3>
        <table class="coord-table">
          <thead>
            <tr><th>点位</th><th>位置描述</th><th>X 坐标</th><th>Y 坐标</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>起点</td><td>{{ survey.startPoint }}</td>
              <td class="mono">{{ survey.startX }}</td><td class="mono">{{ survey.startY }}</td>
            </tr>
            <tr>
              <td>止点</td><td>{{ survey.endPoint }}</td>
              <td class="mono">{{ survey.endX }}</td><td class="mono">{{ survey.endY }}</td>
            </tr>
          </tbody>
        </table>
        <p class="coord-hint">坐标为 CGCS2000 平面坐标（单位：米）；作废归档后此坐标即为归档时点坐标，不再变更。</p>
      </article>
    </div>

    <article class="detail-card">
      <h3>流转记录</h3>
      <table class="data-table">
        <thead>
          <tr><th>时间</th><th>动作</th><th>从</th><th>到</th><th>经办人</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr v-for="(event, idx) in survey.history" :key="idx">
            <td>{{ event.time }}</td>
            <td>{{ event.action }}</td>
            <td>{{ event.from }}</td>
            <td>{{ event.to }}</td>
            <td>{{ event.operator }}</td>
            <td>{{ event.note || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </article>

    <div class="detail-actions">
      <SurveyActionButtons :survey="survey" @done="onActionDone" />
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </div>
  </section>

  <section v-else class="page">
    <p class="empty-state">没有找到这份测量，<RouterLink class="link" to="/pipeline">返回台账列表</RouterLink>。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  availableActions,
  getSurvey,
} from '@/api/pipeline-service'
import { SURVEY_FLOW } from '@/data/pipeline-types'
import type { PipelineSurvey, SurveyStatus } from '@/data/pipeline-types'
import SurveyActionButtons from './SurveyActionButtons.vue'

const route = useRoute()
const survey = ref<PipelineSurvey | null>(null)
const message = ref('')
const messageOk = ref(true)

const flowSteps = computed(() => {
  if (!survey.value) {
    return []
  }
  const s = survey.value
  return [
    {
      name: '现场测量' as SurveyStatus,
      time: s.history.find((e) => e.to === '现场测量')?.time ?? s.createdAt,
    },
    {
      name: '资料复核' as SurveyStatus,
      time: s.history.find((e) => e.to === '资料复核')?.time ?? '',
    },
    {
      name: '已入库' as SurveyStatus,
      time: s.warehousedAt,
    },
  ]
})

const sourceSurvey = computed(() => {
  if (!survey.value?.supersedesId) {
    return null
  }
  return getSurvey(survey.value.supersedesId)
})

// 状态在流程条上的位置：作废不占主流程格，单独标灰。
function stepClass(name: SurveyStatus): string {
  if (!survey.value) {
    return ''
  }
  const current = survey.value.status
  if (current === '已作废') {
    return survey.value.returnedReason && name === '现场测量' ? 'step-warn' : 'step-void'
  }
  const order = SURVEY_FLOW
  const curIdx = order.indexOf(current)
  const stepIdx = order.indexOf(name as (typeof SURVEY_FLOW)[number])
  if (stepIdx < curIdx) {
    return 'step-done'
  }
  if (stepIdx === curIdx) {
    return name === '已入库' ? 'step-done' : 'step-current'
  }
  return 'step-todo'
}

function statusClass(status: string): string {
  if (status === '已入库') return 'st-done'
  if (status === '资料复核') return 'st-review'
  if (status === '已作废') return 'st-void'
  return 'st-field'
}

function onActionDone(payload: { ok: boolean; message: string }) {
  message.value = payload.message
  messageOk.value = payload.ok
  reload()
}

function reload() {
  const id = Number(route.params.id)
  survey.value = Number.isFinite(id) ? getSurvey(id) : null
  // 已作废 / 已入库时按钮组件会自行判空动作；这里触发一次重渲染即可
  if (survey.value) {
    availableActions(survey.value)
  }
}

onMounted(reload)
</script>
