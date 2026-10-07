import { ref } from 'vue'

import {
  approveArchive,
  createResurvey,
  createSurvey,
  nextSurveyNo,
  returnToField,
  submitReview,
  updateSurvey,
  voidSurvey,
  type SurveyPayload,
} from '@/api/pipesurvey-service'
import type { ActionResult, EntryRow } from '@/data/types'

export type ReasonMode = 'return' | 'archive' | 'void'

export const REASON_META: Record<ReasonMode, { title: string; label: string; placeholder: string; confirm: string; preset: string }> = {
  return: {
    title: '复核退回',
    label: '缺少的资料',
    placeholder: '写明缺哪一份资料，例：缺《隐蔽工程验收记录》',
    confirm: '确认退回',
    preset: '',
  },
  archive: {
    title: '复核入库',
    label: '入库结论',
    placeholder: '结论会随记录落库，详情页与列表页一致可查',
    confirm: '确认入库',
    preset: '竣工图、坐标成果表、隐蔽工程验收记录齐全，同意入库',
  },
  void: {
    title: '作废测量',
    label: '作废原因',
    placeholder: '作废后整份归档，坐标仍可在详情页查到',
    confirm: '确认作废',
    preset: '',
  },
}

export function emptySurveyPayload(): SurveyPayload {
  return {
    测量编号: nextSurveyNo(),
    管段编号: '',
    管段起点: '',
    管段止点: '',
    点位坐标: '',
    测量人员: '',
    测量日期: new Date().toLocaleDateString('sv-SE'),
  }
}

function payloadOf(row: EntryRow): SurveyPayload {
  return {
    测量编号: String(row['测量编号'] ?? ''),
    管段编号: String(row['管段编号'] ?? ''),
    管段起点: String(row['管段起点'] ?? ''),
    管段止点: String(row['管段止点'] ?? ''),
    点位坐标: String(row['点位坐标'] ?? ''),
    测量人员: String(row['测量人员'] ?? ''),
    测量日期: String(row['测量日期'] ?? ''),
  }
}

// 列表页与详情页共用的一套动作：弹窗状态、服务调用、结果提示，办完事调 onDone 让页面重读数据。
export function useSurveyActions(onDone: () => void) {
  const errorMessage = ref('')
  const noticeMessage = ref('')

  const formOpen = ref(false)
  const formTitle = ref('登记竣工测量')
  const formInitial = ref<SurveyPayload>(emptySurveyPayload())
  const editingId = ref<number | null>(null)

  const reasonOpen = ref(false)
  const reasonMode = ref<ReasonMode>('return')
  const reasonRow = ref<EntryRow | null>(null)

  function report(result: ActionResult) {
    if (result.ok) {
      noticeMessage.value = result.message
      errorMessage.value = ''
      onDone()
    } else {
      errorMessage.value = result.message
      noticeMessage.value = ''
    }
  }

  function openCreate() {
    editingId.value = null
    formTitle.value = '登记竣工测量'
    formInitial.value = emptySurveyPayload()
    formOpen.value = true
  }

  function openEdit(row: EntryRow) {
    editingId.value = Number(row.id)
    formTitle.value = `补充测量 ${row['测量编号']}（仅现场测量状态可改）`
    formInitial.value = payloadOf(row)
    formOpen.value = true
  }

  function submitForm(payload: SurveyPayload) {
    const result =
      editingId.value === null ? createSurvey(payload) : updateSurvey(editingId.value, payload)
    if (result.ok) {
      formOpen.value = false
    }
    report(result)
  }

  function openReason(mode: ReasonMode, row: EntryRow) {
    reasonMode.value = mode
    reasonRow.value = row
    reasonOpen.value = true
  }

  function submitReason(text: string) {
    const row = reasonRow.value
    if (!row) {
      return
    }
    const id = Number(row.id)
    const result =
      reasonMode.value === 'return'
        ? returnToField(id, text)
        : reasonMode.value === 'archive'
          ? approveArchive(id, text)
          : voidSurvey(id, text)
    if (result.ok) {
      reasonOpen.value = false
    }
    report(result)
  }

  function runDirect(action: '提交复核' | '新开补测', row: EntryRow) {
    const id = Number(row.id)
    report(action === '提交复核' ? submitReview(id) : createResurvey(id))
  }

  return {
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
  }
}
