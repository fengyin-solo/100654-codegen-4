import type { ActionResult } from '@/data/types'
import {
  listSurveys,
  listValveTodos,
  saveSurveys,
  saveValveTodos,
} from '@/data/pipeline-store'
import { SURVEY_FLOW } from '@/data/pipeline-types'
import type {
  PipelineSurvey,
  SurveyDraft,
  SurveyFilters,
  SurveyHistoryEvent,
  SurveyStats,
  SurveyStatus,
  ValveInspectionTodo,
} from '@/data/pipeline-types'

export type SurveyResult = ActionResult & { survey?: PipelineSurvey }

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function today(): string {
  return now().slice(0, 10)
}

function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function isPending(status: SurveyStatus): boolean {
  return status === '现场测量' || status === '资料复核'
}

function pushHistory(
  survey: PipelineSurvey,
  action: string,
  from: SurveyHistoryEvent['from'],
  to: SurveyStatus,
  operator: string,
  note?: string,
): void {
  const event: SurveyHistoryEvent = { time: now(), action, from, to, operator }
  if (note && note.trim() !== '') {
    event.note = note.trim()
  }
  survey.history.push(event)
}

// 测量编号按 日期-流水 生成，同一次报送一份测量一个号。
function generateSurveyNo(rows: PipelineSurvey[]): string {
  const datePart = now().slice(0, 10).replace(/-/g, '')
  const seq = rows.filter((row) => row.surveyNo.includes(datePart)).length + 1
  return `CL-${datePart}-${String(seq).padStart(3, '0')}`
}

// 在办（现场测量、资料复核）或已入库的测量都会占住这条管段；已作废不占位，允许重新报送。
function findBlockingSegment(rows: PipelineSurvey[], segmentCode: string, excludeId?: number): PipelineSurvey | undefined {
  return rows.find(
    (row) =>
      row.segmentCode.trim() === segmentCode.trim() &&
      row.id !== excludeId &&
      row.status !== '已作废',
  )
}

function validateDraft(draft: SurveyDraft): string {
  const required: [keyof SurveyDraft, string][] = [
    ['segmentCode', '管段编号'],
    ['segmentName', '管段名称'],
    ['startPoint', '起点位置'],
    ['endPoint', '止点位置'],
    ['startX', '起点X坐标'],
    ['startY', '起点Y坐标'],
    ['endX', '止点X坐标'],
    ['endY', '止点Y坐标'],
    ['surveyor', '测量人员'],
  ]
  for (const [key, label] of required) {
    if (String(draft[key] ?? '').trim() === '') {
      return `请填写${label}`
    }
  }
  const coordFields: [keyof SurveyDraft, string][] = [
    ['startX', '起点X'], ['startY', '起点Y'], ['endX', '止点X'], ['endY', '止点Y'],
  ]
  for (const [key, label] of coordFields) {
    const value = String(draft[key]).trim()
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
      return `${label}坐标必须是数字`
    }
  }
  return ''
}

function loadSurvey(id: number): { rows: PipelineSurvey[]; index: number } | null {
  const rows = listSurveys()
  const index = rows.findIndex((row) => row.id === id)
  return index < 0 ? null : { rows, index }
}

// 新建现场测量：同管段有在办/已入库测量时，按重复报送拦截，只留一条。
export function createSurvey(draft: SurveyDraft, operator: string): SurveyResult {
  const error = validateDraft(draft)
  if (error) {
    return { ok: false, message: error }
  }
  const rows = listSurveys()
  const blocking = findBlockingSegment(rows, draft.segmentCode.trim())
  if (blocking) {
    if (blocking.status === '已入库') {
      return {
        ok: false,
        message: `管段「${draft.segmentCode.trim()}」已有入库测量 ${blocking.surveyNo}（第${blocking.version}版），入库成果不能重复报送；如需变更请对它「新开补测」。`,
      }
    }
    return {
      ok: false,
      message: `管段「${draft.segmentCode.trim()}」已有在办测量 ${blocking.surveyNo}（状态：${blocking.status}），同一管段重复报送只保留一条。`,
    }
  }

  const id = nextId(rows)
  const survey: PipelineSurvey = {
    id,
    surveyNo: generateSurveyNo(rows),
    version: 1,
    supersedesId: null,
    segmentCode: draft.segmentCode.trim(),
    segmentName: draft.segmentName.trim(),
    startPoint: draft.startPoint.trim(),
    endPoint: draft.endPoint.trim(),
    startX: draft.startX.trim(),
    startY: draft.startY.trim(),
    endX: draft.endX.trim(),
    endY: draft.endY.trim(),
    material: draft.material.trim(),
    diameter: draft.diameter.trim(),
    surveyor: draft.surveyor.trim(),
    surveyedAt: draft.surveyedAt || today(),
    status: '现场测量',
    pending: true,
    abnormal: false,
    returnedReason: '',
    warehouseConclusion: '',
    warehousedAt: '',
    warehouseOperator: '',
    voidReason: '',
    voidedAt: '',
    history: [],
    createdAt: now(),
  }
  pushHistory(survey, '现场测量报送', '新建', '现场测量', operator)
  saveSurveys([...rows, survey])
  return { ok: true, message: `测量 ${survey.surveyNo} 已登记，当前在「现场测量」`, survey }
}

// 对已入库测量新开一版补测：原测量原样保留，生成同管段的新测量，从现场测量重新走流程。
export function createSupplement(id: number, operator: string): SurveyResult {
  const found = loadSurvey(id)
  if (!found) {
    return { ok: false, message: '没有找到这份测量' }
  }
  const source = found.rows[found.index]
  if (source.status !== '已入库') {
    return { ok: false, message: '只有「已入库」的测量需要新开补测；在办测量请直接在原测量上继续流转。' }
  }
  const rows = listSurveys()
  // 已入库版本已有在办的补测版时，也按重复报送拦截，避免同管段并行两条在办。
  const openSupplement = rows.find(
    (row) =>
      row.supersedesId === source.id ||
      (row.segmentCode === source.segmentCode && isPending(row.status)),
  )
  if (openSupplement) {
    return {
      ok: false,
      message: `该管段已有在办的第${openSupplement.version}版补测 ${openSupplement.surveyNo}，请先办结，不要重复新开。`,
    }
  }

  const nextVersion = rows
    .filter((row) => row.segmentCode === source.segmentCode)
    .reduce((max, row) => Math.max(max, row.version), 0) + 1
  const newId = nextId(rows)
  const supplement: PipelineSurvey = {
    ...structuredClone(source),
    id: newId,
    surveyNo: generateSurveyNo(rows),
    version: nextVersion,
    supersedesId: source.id,
    surveyedAt: today(),
    surveyor: operator,
    returnedReason: '',
    warehouseConclusion: '',
    warehousedAt: '',
    warehouseOperator: '',
    voidReason: '',
    voidedAt: '',
    status: '现场测量',
    pending: true,
    abnormal: false,
    history: [],
    createdAt: now(),
  }
  pushHistory(
    supplement,
    `对已入库测量新开补测（第${nextVersion}版）`,
    '新建',
    '现场测量',
    operator,
    `依据 ${source.surveyNo}（第${source.version}版，入库结论：${source.warehouseConclusion || '—'}）补测；原入库测量不改动。`,
  )
  saveSurveys([...rows, supplement])
  return { ok: true, message: `已新开第${nextVersion}版补测 ${supplement.surveyNo}，请从现场测量重新报送`, survey: supplement }
}

// 现场测量 → 资料复核：主流程只许逐格往前。
export function submitToReview(id: number, operator: string): SurveyResult {
  const found = loadSurvey(id)
  if (!found) {
    return { ok: false, message: '没有找到这份测量' }
  }
  const { rows, index } = found
  const survey = rows[index]
  if (survey.status !== '现场测量') {
    if (survey.status === '已作废') {
      return { ok: false, message: '该测量已作废归档，不能再送复核。' }
    }
    if (survey.status === '已入库') {
      return { ok: false, message: '该测量已入库，不能重复送复核；如需变更请新开补测。' }
    }
    return { ok: false, message: '只有「现场测量」可以送资料复核，不能跨格操作。' }
  }
  const updated: PipelineSurvey = { ...survey, status: '资料复核', abnormal: false, returnedReason: '' }
  pushHistory(updated, '送资料复核', '现场测量', '资料复核', operator)
  rows[index] = updated
  saveRows(rows)
  return { ok: true, message: `${survey.surveyNo} 已送资料复核`, survey: updated }
}

// 复核退回：必须写明缺哪一份资料，状态退回现场测量重新走。
export function returnToField(id: number, reason: string, operator: string): SurveyResult {
  const found = loadSurvey(id)
  if (!found) {
    return { ok: false, message: '没有找到这份测量' }
  }
  const { rows, index } = found
  const survey = rows[index]
  if (survey.status !== '资料复核') {
    if (survey.status === '已入库') {
      return { ok: false, message: '已入库的测量不能退回，只能新开补测。' }
    }
    return { ok: false, message: '只有「资料复核」中的测量可以退回。' }
  }
  const trimmed = reason.trim()
  if (trimmed === '') {
    return { ok: false, message: '退回时必须写明缺少哪一份资料。' }
  }
  const updated: PipelineSurvey = {
    ...survey,
    status: '现场测量',
    pending: true,
    abnormal: true,
    returnedReason: trimmed,
  }
  pushHistory(updated, '复核退回（缺件）', '资料复核', '现场测量', operator, trimmed)
  rows[index] = updated
  saveRows(rows)
  return { ok: true, message: `${survey.surveyNo} 已退回现场测量补齐资料`, survey: updated }
}

// 资料复核 → 已入库：入库结论落库，已入库记录随后只读；并同步一条阀门井巡检待办。
export function confirmWarehoused(id: number, conclusion: string, operator: string): SurveyResult {
  const found = loadSurvey(id)
  if (!found) {
    return { ok: false, message: '没有找到这份测量' }
  }
  const { rows, index } = found
  const survey = rows[index]
  if (survey.status === '已入库') {
    return { ok: false, message: '该测量已入库，入库结论不能重复提交或改动。' }
  }
  if (survey.status === '已作废') {
    return { ok: false, message: '该测量已作废归档，不能入库。' }
  }
  if (survey.status !== '资料复核') {
    return { ok: false, message: '入库只能从「资料复核」办理，不许跨过复核这一格。' }
  }
  const trimmed = conclusion.trim()
  if (trimmed === '') {
    return { ok: false, message: '入库必须写明入库结论。' }
  }
  const stamp = now()
  const updated: PipelineSurvey = {
    ...survey,
    status: '已入库',
    pending: false,
    abnormal: false,
    returnedReason: '',
    warehouseConclusion: trimmed,
    warehousedAt: stamp,
    warehouseOperator: operator,
  }
  pushHistory(updated, '复核通过并入库', '资料复核', '已入库', operator, trimmed)
  rows[index] = updated
  saveRows(rows)
  syncValveTodo(updated)
  return { ok: true, message: `${survey.surveyNo} 已入库，结论已落库并同步阀门井巡检待办`, survey: updated }
}

// 入库结论同步到阀门井巡检：每次入库（含补测版本入库）生成一条待办，按测量编号去重。
function syncValveTodo(survey: PipelineSurvey): void {
  const todos = listValveTodos()
  const existing = todos.find((todo) => todo.surveyId === survey.id)
  if (existing) {
    existing.conclusion = survey.warehouseConclusion
    existing.warehousedAt = survey.warehousedAt
    existing.done = false
    existing.doneAt = ''
    saveValveTodos([...todos])
    return
  }
  const todo: ValveInspectionTodo = {
    id: nextId(todos),
    surveyId: survey.id,
    surveyNo: survey.surveyNo,
    segmentCode: survey.segmentCode,
    segmentName: survey.segmentName,
    conclusion: survey.warehouseConclusion,
    warehousedAt: survey.warehousedAt,
    done: false,
    doneAt: '',
  }
  saveValveTodos([...todos, todo])
}

// 作废：在办测量整份归档，归档后坐标等资料仍可查；已入库的测量不走作废，只能补测。
export function voidSurvey(id: number, reason: string, operator: string): SurveyResult {
  const found = loadSurvey(id)
  if (!found) {
    return { ok: false, message: '没有找到这份测量' }
  }
  const { rows, index } = found
  const survey = rows[index]
  if (survey.status === '已入库') {
    return { ok: false, message: '已入库的测量不能作废；如现场有变化，请新开补测。' }
  }
  if (survey.status === '已作废') {
    return { ok: false, message: '该测量已作废归档。' }
  }
  const trimmed = reason.trim()
  if (trimmed === '') {
    return { ok: false, message: '作废必须写明原因。' }
  }
  const updated: PipelineSurvey = {
    ...survey,
    status: '已作废',
    pending: false,
    abnormal: true,
    voidReason: trimmed,
    voidedAt: now(),
  }
  pushHistory(updated, '整份作废归档', survey.status, '已作废', operator, trimmed)
  rows[index] = updated
  saveRows(rows)
  return { ok: true, message: `${survey.surveyNo} 已整份作废归档，历史坐标仍可查询`, survey: updated }
}

function saveRows(rows: PipelineSurvey[]): void {
  saveSurveys(rows)
}

export function getSurvey(id: number): PipelineSurvey | null {
  return listSurveys().find((row) => row.id === id) ?? null
}

export function listSurveyEntries(filters: SurveyFilters = { keyword: '', status: '' }): PipelineSurvey[] {
  const keyword = (filters.keyword ?? '').trim()
  const status = (filters.status ?? '').trim()
  return listSurveys()
    .filter((row) => (status === '' ? true : row.status === status))
    .filter((row) => {
      if (keyword === '') {
        return true
      }
      const haystack = [
        row.surveyNo, row.segmentCode, row.segmentName,
        row.startPoint, row.endPoint, row.surveyor,
        String(row.supersedesId ?? ''),
      ].join(' ')
      return haystack.includes(keyword)
    })
    .sort((a, b) => b.id - a.id)
}

export function surveyStats(): SurveyStats {
  const rows = listSurveys()
  return {
    total: rows.length,
    fieldCount: rows.filter((row) => row.status === '现场测量').length,
    reviewCount: rows.filter((row) => row.status === '资料复核').length,
    warehousedCount: rows.filter((row) => row.status === '已入库').length,
    voidCount: rows.filter((row) => row.status === '已作废').length,
    pending: rows.filter((row) => row.pending).length,
    abnormal: rows.filter((row) => row.abnormal).length,
  }
}

// 阀门井页面用：入库结论同步过来的巡检待办。
export function listValveInspectionTodos(includeDone = false): ValveInspectionTodo[] {
  return listValveTodos()
    .filter((todo) => (includeDone ? true : !todo.done))
    .sort((a, b) => (a.done === b.done ? b.id - a.id : a.done ? 1 : -1))
}

export function pendingValveTodoCount(): number {
  return listValveTodos().filter((todo) => !todo.done).length
}

export function completeValveTodo(id: number): ActionResult {
  const todos = listValveTodos()
  const index = todos.findIndex((todo) => todo.id === id)
  if (index < 0) {
    return { ok: false, message: '没有找到这条待办' }
  }
  todos[index] = { ...todos[index], done: true, doneAt: now() }
  saveValveTodos(todos)
  return { ok: true, message: `待办 ${todos[index].surveyNo} 已办结` }
}

// 详情页判断当前状态允许哪些动作：保证页面上也不会出现跨格入口。
export function availableActions(survey: PipelineSurvey): string[] {
  switch (survey.status) {
    case '现场测量':
      return ['送资料复核', '作废归档']
    case '资料复核':
      return ['复核通过并入库', '复核退回']
    case '已入库':
      return ['新开补测']
    case '已作废':
      return []
    default:
      return []
  }
}

export { SURVEY_FLOW }
