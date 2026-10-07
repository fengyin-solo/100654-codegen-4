<template>
  <section class="page" data-module="valve">
    <header class="page-head">
      <div>
        <h2>阀门井巡检管理</h2>
        <p class="page-desc">维护阀门井台账，围绕阀门井编号、所在道路、阀门口径、阀门类型做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记阀门井台账</button>
        <button class="btn" type="button" @click="exportRows">导出阀门井巡检清单</button>
      </div>
    </header>

    <!-- 竣工测量入库结论同步过来的巡检待办 -->
    <article class="sync-panel">
      <header class="sync-head">
        <h3>管网入库同步待办</h3>
        <label class="sync-filter">
          <input v-model="showDoneTodos" type="checkbox" @change="reloadTodos" />
          显示已办结（{{ todos.length }} 条）
        </label>
      </header>
      <p class="page-desc">下列待办由「管网竣工测量入库」在确认入库时自动同步，测量编号、管段与入库结论均取自落库记录；现场核对阀门井坐标无误后办结。</p>
      <table v-if="visibleTodos.length" class="data-table">
        <thead>
          <tr>
            <th>测量编号</th>
            <th>管段编号 / 名称</th>
            <th>入库结论</th>
            <th>入库时间</th>
            <th>待办状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="todo in visibleTodos" :key="todo.id" :class="{ 'row-done': todo.done }">
            <td>
              <RouterLink class="link" :to="`/pipeline/${todo.surveyId}`">{{ todo.surveyNo }}</RouterLink>
            </td>
            <td>
              <div>{{ todo.segmentCode }}</div>
              <div class="cell-sub">{{ todo.segmentName }}</div>
            </td>
            <td class="cell-conclusion">{{ todo.conclusion }}</td>
            <td>{{ todo.warehousedAt }}</td>
            <td>
              <span class="status-tag" :class="todo.done ? 'st-done' : 'st-review'">
                {{ todo.done ? `已办结 ${todo.doneAt}` : '待现场核对' }}
              </span>
            </td>
            <td>
              <button v-if="!todo.done" class="link" type="button" @click="finishTodo(todo.id)">现场核对无误，办结</button>
              <span v-else class="cell-muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">暂无管网入库同步的巡检待办</p>
    </article>

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
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无阀门井巡检数据，可先登记阀门井台账</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条阀门井巡检记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  completeValveTodo,
  listValveInspectionTodos,
} from '@/api/pipeline-service'
import type { ValveInspectionTodo } from '@/data/pipeline-types'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('valve')
const columns = ["阀门井编号", "所在道路", "阀门口径", "阀门类型", "开启状态", "责任班组", "巡检日期", "阀门状态"]
const actions = ["提交巡检", "判定正常", "提出维护"]
const statuses = ["待巡检", "启闭正常", "需维护", "已封堵"]
const stats = [{"label": "待巡检阀门井", "value": 0}, {"label": "启闭正常阀门井", "value": 0}, {"label": "需维护阀门井", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

// 入库同步待办：与竣工测量台账读同一存储，入库结论改不了，这里也不会变。
const todos = ref<ValveInspectionTodo[]>([])
const showDoneTodos = ref(false)
const visibleTodos = computed(() =>
  showDoneTodos.value ? todos.value : todos.value.filter((todo) => !todo.done),
)

function reloadTodos() {
  todos.value = listValveInspectionTodos(true)
}

function finishTodo(id: number) {
  errorMessage.value = ''
  const result = completeValveTodo(id)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reloadTodos()
}

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '阀门井台账登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '阀门井巡检列表读取失败'
  }
  reloadTodos()
}

onMounted(reload)
</script>
