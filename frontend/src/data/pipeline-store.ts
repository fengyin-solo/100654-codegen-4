import {
  SURVEY_SEED_SURVEYS,
  SURVEY_SEED_TODOS,
} from './pipeline-seed'
import type { PipelineSurvey, ValveInspectionTodo } from './pipeline-types'

// 竣工测量有独立的流转规则，不进通用 entries 存储，单独开两个键：测量台账、阀门井待办。
const SURVEY_KEY = 'waterworks-ops:pipeline-surveys'
const VALVE_TODO_KEY = 'waterworks-ops:valve-todos'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readKey<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(fallback)
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return clone(fallback)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return clone(fallback)
  }
}

let surveyCache: PipelineSurvey[] | null = null
let todoCache: ValveInspectionTodo[] | null = null

export function listSurveys(): PipelineSurvey[] {
  if (surveyCache === null) {
    surveyCache = readKey<PipelineSurvey[]>(SURVEY_KEY, SURVEY_SEED_SURVEYS)
  }
  return surveyCache
}

export function saveSurveys(rows: PipelineSurvey[]): void {
  surveyCache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(SURVEY_KEY, JSON.stringify(rows))
  }
}

export function listValveTodos(): ValveInspectionTodo[] {
  if (todoCache === null) {
    todoCache = readKey<ValveInspectionTodo[]>(VALVE_TODO_KEY, SURVEY_SEED_TODOS)
  }
  return todoCache
}

export function saveValveTodos(rows: ValveInspectionTodo[]): void {
  todoCache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(VALVE_TODO_KEY, JSON.stringify(rows))
  }
}

export function resetPipelineData(): void {
  saveSurveys(clone(SURVEY_SEED_SURVEYS))
  saveValveTodos(clone(SURVEY_SEED_TODOS))
}
