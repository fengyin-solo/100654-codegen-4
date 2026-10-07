<template>
  <section class="page" data-module="pipesurvey">
    <header class="page-head">
      <div>
        <h2>竣工测量详情 · {{ row ? row['测量编号'] : '未找到' }}</h2>
        <p class="page-desc">与列表页读同一份台账数据，状态、结论、坐标保持一致。</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost" type="button" @click="router.push({ name: 'pipesurvey' })">返回台账</button>
        <template v-if="row">
          <button v-if="row.status === '现场测量'" class="btn primary" type="button" @click="runDirect('提交复核', row)">提交复核</button>
          <button v-if="row.status === '现场测量'" class="btn" type="button" @click="openEdit(row)">补充修改</button>
          <button v-if="row.status === '资料复核'" class="btn primary" type="button" @click="openReason('archive', row)">复核入库</button>
          <button v-if="row.status === '资料复核'" class="btn" type="button" @click="openReason('return', row)">复核退回</button>
          <button v-if="row.status === '现场测量' || row.status === '资料复核'" class="btn" type="button" @click="openReason('void', row)">作废</button>
          <button v-if="row.status === '已入库'" class="btn primary" type="button" @click="runDirect('新开补测', row)">新开一版补测</button>
        </template>
      </div>
    </header>

    <template v-if="row">
      <table class="data-table detail-table">
        <tbody>
          <tr>
            <th>测量编号</th><td>{{ row['测量编号'] }}</td>
            <th>当前状态</th><td>{{ row.status }}</td>
          </tr>
          <tr>
            <th>管段编号</th><td>{{ row['管段编号'] }}</td>
            <th>版本号</th><td>第 {{ row['版本号'] }} 版</td>
          </tr>
          <tr>
            <th>管段起点</th><td>{{ row['管段起点'] }}</td>
            <th>管段止点</th><td>{{ row['管段止点'] }}</td>
          </tr>
          <tr>
            <th>测量人员</th><td>{{ row['测量人员'] }}</td>
            <th>测量日期</th><td>{{ row['测量日期'] }}</td>
          </tr>
          <tr>
            <th>点位坐标</th>
            <td colspan="3" class="coord-cell">{{ row['点位坐标'] }}</td>
          </tr>
          <tr v-if="row['退回原因']">
            <th>复核退回</th>
            <td colspan="3">缺 {{ row['退回原因'] }}（{{ row['退回时间'] }}），已回到现场测量重新走</td>
          </tr>
          <tr v-if="row['入库结论']">
            <th>入库结论</th>
            <td colspan="3">{{ row['入库结论'] }}（{{ row['入库时间'] }} 落库，已同步阀门井巡检待办）</td>
          </tr>
          <tr v-if="row['作废原因']">
            <th>作废归档</th>
            <td colspan="3">{{ row['作废原因'] }}（{{ row['作废时间'] }}），整份归档、坐标保留可查</td>
          </tr>
        </tbody>
      </table>

      <h3 class="section-title">同一管段的测量版本</h3>
      <table class="data-table">
        <thead>
          <tr><th>版本号</th><th>测量编号</th><th>测量日期</th><th>当前状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in versions" :key="String(item.id)" :class="{ 'current-row': item.id === row.id }">
            <td>第 {{ item['版本号'] }} 版</td>
            <td>{{ item['测量编号'] }}</td>
            <td>{{ item['测量日期'] }}</td>
            <td>{{ item.status }}</td>
            <td class="row-actions">
              <button v-if="item.id !== row.id" class="link" type="button" @click="goDetail(item)">查看</button>
              <span v-else class="muted-text">当前</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-else class="empty-state">没有找到这条竣工测量记录，可能已被重置。</p>

    <footer class="page-foot">
      <span>已入库与已作废的测量整份锁定，不再改动</span>
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
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getSurvey, surveyVersions } from '@/api/pipesurvey-service'
import type { EntryRow } from '@/data/types'
import SurveyFormModal from './SurveyFormModal.vue'
import SurveyReasonModal from './SurveyReasonModal.vue'
import { useSurveyActions } from './use-survey-actions'

const route = useRoute()
const router = useRouter()
const row = ref<EntryRow | null>(null)
const versions = ref<EntryRow[]>([])

function reload() {
  const found = getSurvey(Number(route.params.id))
  row.value = found
  versions.value = found ? surveyVersions(String(found['管段编号'])) : []
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
  openEdit,
  submitForm,
  openReason,
  submitReason,
  runDirect,
} = useSurveyActions(reload)

function goDetail(item: EntryRow) {
  router.push({ name: 'pipesurvey-detail', params: { id: item.id } })
}

watch(() => route.params.id, reload)
onMounted(reload)
</script>
