/** 新建供水管网竣工测量与入库台账的领域类型。 */

// 入库主流程：现场测量 → 资料复核 → 已入库，只许逐格往前，不许跨步。
export const SURVEY_FLOW = ['现场测量', '资料复核', '已入库'] as const
// 作废不在主流程里，是整份归档的终态。
export const SURVEY_STATUSES = ['现场测量', '资料复核', '已入库', '已作废'] as const

export type SurveyStatus = (typeof SURVEY_STATUSES)[number]

export type SurveyHistoryEvent = {
  time: string
  action: string
  from: SurveyStatus | '新建'
  to: SurveyStatus
  operator: string
  note?: string
}

export type PipelineSurvey = {
  id: number
  /** 测量编号：一份测量一个号，新建时自动生成。 */
  surveyNo: string
  /** 版次：同管段首次测量为 1，每新开一版补测 +1。 */
  version: number
  /** 补测自哪一条已入库测量；首版为 null。 */
  supersedesId: number | null
  /** 管段编号：同一条管段的业务键，重复报送按它判重。 */
  segmentCode: string
  segmentName: string
  startPoint: string
  endPoint: string
  /** 起点、终点的点位坐标（CGCS2000 平面坐标，单位米）。 */
  startX: string
  startY: string
  endX: string
  endY: string
  material: string
  diameter: string
  surveyor: string
  surveyedAt: string
  status: SurveyStatus
  pending: boolean
  abnormal: boolean
  /** 复核退回时写明的缺件说明；重新送复核后清空。 */
  returnedReason: string
  /** 入库结论：落库后不允许再改动，列表页、详情页、阀门井待办读的都是它。 */
  warehouseConclusion: string
  warehousedAt: string
  warehouseOperator: string
  voidReason: string
  voidedAt: string
  history: SurveyHistoryEvent[]
  createdAt: string
}

/** 入库结论同步到阀门井巡检的待办。 */
export type ValveInspectionTodo = {
  id: number
  surveyId: number
  surveyNo: string
  segmentCode: string
  segmentName: string
  /** 入库时落库的结论快照，阀门井页面直接展示。 */
  conclusion: string
  warehousedAt: string
  done: boolean
  doneAt: string
}

export type SurveyDraft = {
  segmentCode: string
  segmentName: string
  startPoint: string
  endPoint: string
  startX: string
  startY: string
  endX: string
  endY: string
  material: string
  diameter: string
  surveyor: string
  surveyedAt: string
}

export type SurveyFilters = {
  keyword: string
  status: string
}

export type SurveyStats = {
  total: number
  fieldCount: number
  reviewCount: number
  warehousedCount: number
  voidCount: number
  pending: number
  abnormal: number
}
