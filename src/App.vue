<script setup lang="ts">
import { onBeforeUnmount, onMounted, nextTick, reactive, ref, computed } from 'vue'
import { LifeScene } from './three/LifeScene'
import type { LifeEvent } from './three/LifeScene'
import { getConfig, setConfig, subscribe } from './data/store'
import type { LifeConfig } from './data/store'
import ConfigPage from './views/ConfigPage.vue'

const host = ref<HTMLDivElement | null>(null)
let scene: LifeScene | null = null

/* ---------------- 视图路由（hash，无需引入 router） ---------------- */
const view = ref<'home' | 'config'>(location.hash === '#/config' ? 'config' : 'home')
const config = ref<LifeConfig>(getConfig())
const endAge = computed(() => config.value.endAge)

function onHashChange() {
  const next = location.hash === '#/config' ? 'config' : 'home'
  if (next === view.value) return
  view.value = next
  if (next === 'home') {
    // 画布刚从 display:none 回来，尺寸要重新量一遍
    nextTick(() => {
      scene?.resize()
      scene?.setPlaying(true)
    })
    ending.value = false
    state.ended = false
  }
}

function openConfig() {
  location.hash = '#/config'
}

function backHome() {
  if (location.hash === '#/config') location.hash = ''
  else onHashChange()
}

function saveConfig(c: LifeConfig) {
  setConfig(c) // store 会通知下面那个订阅者重建场景
  backHome()
}

const state = reactive({
  age: 0,
  playing: true,
  ended: false,
  departed: 0,
  total: 0
})

const speed = ref(1)
const ending = ref(false)
const toast = ref<LifeEvent | null>(null)
const toastKey = ref(0)
let lastIntAge = -1
let toastTimer = 0
let endingTimer = 0

const ageText = computed(() => String(Math.floor(state.age)).padStart(2, '0'))
const progress = computed(() => Math.min(1, state.age / endAge.value))

// [年龄上界(不含), 古称] —— 例如 20 岁起称「弱冠」
const PHASES: [number, string][] = [
  [3, '襁褓'],
  [8, '孩提'],
  [15, '总角'],
  [20, '舞象'],
  [30, '弱冠'],
  [40, '而立'],
  [50, '不惑'],
  [60, '知天命'],
  [70, '花甲'],
  [80, '古稀'],
  [100, '耄耋'],
  [200, '期颐']
]

const phaseLabel = computed(() => {
  for (const [limit, name] of PHASES) {
    if (state.age < limit) return name
  }
  return '期颐'
})

// 在册 = 已经出现、尚未离世（匿名过客不计入人数）
const livingCount = computed(
  () =>
    config.value.tracks.filter(
      (m) => !m.anonymous && state.age >= m.enter && state.age < m.exit
    ).length
)

function showToast(e: LifeEvent) {
  toast.value = e
  toastKey.value++
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 3200)
}

function onUpdate(s: { age: number; playing: boolean; ended: boolean; departed: number; total: number }) {
  const intAge = Math.floor(s.age)
  if (intAge !== lastIntAge) {
    lastIntAge = intAge
    state.age = s.age
  } else {
    state.age = s.age
  }
  if (s.playing !== state.playing) state.playing = s.playing
  if (s.departed !== state.departed) state.departed = s.departed
  if (s.total !== state.total) state.total = s.total
  if (s.ended && !state.ended) {
    state.ended = true
    toast.value = null
    window.clearTimeout(toastTimer)
    window.clearTimeout(endingTimer)
    endingTimer = window.setTimeout(() => {
      ending.value = true
    }, 1400)
  }
}

function togglePlay() {
  if (!scene) return
  if (state.ended) {
    replay()
    return
  }
  scene.setPlaying(!state.playing)
}

function setSpeed(v: number) {
  speed.value = v
  scene?.setSpeed(v)
}

function replay() {
  if (!scene) return
  ending.value = false
  state.ended = false
  lastIntAge = -1
  toast.value = null
  scene.replay()
}

function seekTo(ratio: number) {
  if (!scene) return
  ending.value = false
  state.ended = false
  lastIntAge = -1
  scene.seek(ratio * endAge.value)
}

function onBarClick(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  seekTo(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
}

function onResize() {
  scene?.resize()
}

/* ---------------- 全屏 ---------------- */
const isFull = ref(false)

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {})
  }
}

function onFsChange() {
  isFull.value = !!document.fullscreenElement
}

let unsubscribe: (() => void) | null = null

onMounted(() => {
  window.addEventListener('hashchange', onHashChange)
  document.addEventListener('fullscreenchange', onFsChange)
  if (!host.value) return
  scene = new LifeScene(host.value, config.value)
  scene.onUpdate = onUpdate
  scene.onEvent = (e) => showToast(e)
  // 便于调试 / 外部控制
  ;(window as unknown as Record<string, unknown>).__lifeScene = scene
  window.addEventListener('resize', onResize)

  // 配置页保存 -> store 通知 -> 场景按新数据重建
  unsubscribe = subscribe((c) => {
    config.value = c
    scene?.rebuild(c)
    lastIntAge = -1
    ending.value = false
    state.ended = false
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
  document.removeEventListener('fullscreenchange', onFsChange)
  unsubscribe?.()
  window.removeEventListener('resize', onResize)
  window.clearTimeout(toastTimer)
  window.clearTimeout(endingTimer)
  scene?.dispose()
  scene = null
})
</script>

<template>
  <div class="stage">
    <div v-show="view === 'home'" class="home-view">
      <div ref="host" class="canvas-host"></div>
      <div class="vignette"></div>

    <!-- 顶部 -->
    <header class="hud-top">
      <div class="brand">
        <span class="brand-dot"></span>
        <div class="brand-text">
          <h1>生命轨迹</h1>
          <p>LIFE TRAJECTORY</p>
        </div>
      </div>

      <div class="age-panel">
        <div class="age-main">
          <span class="age-num">{{ ageText }}</span>
          <span class="age-unit">岁</span>
        </div>
        <div class="age-meta">
          <span class="phase">{{ phaseLabel }}</span>
        </div>
      </div>

      <div class="hud-right">
        <span>在册 <b>{{ livingCount }}</b> 人</span>
        <button class="cfg-btn" title="参数配置" @click="openConfig">
          <svg viewBox="0 0 24 24" width="13" height="13">
            <path
              d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path
              d="M19.4 12c0-.5-.06-1-.17-1.47l1.72-1.34-1.7-2.94-2.05.82c-.74-.63-1.6-1.1-2.54-1.36L14.3 3.5h-3.4l-.36 2.21c-.94.26-1.8.73-2.54 1.36l-2.05-.82-1.7 2.94 1.72 1.34a7.9 7.9 0 0 0 0 2.94L4.25 14.8l1.7 2.94 2.05-.82c.74.63 1.6 1.1 2.54 1.36l.36 2.22h3.4l.36-2.22c.94-.26 1.8-.73 2.54-1.36l2.05.82 1.7-2.94-1.72-1.34c.11-.47.17-.97.17-1.46z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          <span>参数配置</span>
        </button>
      </div>
    </header>

    <!-- 事件字幕 -->
    <transition name="toast">
      <div v-if="toast" :key="toastKey" class="event-toast">
        <div class="event-age">{{ toast.age }} 岁</div>
        <div class="event-title">{{ toast.text }}</div>
        <div v-if="toast.sub" class="event-sub">{{ toast.sub }}</div>
      </div>
    </transition>

    <!-- 底部控制条 -->
    <footer class="hud-bottom">
      <div class="panel">
        <button class="play" :class="{ paused: !state.playing }" @click="togglePlay" :title="state.playing ? '暂停' : '播放'">
          <svg v-if="state.playing" viewBox="0 0 24 24" width="15" height="15">
            <rect x="6" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" />
            <rect x="14" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="15" height="15">
            <path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11-7.2c.6-.4.6-1.4 0-1.8l-11-7.2c-.7-.4-1.6.1-1.6.9z" fill="currentColor" />
          </svg>
        </button>

        <div class="bar" @click="onBarClick">
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: progress * 100 + '%' }"></div>
            <div class="bar-head" :style="{ left: progress * 100 + '%' }"></div>
          </div>
          <div class="bar-marks">
            <span v-for="a in [0, 20, 40, 60, 80]" :key="a" :style="{ left: (a / endAge) * 100 + '%' }">
              <i></i>{{ a }}
            </span>
          </div>
        </div>

        <div class="speeds">
          <button v-for="s in [1, 2, 4]" :key="s" :class="{ on: speed === s }" @click="setSpeed(s)">
            {{ s }}×
          </button>
        </div>

        <button class="replay-btn" @click="replay" title="重新开始">
          <svg viewBox="0 0 24 24" width="15" height="15">
            <path
              d="M12 5V2.8c0-.5-.6-.8-1-.5L7.2 5.4c-.3.2-.3.7 0 .9L11 9.5c.4.3 1 0 1-.5V7a5 5 0 1 1-5 5H4.8A7.2 7.2 0 1 0 12 5z"
              fill="currentColor"
            />
          </svg>
        </button>

        <button class="replay-btn fs-btn" @click="toggleFullscreen" :title="isFull ? '退出全屏' : '全屏'">
          <svg v-if="!isFull" viewBox="0 0 24 24" width="15" height="15">
            <path
              d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="15" height="15">
            <path
              d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="legend">
        <span class="legend-line"></span>
        <span class="legend-text">轨迹间距 = 亲疏远近 · 逝者升入天穹</span>
        <span class="legend-line"></span>
      </div>
    </footer>

    <div class="rotate-tip">竖屏已适配 · 横屏观感更舒展</div>

    <!-- 结尾 -->
    <transition name="ending">
      <div v-if="ending" class="ending">
        <div class="ending-glow"></div>
        <p class="ending-title">这就是人的一生吧</p>
        <button class="ending-btn" @click="replay">再看一次</button>
      </div>
    </transition>
    </div>

    <ConfigPage
      v-if="view === 'config'"
      :model-value="config"
      @save="saveConfig"
      @back="backHome"
    />
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #05070f;
}

/* 主视图整层：改用 v-show 是为了保住 canvas 上下文，切回时只需重新量尺寸 */
.home-view {
  position: absolute;
  inset: 0;
}

.canvas-host {
  position: absolute;
  inset: 0;
}

.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 45%, transparent 42%, rgba(2, 4, 12, 0.55) 100%),
    linear-gradient(180deg, rgba(3, 6, 16, 0.5) 0%, transparent 22%, transparent 76%, rgba(3, 6, 16, 0.62) 100%);
}

/* ---------- 顶部 ---------- */
.hud-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 26px 34px;
  pointer-events: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 14px 3px rgba(255, 210, 150, 0.55);
  animation: pulse 3.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.15); }
}

.brand-text h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.36em;
  color: #dfeaff;
}

.brand-text p {
  margin: 5px 0 0;
  font-size: 9px;
  letter-spacing: 0.34em;
  color: var(--ink-faint);
}

/* 当前年龄：固定在页面顶部正中 */
.age-panel {
  position: absolute;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.hud-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
}

.hud-right b {
  font-weight: 500;
  color: var(--ink-dim);
}

/* 顶部 HUD 整体 pointer-events: none，按钮要单独放开 */
.cfg-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 6px;
  border: 1px solid rgba(130, 170, 230, 0.26);
  background: rgba(24, 36, 58, 0.55);
  color: var(--ink-dim);
  font-size: 11px;
  letter-spacing: 0.08em;
  font-family: inherit;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.18s, border-color 0.18s, color 0.18s;
}
.cfg-btn:hover {
  background: rgba(46, 72, 112, 0.75);
  border-color: rgba(150, 190, 250, 0.5);
  color: #e8f1ff;
}

.age-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.age-num {
  font-size: 34px;
  line-height: 1;
  font-weight: 200;
  letter-spacing: 0.02em;
  color: #f2f7ff;
  text-shadow: 0 0 24px rgba(150, 190, 255, 0.5);
  font-variant-numeric: tabular-nums;
}

.age-unit {
  font-size: 12px;
  color: var(--ink-dim);
  letter-spacing: 0.1em;
}

.age-meta {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 10.5px;
  color: var(--ink-faint);
  letter-spacing: 0.16em;
}

.age-meta .phase {
  color: var(--gold);
  opacity: 0.9;
}

.age-meta .divider {
  width: 14px;
  height: 1px;
  background: var(--line);
}

/* ---------- 事件字幕 ---------- */
.event-toast {
  position: absolute;
  left: 0;
  right: 0;
  top: 13.5%; /* 让开顶部居中的年龄面板 */
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  white-space: nowrap;
  padding: 26px 0 22px;
}

.event-age {
  font-size: 9.5px;
  letter-spacing: 0.44em;
  color: rgba(255, 217, 160, 0.8);
  margin-bottom: 8px;
}

.event-title {
  font-size: 24px;
  font-weight: 300;
  letter-spacing: 0.18em;
  color: #ffffff;
  text-shadow: 0 0 26px rgba(3, 6, 16, 1), 0 0 52px rgba(3, 6, 16, 0.95), 0 0 80px rgba(120, 165, 255, 0.4);
}

.event-sub {
  margin-top: 9px;
  font-size: 12px;
  letter-spacing: 0.22em;
  color: rgba(196, 214, 246, 0.75);
  text-shadow: 0 0 14px rgba(4, 8, 20, 0.9);
}

.toast-enter-active {
  transition: opacity 0.85s ease, transform 0.85s cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-leave-active {
  transition: opacity 1.1s ease, transform 1.1s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(16px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* ---------- 底部 ---------- */
/* 控件缩放基准：以 900px 高的画幅为 1，宽屏/窄屏各自收敛，全屏 4K 时约放大一倍 */
.hud-bottom {
  --u: clamp(0.62px, calc(min(100vh, 125vw) / 900), 2.2px);
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 calc(34 * var(--u)) calc(20 * var(--u));
  display: flex;
  flex-direction: column;
  gap: calc(11 * var(--u));
  align-items: center;
}

.legend {
  display: flex;
  align-items: center;
  gap: calc(10 * var(--u));
  font-size: calc(10 * var(--u));
  letter-spacing: 0.2em;
  color: rgba(140, 165, 210, 0.62);
}

.legend-line {
  width: calc(34 * var(--u));
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(150, 190, 255, 0.75), transparent);
}

.panel {
  display: flex;
  align-items: center;
  gap: calc(18 * var(--u));
  width: min(calc(760 * var(--u)), 100%);
  padding: calc(11 * var(--u)) calc(16 * var(--u));
  border-radius: calc(14 * var(--u));
  background: var(--glass);
  border: 1px solid var(--line);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 50px -20px rgba(0, 0, 0, 0.9);
}

/* svg 的宽高属性用 CSS 覆盖，才能跟着缩放 */
.panel svg {
  width: calc(15 * var(--u));
  height: calc(15 * var(--u));
}

.play {
  width: calc(32 * var(--u));
  height: calc(32 * var(--u));
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #0b1220;
  background: linear-gradient(160deg, #ffffff, #b9d4ff);
  box-shadow: 0 0 18px rgba(160, 200, 255, 0.45);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.play:hover {
  transform: scale(1.07);
  box-shadow: 0 0 24px rgba(180, 215, 255, 0.7);
}
.play.paused {
  background: linear-gradient(160deg, #ffe9c4, #ffc978);
  box-shadow: 0 0 18px rgba(255, 200, 120, 0.5);
}

.bar {
  flex: 1;
  cursor: pointer;
  padding: calc(6 * var(--u)) 0;
}

.bar-track {
  position: relative;
  height: max(1.5px, calc(2 * var(--u)));
  border-radius: 2px;
  background: rgba(150, 180, 240, 0.16);
}

.bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255, 217, 160, 0.5), #a8ccff);
  box-shadow: 0 0 12px rgba(150, 195, 255, 0.7);
}

.bar-head {
  position: absolute;
  top: 50%;
  width: calc(7 * var(--u));
  height: calc(7 * var(--u));
  margin: calc(-3.5 * var(--u)) 0 0 calc(-3.5 * var(--u));
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 12px 2px rgba(180, 215, 255, 0.85);
}

.bar-marks {
  position: relative;
  height: calc(14 * var(--u));
  margin-top: calc(4 * var(--u));
}

.bar-marks span {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: calc(8.5 * var(--u));
  letter-spacing: 0.06em;
  color: rgba(120, 145, 190, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-variant-numeric: tabular-nums;
}

.bar-marks i {
  display: block;
  width: 1px;
  height: calc(3 * var(--u));
  background: rgba(150, 180, 240, 0.3);
}

.speeds {
  display: flex;
  gap: calc(2 * var(--u));
  padding: calc(2 * var(--u));
  border-radius: calc(8 * var(--u));
  background: rgba(140, 175, 240, 0.08);
}

.speeds button {
  padding: calc(4 * var(--u)) calc(8 * var(--u));
  font-size: calc(10 * var(--u));
  letter-spacing: 0.05em;
  border-radius: calc(6 * var(--u));
  color: rgba(160, 185, 225, 0.7);
  transition: all 0.18s ease;
  white-space: nowrap;
}

.speeds button.on {
  color: #0b1220;
  background: #cfe0ff;
  font-weight: 600;
}

.replay-btn,
.fs-btn {
  width: calc(26 * var(--u));
  height: calc(26 * var(--u));
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: rgba(160, 190, 235, 0.75);
  transition: all 0.22s ease;
}
.replay-btn:hover {
  color: #fff;
  background: rgba(150, 190, 255, 0.12);
  transform: rotate(-40deg);
}

.fs-btn:hover {
  color: #fff;
  background: rgba(150, 190, 255, 0.12);
}
.fs-btn:active {
  transform: scale(0.92);
}

/* ---------- 结尾 ---------- */
.ending {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: radial-gradient(62% 58% at 50% 42%, rgba(6, 10, 26, 0.26), rgba(2, 3, 9, 0.82));
  backdrop-filter: blur(2px);
  z-index: 20;
}

.ending-glow {
  position: absolute;
  width: 620px;
  height: 620px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(90, 140, 255, 0.14), transparent 62%);
  pointer-events: none;
}

.ending-title {
  font-family: 'KaiTi', 'STKaiti', 'Kaiti SC', 'Songti SC', serif;
  font-size: 44px;
  font-weight: 400;
  letter-spacing: 0.1em;
  margin: 0;
  color: #f4f8ff;
  text-shadow: 0 0 30px rgba(140, 180, 255, 0.65), 0 0 80px rgba(80, 130, 255, 0.4);
  animation: riseIn 1.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.ending-sub {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 2.1;
  text-align: center;
  letter-spacing: 0.18em;
  color: rgba(175, 200, 240, 0.6);
  animation: riseIn 1.6s 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.ending-btn {
  margin-top: 34px;
  padding: 10px 26px;
  font-size: 11.5px;
  letter-spacing: 0.3em;
  border-radius: 100px;
  color: #dce9ff;
  border: 1px solid rgba(160, 195, 255, 0.32);
  background: rgba(120, 160, 240, 0.1);
  transition: all 0.26s ease;
  animation: riseIn 1.6s 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.ending-btn:hover {
  background: rgba(150, 190, 255, 0.2);
  border-color: rgba(190, 215, 255, 0.6);
  box-shadow: 0 0 30px rgba(130, 175, 255, 0.35);
}

@keyframes riseIn {
  from { opacity: 0; transform: translateY(18px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

.ending-enter-active {
  transition: opacity 1.6s ease;
}
.ending-leave-active {
  transition: opacity 0.5s ease;
}
.ending-enter-from,
.ending-leave-to {
  opacity: 0;
}

.rotate-tip {
  display: none;
}

/* ---------- 竖屏：整套 UI 放大，场景视野在 LifeScene.resize 里同步收缩 ---------- */
@media (max-aspect-ratio: 4/5) {
  .rotate-tip {
    display: block;
    position: absolute;
    left: 50%;
    bottom: 96px;
    transform: translateX(-50%);
    font-size: 12px;
    letter-spacing: 0.16em;
    color: rgba(255, 217, 160, 0.7);
    white-space: nowrap;
    padding: 9px 18px;
    border-radius: 100px;
    border: 1px solid rgba(255, 217, 160, 0.18);
    background: rgba(8, 14, 32, 0.6);
    pointer-events: none;
  }

  .hud-top {
    padding: 14px 16px;
  }

  .brand-text h1 {
    font-size: 20px;
  }
  .brand-text p {
    font-size: 11px;
  }
  .brand-dot {
    width: 9px;
    height: 9px;
  }

  .age-panel {
    top: 16px;
    gap: 7px;
  }
  .age-num {
    font-size: 46px;
  }
  .age-unit {
    font-size: 15px;
  }
  .age-meta {
    font-size: 13.5px;
  }

  .hud-right {
    font-size: 13px;
    gap: 8px;
  }
  .cfg-btn {
    font-size: 13px;
    padding: 8px 14px;
    gap: 8px;
  }
  .cfg-btn svg {
    width: 16px;
    height: 16px;
  }

  /* 控件单位下限从 0.62px 抬到 0.95px，播放键约 30px */
  .hud-bottom {
    --u: clamp(0.95px, calc(min(100vh, 130vw) / 900), 2.2px);
  }

  .event-toast {
    top: 15%;
  }
  .event-age {
    font-size: 12.5px;
  }
  .event-title {
    font-size: 30px;
  }
  .event-sub {
    font-size: 15px;
  }
}

@media (max-width: 720px) {
  .hud-top { padding: 18px 18px; }
  /* 年龄数字竖屏时由上面的 max-aspect-ratio 块负责放大，这里不再覆盖 */
  /* 窄屏下 --u 已按视口自动缩小，只需放宽边距让控件占满 */
  .hud-bottom { padding: 0 calc(14 * var(--u)) calc(14 * var(--u)); }
  .panel { gap: calc(12 * var(--u)); padding: calc(9 * var(--u)) calc(12 * var(--u)); }
  .event-title { font-size: 19px; }
  .ending-title { font-size: 30px; }
  .legend { display: none; }
  .bar-marks { display: none; }
}
</style>
