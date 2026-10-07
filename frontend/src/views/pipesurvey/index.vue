<template>
  <section class="page" data-module="pipesurvey">
    <header class="page-head">
      <div>
        <h2>管网竣工测量与入库台账</h2>
        <p class="page-desc">{{ meta.desc }}</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记竣工测量</button>
        <button class="btn" type="button" @click="exportRows">导出测量清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="goDetail(row)">详情</button>
            <template v-if="row.status === '现场测量'">
              <button class="link" type="button" @click="runDirect('提交复核', row)">提交复核</button>
              <button class="link" type="button" @click="openEdit(row)">补充修改</button>
              <button class="link" type="button" @click="openReason('void', row)">作废</button>
            </template>
            <template v-else-if="row.status === '资料复核'">
              <button class="link" type="button" @click="openReason('archive', row)">复核入库</button>
              <button class="link" type="button" @click="openReason('return', row)">复核退回</button>
              <button class="link" type="button" @click="openReason('void', row)">作废</button>
            </template>
            <template v-else-if="row.status === '已入库'">
              <button class="link" type="button" @click="runDirect('新开补测', row)">新开补测</button>
            </template>
            <span v-else class="muted-text">已归档</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无竣工测量数据，可先登记竣工测量</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条竣工测量记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
    </footer>

    <SurveyFormModal
      :open="formOpen"
      :title="formTitle"
      :initial="formInitial"
      @cancel="formOpen = false"
      @save="submitForm"
    />
    <SurveyReasonModal
      :open="reasonOpen"
      :mode="reasonMode"
      :row="reasonRow"
      @cancel="reasonOpen = false"
      @confirm="submitReason"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import { listSurveys, SURVEY_STATUSES } from '@/api/pipesurvey-service'
import type { EntryRow } from '@/data/types'
import SurveyFormModal from './SurveyFormModal.vue'
import SurveyReasonModal from './SurveyReasonModal.vue'
import { useSurveyActions } from './use-survey-actions'

const meta = moduleMeta('pipesurvey')
const columns = meta.fields
const filterFields = ['测量编号', '管段编号', '测量人员']

const router = useRouter()
const rows = ref<EntryRow[]>([])
const total = ref(0)
const filters = ref<Record<string, string>>({})

const stats = computed(() => [
  { label: '在办测量', value: rows.value.filter((row) => ['现场测量', '资料复核'].includes(String(row.status))).length },
  { label: '已入库测量', value: rows.value.filter((row) => row.status === '已入库').length },
  { label: '已作废测量', value: rows.value.filter((row) => row.status === '已作废').length },
])

const statusSummary = computed(() =>
  SURVEY_STATUSES.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function reload() {
  const payload = listSurveys(filters.value)
  rows.value = payload.items
  total.value = payload.total
}

const {
  errorMessage,
  noticeMessage,
  formOpen,
  formTitle,
  formInitial,
  reasonOpen,
  reasonMode,
  reasonRow,
  openCreate,
  openEdit,
  submitForm,
  openReason,
  submitReason,
  runDirect,
} = useSurveyActions(reload)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function goDetail(row: EntryRow) {
  router.push({ name: 'pipesurvey-detail', params: { id: row.id } })
}

onMounted(reload)
</script>
