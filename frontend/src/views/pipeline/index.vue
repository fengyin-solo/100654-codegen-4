<template>
  <section class="page" data-module="pipeline">
    <header class="page-head">
      <div>
        <h2>新建供水管网竣工测量与入库台账</h2>
        <p class="page-desc">
          一份测量挂测量编号、管段起止与点位坐标；入库状态只许从现场测量 → 资料复核 → 已入库逐格流转。
          已入库测量不再改动，只能新开补测；作废测量整份归档、坐标可查；入库结论落库后同步阀门井巡检待办。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="showCreate = true">新建竣工测量</button>
        <button class="btn" type="button" @click="exportRows">导出台账</button>
        <button class="btn ghost" type="button" @click="resetData">重置示例数据</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in cards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item" :class="item.cls">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>测量编号 / 管段编号 / 名称 / 点位 / 人员</span>
        <input v-model="filters.keyword" placeholder="按关键词检索" />
      </label>
      <label class="filter-item">
        <span>入库状态</span>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option v-for="status in allStatuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>测量编号</th>
          <th>版次</th>
          <th>管段编号 / 名称</th>
          <th>起止点</th>
          <th>点位坐标（X, Y）</th>
          <th>测量人员 / 日期</th>
          <th>当前状态</th>
          <th>入库结论</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :class="{ 'row-void': row.status === '已作废', 'row-done': row.status === '已入库' }">
          <td>
            <RouterLink class="link" :to="`/pipeline/${row.id}`">{{ row.surveyNo }}</RouterLink>
            <span v-if="row.supersedesId" class="tag tag-version">补测第{{ row.version }}版</span>
          </td>
          <td>第{{ row.version }}版</td>
          <td>
            <div>{{ row.segmentCode }}</div>
            <div class="cell-sub">{{ row.segmentName }}</div>
          </td>
          <td>
            <div>起：{{ row.startPoint }}</div>
            <div>止：{{ row.endPoint }}</div>
          </td>
          <td class="cell-coord">
            <div>起：{{ row.startX }}, {{ row.startY }}</div>
            <div>止：{{ row.endX }}, {{ row.endY }}</div>
          </td>
          <td>
            <div>{{ row.surveyor }}</div>
            <div class="cell-sub">{{ row.surveyedAt }}</div>
          </td>
          <td>
            <span class="status-tag" :class="statusClass(row.status)">{{ row.status }}</span>
            <div v-if="row.status === '现场测量' && row.returnedReason" class="cell-warn">退回待补齐</div>
          </td>
          <td class="cell-conclusion">
            <span v-if="row.warehouseConclusion" :title="row.warehouseConclusion">
              {{ row.warehouseConclusion.length > 24 ? row.warehouseConclusion.slice(0, 24) + '…' : row.warehouseConclusion }}
            </span>
            <span v-else class="cell-muted">—</span>
          </td>
          <td>
            <SurveyActionButtons :survey="row" @done="onActionDone" />
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="9" class="empty-state">暂无符合条件的竣工测量，可点右上角「新建竣工测量」登记</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 条测量记录（含已作废归档 {{ stats.voidCount }} 条）</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <SurveyCreateDialog
      v-if="showCreate"
      @close="showCreate = false"
      @created="onCreated"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  listSurveyEntries,
  surveyStats,
} from '@/api/pipeline-service'
import { resetPipelineData } from '@/data/pipeline-store'
import { SURVEY_STATUSES } from '@/data/pipeline-types'
import type { PipelineSurvey, SurveyStats } from '@/data/pipeline-types'
import { downloadPipelineCsv } from '@/api/pipeline-export'
import SurveyActionButtons from './SurveyActionButtons.vue'
import SurveyCreateDialog from './SurveyCreateDialog.vue'

const router = useRouter()
const allStatuses = SURVEY_STATUSES

const rows = ref<PipelineSurvey[]>([])
const stats = ref<SurveyStats>({
  total: 0, fieldCount: 0, reviewCount: 0, warehousedCount: 0, voidCount: 0, pending: 0, abnormal: 0,
})
const filters = reactive({ keyword: '', status: '' })
const showCreate = ref(false)
const message = ref('')
const messageOk = ref(true)
let messageTimer: ReturnType<typeof setTimeout> | undefined

const cards = computed(() => [
  { label: '现场测量', value: stats.value.fieldCount },
  { label: '资料复核', value: stats.value.reviewCount },
  { label: '已入库', value: stats.value.warehousedCount },
  { label: '已作废归档', value: stats.value.voidCount },
  { label: '待处理', value: stats.value.pending },
])

const statusSummary = computed(() =>
  allStatuses.map((status) => ({
    status,
    count: rows.value.filter((row) => row.status === status).length,
    cls: statusClass(status),
  })),
)

function statusClass(status: string): string {
  if (status === '已入库') return 'st-done'
  if (status === '资料复核') return 'st-review'
  if (status === '已作废') return 'st-void'
  return 'st-field'
}

function flash(text: string, ok = true) {
  message.value = text
  messageOk.value = ok
  if (messageTimer) {
    clearTimeout(messageTimer)
  }
  messageTimer = setTimeout(() => {
    message.value = ''
  }, 4000)
}

function reload() {
  rows.value = listSurveyEntries(filters)
  stats.value = surveyStats()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  reload()
}

function onActionDone(payload: { ok: boolean; message: string; newSurveyId?: number }) {
  flash(payload.message, payload.ok)
  reload()
  if (payload.newSurveyId) {
    router.push(`/pipeline/${payload.newSurveyId}`)
  }
}

function onCreated(payload: { message: string; id: number }) {
  showCreate.value = false
  reload()
  flash(payload.message, true)
  router.push(`/pipeline/${payload.id}`)
}

function exportRows() {
  downloadPipelineCsv()
  flash('台账 CSV 已导出', true)
}

function resetData() {
  resetPipelineData()
  reload()
  flash('已恢复为示例数据', true)
}

onMounted(reload)
</script>
