<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Member } from '../data/members'
import { defaultConfig, exportJSON } from '../data/store'
import type { LifeConfig, LifeEvent } from '../data/store'

const props = defineProps<{ modelValue: LifeConfig }>()
const emit = defineEmits<{ (e: 'save', v: LifeConfig): void; (e: 'back'): void }>()

/** 编辑副本，点「保存并应用」才写回 */
const draft = ref<LifeConfig>(JSON.parse(JSON.stringify(props.modelValue)))

const KINDS: { v: Member['kind']; label: string }[] = [
  { v: 'root', label: '我' },
  { v: 'family', label: '直系' },
  { v: 'approach', label: '后来亲人' },
  { v: 'cross', label: '相交线' }
]
const FATES: { v: Member['fate']; label: string }[] = [
  { v: 'die', label: '升为星辰' },
  { v: 'fade', label: '散场淡出' },
  { v: 'alive', label: '一直都在' }
]

const tab = ref<'role' | 'event'>('role')
const keyword = ref('')
const hideAnonymous = ref(false)

const rows = computed(() => {
  const kw = keyword.value.trim()
  return draft.value.tracks
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => {
      if (hideAnonymous.value && m.anonymous) return false
      if (!kw) return true
      return (m.name + (m.short || '') + (m.tag || '')).includes(kw)
    })
})

const starCount = computed(() => draft.value.tracks.filter((m) => m.fate === 'die').length)

const roleWrap = ref<HTMLElement | null>(null)

async function addRole() {
  draft.value.tracks.push({
    id: 'r' + Date.now().toString(36),
    name: '新角色',
    kind: 'cross',
    x: 0,
    entryX: 3.5,
    peakX: 1.5,
    exitX: 5,
    peakAge: 30,
    enter: 20,
    exit: 60,
    fate: 'fade',
    color: '#8fc8ff',
    phase: Math.round(Math.random() * 60) / 10
  })
  // 新行落在列表末尾，滚动过去，免得用户以为没加成功
  await nextTick()
  if (roleWrap.value) roleWrap.value.scrollTop = roleWrap.value.scrollHeight
}

function removeRole(i: number) {
  draft.value.tracks.splice(i, 1)
}

function toggleAnonymous(m: Member) {
  m.anonymous = !m.anonymous
}

function addEvent() {
  draft.value.events.push({ age: 30, text: '新的节点', sub: '' })
}
function removeEvent(i: number) {
  draft.value.events.splice(i, 1)
}
const sortedEvents = computed(() =>
  draft.value.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.age - b.e.age)
)

function reset() {
  if (confirm('恢复出厂设置？当前改过的配置会丢失。')) {
    draft.value = defaultConfig()
  }
}

const jsonOpen = ref(false)
const jsonText = ref('')
function openExport() {
  jsonText.value = exportJSON()
  jsonOpen.value = true
}
function applyImport() {
  try {
    const parsed = JSON.parse(jsonText.value) as LifeConfig
    if (!parsed || !Array.isArray(parsed.tracks) || !parsed.tracks.length) {
      alert('缺少 tracks 数组')
      return
    }
    draft.value = parsed
    jsonOpen.value = false
  } catch {
    alert('JSON 解析失败，请检查格式')
  }
}

function copyJSON() {
  navigator.clipboard?.writeText(jsonText.value).catch(() => {})
}

function save() {
  // 数值兜底，避免手输进 NaN
  for (const m of draft.value.tracks) {
    m.x = +m.x || 0
    m.enter = +m.enter || 0
    m.exit = +m.exit || 0
    if (m.peakAge !== undefined) m.peakAge = +m.peakAge || 0
  }
  draft.value.events = draft.value.events
    .filter((e: LifeEvent) => e.text)
    .map((e: LifeEvent) => ({ ...e, age: +e.age || 0 }))
    .sort((a: LifeEvent, b: LifeEvent) => a.age - b.age)
  emit('save', JSON.parse(JSON.stringify(draft.value)))
}
</script>

<template>
  <div class="cfg">
    <header class="cfg-top">
      <button class="btn ghost" @click="emit('back')">← 返回</button>
      <div class="cfg-title">
        <h2>参数配置</h2>
        <p>改完点「保存并应用」，场景会按新数据重新生成</p>
      </div>
      <div class="cfg-actions">
        <button class="btn ghost" @click="reset">恢复出厂</button>
        <button class="btn ghost" @click="openExport">JSON</button>
        <button class="btn primary" @click="save">保存并应用</button>
      </div>
    </header>

    <nav class="tabs">
      <button :class="{ on: tab === 'role' }" @click="tab = 'role'">角色轨迹 ({{ draft.tracks.length }})</button>
      <button :class="{ on: tab === 'event' }" @click="tab = 'event'">人生节点 ({{ draft.events.length }})</button>
    </nav>

    <!-- 全局参数 -->
    <section class="global">
      <label>
        主时间线终点
        <input v-model.number="draft.endAge" type="number" step="0.5" min="10" max="120" />
        <span>岁</span>
      </label>
      <label>
        播放速度
        <input v-model.number="draft.speed" type="number" step="0.05" min="0.2" max="5" />
        <span>岁/秒</span>
      </label>
      <div class="hint">
        当前会升入天穹的角色：<b>{{ starCount }}</b> 位（归宿 = 升为星辰）
      </div>
    </section>

    <!-- 角色表 -->
    <section v-show="tab === 'role'" class="panel">
      <div class="toolbar">
        <input v-model="keyword" class="search" placeholder="搜索名字 / 标签" />
        <label class="chk"><input v-model="hideAnonymous" type="checkbox" /> 隐藏匿名过客</label>
        <button class="btn" @click="addRole">+ 新增角色</button>
      </div>

      <div ref="roleWrap" class="table-wrap">
        <table class="role-table">
          <thead>
            <tr>
              <th class="c-name">名字</th>
              <th>走法</th>
              <th class="num">亲疏 x</th>
              <th class="num">出现</th>
              <th class="num">退场</th>
              <th>归宿</th>
              <th class="num">entryX</th>
              <th class="num">peakX</th>
              <th class="num">exitX</th>
              <th class="num">相交年龄</th>
              <th>颜色</th>
              <th class="c-op">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ m, i } in rows" :key="m.id" :class="{ anon: m.anonymous }">
              <td class="c-name">
                <input v-model="m.name" class="in name" />
                <div class="sub">
                  <span class="code">{{ m.id }}</span>
                  <label class="chk tiny"><input type="checkbox" :checked="!!m.anonymous" @change="toggleAnonymous(m)" />匿名</label>
                </div>
              </td>
              <td>
                <select v-model="m.kind">
                  <option v-for="k in KINDS" :key="k.v" :value="k.v">{{ k.label }}</option>
                </select>
              </td>
              <td class="num"><input v-model.number="m.x" type="number" step="0.05" class="in" /></td>
              <td class="num"><input v-model.number="m.enter" type="number" step="0.5" class="in" /></td>
              <td class="num"><input v-model.number="m.exit" type="number" step="0.5" class="in" /></td>
              <td>
                <select v-model="m.fate">
                  <option v-for="f in FATES" :key="f.v" :value="f.v">{{ f.label }}</option>
                </select>
              </td>
              <td class="num"><input v-model.number="m.entryX" type="number" step="0.1" class="in" /></td>
              <td class="num"><input v-model.number="m.peakX" type="number" step="0.1" class="in" /></td>
              <td class="num"><input v-model.number="m.exitX" type="number" step="0.1" class="in" /></td>
              <td class="num"><input v-model.number="m.peakAge" type="number" step="0.5" class="in" /></td>
              <td><input v-model="m.color" type="color" class="color" /></td>
              <td class="c-op"><button class="btn danger" @click="removeRole(draft.tracks.indexOf(m))">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="tip">
        x 的绝对值 = 与「我」的亲疏（0 表示贴着我）。相交线的 entryX → peakX → exitX 是「从远处来、相交、再远离」；
        横向移动量 ÷ (年龄跨度 × 0.44) 建议不超过 2，否则会画成水平横杠。
      </p>
    </section>

    <!-- 事件表 -->
    <section v-show="tab === 'event'" class="panel">
      <div class="toolbar">
        <button class="btn" @click="addEvent">+ 新增节点</button>
      </div>
      <div class="table-wrap">
        <table class="evt">
          <thead>
            <tr>
              <th class="num">年龄</th>
              <th>标题</th>
              <th>副标题</th>
              <th class="c-op">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ e } in sortedEvents" :key="e.age + '-' + e.text">
              <td class="num"><input v-model.number="e.age" type="number" step="0.5" class="in" /></td>
              <td><input v-model="e.text" class="in" /></td>
              <td><input v-model="e.sub" class="in" /></td>
              <td class="c-op"><button class="btn danger" @click="removeEvent(draft.events.indexOf(e))">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- JSON 面板 -->
    <div v-if="jsonOpen" class="modal" @click.self="jsonOpen = false">
      <div class="modal-box">
        <h3>配置 JSON</h3>
        <p class="tip">可直接编辑后导入，也可复制出去留档。</p>
        <textarea v-model="jsonText" spellcheck="false"></textarea>
        <div class="modal-actions">
          <button class="btn ghost" @click="copyJSON">复制</button>
          <button class="btn ghost" @click="jsonOpen = false">关闭</button>
          <button class="btn primary" @click="applyImport">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cfg {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 0 0 60px;
  background: #070b14;
  color: #dbe6f7;
}
.cfg-top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 24px;
  background: rgba(7, 11, 20, 0.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(120, 160, 220, 0.16);
}
.cfg-title h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: 0.06em; }
.cfg-title p { margin: 3px 0 0; font-size: 11.5px; color: #6d7f9e; }
.cfg-actions { margin-left: auto; display: flex; gap: 8px; }

.btn {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid rgba(130, 170, 230, 0.28);
  background: rgba(30, 44, 70, 0.6);
  color: #cfe0f8;
  font-size: 12.5px;
  cursor: pointer;
  font-family: inherit;
}
.btn:hover { background: rgba(48, 70, 108, 0.75); }
.btn.primary { background: #2f6bd8; border-color: #4a86ee; color: #fff; }
.btn.primary:hover { background: #3d7ce8; }
.btn.ghost { background: transparent; }
.btn.danger { border-color: rgba(230, 110, 110, 0.4); color: #f0a0a0; background: transparent; }
.btn.danger:hover { background: rgba(120, 40, 40, 0.35); }

.tabs { display: flex; gap: 4px; padding: 14px 24px 0; }
.tabs button {
  padding: 7px 15px;
  border: 1px solid transparent;
  border-bottom: none;
  background: transparent;
  color: #7d90ae;
  font-size: 12.5px;
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  font-family: inherit;
}
.tabs button.on { color: #dceaff; background: rgba(40, 62, 96, 0.55); border-color: rgba(120, 160, 220, 0.18); }

.global {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
  margin: 14px 24px 0;
  padding: 12px 16px;
  border: 1px solid rgba(120, 160, 220, 0.14);
  border-radius: 8px;
  background: rgba(18, 28, 46, 0.5);
  font-size: 12.5px;
}
.global label { display: flex; align-items: center; gap: 7px; color: #9fb2cf; }
.global input {
  width: 74px;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid rgba(130, 170, 230, 0.25);
  background: rgba(10, 16, 28, 0.9);
  color: #e6eefc;
  font-family: inherit;
}
.hint { margin-left: auto; color: #7d90ae; }
.hint b { color: #ffd9a0; }

.panel { margin: 16px 24px 0; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.search {
  padding: 6px 11px;
  border-radius: 6px;
  border: 1px solid rgba(130, 170, 230, 0.24);
  background: rgba(10, 16, 28, 0.9);
  color: #e6eefc;
  font-size: 12.5px;
  font-family: inherit;
  min-width: 190px;
}
.chk { display: flex; align-items: center; gap: 5px; color: #8fa2c0; font-size: 12px; cursor: pointer; }
.chk.tiny { font-size: 11px; color: #6d7f9e; }

.table-wrap {
  overflow: auto;
  max-height: calc(100vh - 320px);
  border: 1px solid rgba(120, 160, 220, 0.14);
  border-radius: 8px;
}
table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead th {
  position: sticky;
  top: 0;
  background: #101a2c;
  color: #8ea3c2;
  font-weight: 500;
  text-align: left;
  padding: 8px 9px;
  white-space: nowrap;
  border-bottom: 1px solid rgba(120, 160, 220, 0.18);
}
tbody td { padding: 5px 9px; border-bottom: 1px solid rgba(120, 160, 220, 0.07); }
tbody tr:hover { background: rgba(50, 76, 116, 0.22); }
tbody tr.anon { opacity: 0.55; }
.num { text-align: right; }
.c-name { min-width: 132px; }
.c-op { width: 62px; text-align: center; }

.in {
  width: 100%;
  min-width: 52px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid rgba(130, 170, 230, 0.2);
  background: rgba(8, 13, 24, 0.85);
  color: #e6eefc;
  font-size: 12px;
  font-family: inherit;
}
.num .in { text-align: right; }
.in:focus { outline: none; border-color: #4a86ee; }
.in.name { font-weight: 600; }
select {
  padding: 4px 5px;
  border-radius: 4px;
  border: 1px solid rgba(130, 170, 230, 0.2);
  background: rgba(8, 13, 24, 0.85);
  color: #e6eefc;
  font-size: 12px;
  font-family: inherit;
}
.color {
  width: 34px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(130, 170, 230, 0.25);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.sub { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.code { font-size: 10px; color: #5f7290; font-family: ui-monospace, monospace; }

.tip { margin: 10px 0 0; font-size: 11.5px; line-height: 1.7; color: #6d7f9e; }

.modal {
  position: fixed;
  inset: 0;
  background: rgba(3, 6, 12, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.modal-box {
  width: min(720px, 92vw);
  padding: 20px;
  border-radius: 10px;
  background: #0c1424;
  border: 1px solid rgba(120, 160, 220, 0.2);
}
.modal-box h3 { margin: 0 0 6px; font-size: 15px; }
.modal-box textarea {
  width: 100%;
  height: 320px;
  margin-top: 8px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(130, 170, 230, 0.22);
  background: #060a12;
  color: #b9cbe6;
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
  resize: vertical;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

@media (max-width: 900px) {
  .cfg-top { flex-wrap: wrap; }
  .table-wrap { max-height: none; }
}
</style>
