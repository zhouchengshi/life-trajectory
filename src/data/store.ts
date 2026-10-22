/**
 * 运行时配置中心
 *
 * members.ts 里的是「出厂默认值」，这里持有真正生效的那份。
 * 配置页改完 -> setConfig() -> 通知订阅者 -> LifeScene 重建。
 * 数据落在 localStorage，刷新后仍是改过的那份。
 */
import { members, passersBy, events, END_AGE } from './members'
import type { Member } from './members'

export interface LifeEvent {
  age: number
  text: string
  sub?: string
}

export interface LifeConfig {
  /** 全部轨迹：具名成员 + 匿名过客 */
  tracks: Member[]
  /** 人生节点字幕 */
  events: LifeEvent[]
  /** 主时间线终点（岁） */
  endAge: number
  /** 基础推进速度（岁/秒），最终还会随年龄线性加速 */
  speed: number
}

const STORAGE_KEY = 'life-trajectory.config.v1'
const DEFAULT_SPEED = 1.25

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export function defaultConfig(): LifeConfig {
  return {
    tracks: clone([...members, ...passersBy]),
    events: clone(events),
    endAge: END_AGE,
    speed: DEFAULT_SPEED
  }
}

function load(): LifeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LifeConfig>
      if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length) {
        const base = defaultConfig()
        return {
          tracks: parsed.tracks,
          events: Array.isArray(parsed.events) ? parsed.events : base.events,
          endAge: num(parsed.endAge, base.endAge),
          speed: num(parsed.speed, DEFAULT_SPEED)
        }
      }
    }
  } catch {
    /* 存档坏了就用默认值 */
  }
  return defaultConfig()
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback)

let current: LifeConfig = load()
const listeners = new Set<(c: LifeConfig) => void>()

export function getConfig(): LifeConfig {
  return current
}

export function setConfig(next: LifeConfig): void {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* 隐私模式下写不了，忽略即可 */
  }
  listeners.forEach((fn) => fn(current))
}

export function resetConfig(): void {
  setConfig(defaultConfig())
}

/** 清掉本地存档并恢复出厂设置 */
export function clearStored(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  resetConfig()
}

export function subscribe(fn: (c: LifeConfig) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function exportJSON(): string {
  return JSON.stringify(current, null, 2)
}

export function importJSON(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Partial<LifeConfig>
    if (!parsed || !Array.isArray(parsed.tracks) || !parsed.tracks.length) return false
    const base = defaultConfig()
    setConfig({
      tracks: parsed.tracks,
      events: Array.isArray(parsed.events) ? parsed.events : base.events,
      endAge: num(parsed.endAge, base.endAge),
      speed: num(parsed.speed, DEFAULT_SPEED)
    })
    return true
  } catch {
    return false
  }
}
