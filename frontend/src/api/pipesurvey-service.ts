import { filterRows } from '@/api/local-service'
import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, PageResult } from '@/data/types'

// 竣工测量专用流转规则，不走通用 runAction：
// 现场测量 → 资料复核 → 已入库，一步一格不许跨；复核退回必须写明缺哪份资料并回到现场测量；
// 已入库、已作废都是终态，整份锁定只读，补测只能另开新版。
const KEY = 'pipesurvey'
const VALVE_KEY = 'valve'

export const SURVEY_STATUSES = ['现场测量', '资料复核', '已入库', '已作废']

const FLOW: Record<string, string[]> = {
  现场测量: ['资料复核', '已作废'],
  资料复核: ['已入库', '现场测量', '已作废'],
  已入库: [],
  已作废: [],
}

// 在办状态：同一条管段只允许一条在办测量，重复报送只留一条。
const ACTIVE_STATUSES = ['现场测量', '资料复核']

export type SurveyPayload = {
  测量编号: string
  管段编号: string
  管段起点: string
  管段止点: string
  点位坐标: string
  测量人员: string
  测量日期: string
}

const REQUIRED_FIELDS: (keyof SurveyPayload)[] = [
  '测量编号',
  '管段编号',
  '管段起点',
  '管段止点',
  '点位坐标',
  '测量人员',
  '测量日期',
]

function rows(): EntryRow[] {
  return listRows(KEY)
}

function nextId(list: EntryRow[]): number {
  return list.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function now(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function findRow(list: EntryRow[], id: number): EntryRow | undefined {
  return list.find((row) => Number(row.id) === id)
}

function assertTransition(current: string, target: string): string | null {
  const allowed = FLOW[current] ?? []
  if (allowed.includes(target)) {
    return null
  }
  if (current === '已入库' || current === '已作废') {
    return `「${current}」的测量整份锁定，不再改动；需要变更请新开一版补测`
  }
  return `不许从「${current}」直接走到「${target}」，必须按 现场测量→资料复核→已入库 逐格流转`
}

function activeRecordOf(list: EntryRow[], segment: string, exceptId?: number): EntryRow | undefined {
  return list.find(
    (row) =>
      String(row['管段编号']) === segment &&
      ACTIVE_STATUSES.includes(String(row.status)) &&
      Number(row.id) !== exceptId,
  )
}

function validatePayload(list: EntryRow[], payload: SurveyPayload, exceptId?: number): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (!String(payload[field] ?? '').trim()) {
      return `「${field}」不能为空，测量要挂全测量编号、管段起止与点位坐标`
    }
  }
  const dupNo = list.find(
    (row) => String(row['测量编号']) === payload.测量编号.trim() && Number(row.id) !== exceptId,
  )
  if (dupNo) {
    return `测量编号「${payload.测量编号}」已存在，一份测量挂一个编号`
  }
  const active = activeRecordOf(list, payload.管段编号.trim(), exceptId)
  if (active) {
    return `管段「${payload.管段编号}」已有在办测量（${active['测量编号']}，${active.status}），同一条管段重复报送只留一条`
  }
  if (exceptId === undefined || exceptId === null) {
    const archived = list.find(
      (row) => String(row['管段编号']) === payload.管段编号.trim() && String(row.status) === '已入库',
    )
    if (archived) {
      return `管段「${payload.管段编号}」已有入库测量（${archived['测量编号']}），不能重新报送，请在该记录上「新开补测」`
    }
  }
  return null
}

export function listSurveys(filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(rows(), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function getSurvey(id: number): EntryRow | null {
  return findRow(rows(), id) ?? null
}

export function surveyVersions(segment: string): EntryRow[] {
  return rows()
    .filter((row) => String(row['管段编号']) === segment)
    .sort((a, b) => Number(a['版本号']) - Number(b['版本号']))
}

export function nextSurveyNo(): string {
  const list = rows()
  let seq = list.length + 1
  const make = () => `CL-2026-${String(seq).padStart(4, '0')}`
  while (list.some((row) => String(row['测量编号']) === make())) {
    seq += 1
  }
  return make()
}

export function createSurvey(payload: SurveyPayload): ActionResult {
  const list = rows()
  const cleaned = Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, v.trim()]),
  ) as SurveyPayload
  const problem = validatePayload(list, cleaned)
  if (problem) {
    return { ok: false, message: problem }
  }
  const row: EntryRow = {
    id: nextId(list),
    status: '现场测量',
    pending: true,
    abnormal: false,
    ...cleaned,
    版本号: 1,
    退回原因: '',
    退回时间: '',
    入库结论: '',
    入库时间: '',
    作废原因: '',
    作废时间: '',
  }
  saveRows(KEY, [...list, row])
  return { ok: true, message: `测量「${cleaned.测量编号}」已登记，当前状态「现场测量」` }
}

export function updateSurvey(id: number, payload: SurveyPayload): ActionResult {
  const list = rows()
  const index = list.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的竣工测量记录` }
  }
  const current = String(list[index].status)
  if (current !== '现场测量') {
    return { ok: false, message: `只有「现场测量」状态能改动，「${current}」的测量已锁定` }
  }
  const cleaned = Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, v.trim()]),
  ) as SurveyPayload
  const problem = validatePayload(list, cleaned, id)
  if (problem) {
    return { ok: false, message: problem }
  }
  const next = [...list]
  next[index] = { ...list[index], ...cleaned }
  saveRows(KEY, next)
  return { ok: true, message: `测量「${cleaned.测量编号}」已更新，仍在「现场测量」` }
}

export function submitReview(id: number): ActionResult {
  const list = rows()
  const row = findRow(list, id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的竣工测量记录` }
  }
  const problem = assertTransition(String(row.status), '资料复核')
  if (problem) {
    return { ok: false, message: problem }
  }
  const next = list.map((item) =>
    Number(item.id) === id ? { ...item, status: '资料复核', pending: true } : item,
  )
  saveRows(KEY, next)
  return { ok: true, message: `测量「${row['测量编号']}」已提交资料复核` }
}

export function returnToField(id: number, missing: string): ActionResult {
  const list = rows()
  const row = findRow(list, id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的竣工测量记录` }
  }
  const problem = assertTransition(String(row.status), '现场测量')
  if (problem) {
    return { ok: false, message: problem }
  }
  const reason = missing.trim()
  if (!reason) {
    return { ok: false, message: '复核退回必须写明缺哪一份资料' }
  }
  const next = list.map((item) =>
    Number(item.id) === id
      ? { ...item, status: '现场测量', pending: true, 退回原因: reason, 退回时间: now() }
      : item,
  )
  saveRows(KEY, next)
  return { ok: true, message: `测量「${row['测量编号']}」已退回现场测量，所缺资料：${reason}` }
}

export function approveArchive(id: number, conclusion: string): ActionResult {
  const list = rows()
  const row = findRow(list, id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的竣工测量记录` }
  }
  const problem = assertTransition(String(row.status), '已入库')
  if (problem) {
    return { ok: false, message: problem }
  }
  const text = conclusion.trim()
  if (!text) {
    return { ok: false, message: '入库结论不能为空，结论要随记录落库' }
  }
  const next = list.map((item) =>
    Number(item.id) === id
      ? { ...item, status: '已入库', pending: false, 入库结论: text, 入库时间: now() }
      : item,
  )
  saveRows(KEY, next)
  const todo = syncValveTodo(next.find((item) => Number(item.id) === id) as EntryRow)
  const tail = todo ? `，已同步阀门井巡检待办（${todo['阀门井编号']}）` : '，阀门井巡检待办已存在，未重复同步'
  return { ok: true, message: `测量「${row['测量编号']}」复核通过已入库，结论已落库${tail}` }
}

export function voidSurvey(id: number, reason: string): ActionResult {
  const list = rows()
  const row = findRow(list, id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的竣工测量记录` }
  }
  const problem = assertTransition(String(row.status), '已作废')
  if (problem) {
    return { ok: false, message: problem }
  }
  const text = reason.trim()
  if (!text) {
    return { ok: false, message: '作废必须写明原因，整份归档备查' }
  }
  // 整份归档：坐标等字段原样保留，只改状态与作废信息，页面上仍能查到当时的坐标。
  const next = list.map((item) =>
    Number(item.id) === id
      ? { ...item, status: '已作废', pending: false, abnormal: true, 作废原因: text, 作废时间: now() }
      : item,
  )
  saveRows(KEY, next)
  return { ok: true, message: `测量「${row['测量编号']}」已作废，整份归档、坐标可查` }
}

export function createResurvey(id: number): ActionResult {
  const list = rows()
  const row = findRow(list, id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的竣工测量记录` }
  }
  if (String(row.status) !== '已入库') {
    return { ok: false, message: '只有「已入库」的测量才能新开一版补测' }
  }
  const segment = String(row['管段编号'])
  const active = activeRecordOf(list, segment)
  if (active) {
    return { ok: false, message: `管段「${segment}」已有在办测量（${active['测量编号']}），重复报送只留一条` }
  }
  const version =
    Math.max(0, ...list.filter((item) => String(item['管段编号']) === segment).map((item) => Number(item['版本号']) || 0)) + 1
  const fresh: EntryRow = {
    id: nextId(list),
    status: '现场测量',
    pending: true,
    abnormal: false,
    测量编号: nextSurveyNo(),
    管段编号: segment,
    管段起点: row['管段起点'],
    管段止点: row['管段止点'],
    点位坐标: row['点位坐标'],
    测量人员: row['测量人员'],
    测量日期: now().slice(0, 10),
    版本号: version,
    退回原因: '',
    退回时间: '',
    入库结论: '',
    入库时间: '',
    作废原因: '',
    作废时间: '',
  }
  saveRows(KEY, [...list, fresh])
  return { ok: true, message: `已新开第 ${version} 版补测「${fresh['测量编号']}」，原已入库版本保持锁定` }
}

// 入库结论同步阀门井巡检待办：同一测量编号只同步一次。
function syncValveTodo(survey: EntryRow): EntryRow | null {
  const valveRows = listRows(VALVE_KEY)
  const source = String(survey['测量编号'])
  if (valveRows.some((row) => String(row['来源测量编号'] ?? '') === source)) {
    return null
  }
  const id = nextId(valveRows)
  const todo: EntryRow = {
    id,
    status: '待巡检',
    pending: true,
    abnormal: false,
    阀门井编号: `VALV-${String(id).padStart(4, '0')}`,
    所在道路: `${survey['管段起点']}—${survey['管段止点']}`,
    阀门口径: '待核查',
    阀门类型: `竣工同步·${source}`,
    开启状态: '待核查',
    责任班组: '管网运维班',
    巡检日期: now().slice(0, 10),
    阀门状态: '入库同步·待巡检',
    来源测量编号: source,
  }
  saveRows(VALVE_KEY, [...valveRows, todo])
  return todo
}
