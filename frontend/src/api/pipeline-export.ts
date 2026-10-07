import { listSurveys } from '@/data/pipeline-store'

// 台账导出：已入库结论、作废原因、当时点位坐标全部带上；作废归档的测量也在清单里。
export function exportPipelineCsv(): { filename: string; content: string } {
  const header = [
    '测量编号', '版次', '补测自测量编号', '管段编号', '管段名称',
    '起点位置', '起点X', '起点Y', '止点位置', '止点X', '止点Y',
    '管材', '管径', '测量人员', '测量日期',
    '当前状态', '退回缺件说明', '入库结论', '入库时间', '入库经办人',
    '作废原因', '作废时间',
  ]
  const surveys = [...listSurveys()].sort((a, b) => a.id - b.id)
  const lines = [header.join(',')]
  const cell = (value: string | number) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  for (const row of surveys) {
    const sourceNo = row.supersedesId
      ? (surveys.find((item) => item.id === row.supersedesId)?.surveyNo ?? `#${row.supersedesId}`)
      : ''
    lines.push([
      row.surveyNo,
      `第${row.version}版`,
      sourceNo,
      row.segmentCode,
      row.segmentName,
      row.startPoint,
      row.startX,
      row.startY,
      row.endPoint,
      row.endX,
      row.endY,
      row.material,
      row.diameter,
      row.surveyor,
      row.surveyedAt,
      row.status,
      row.returnedReason,
      row.warehouseConclusion,
      row.warehousedAt,
      row.warehouseOperator,
      row.voidReason,
      row.voidedAt,
    ].map(cell).join(','))
  }
  return { filename: '新建供水管网竣工测量与入库台账.csv', content: `﻿${lines.join('\n')}` }
}

export function downloadPipelineCsv(): void {
  const { filename, content } = exportPipelineCsv()
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
