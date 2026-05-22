<script>
  // 메인화면 — 위젯 보드(추가/설정/삭제) + 부착 메모(드래그, 경계 제한).
  // 위젯 구성은 app/widgets.json 에 저장. 부착 메모는 memo/notes.json 의 pinned.
  import { onMount } from "svelte";
  import { ipc } from "../core/ipc.js";
  import { getTextExt } from "../core/textext.js";
  import { activeTabId } from "../core/tabs.js";
  import ClockWidget from "./widgets/ClockWidget.svelte";
  import DDayWidget from "./widgets/DDayWidget.svelte";
  import CalendarWidget from "./widgets/CalendarWidget.svelte";
  import QuoteWidget from "./widgets/QuoteWidget.svelte";

  const TYPES = {
    clock:    { comp: ClockWidget,    label: "시계",   def: { mode: "digital", hour24: true, font: "mono" } },
    dday:     { comp: DDayWidget,     label: "디데이", def: { label: "목표", date: "2026-12-31" } },
    calendar: { comp: CalendarWidget, label: "달력",   def: { heat: {} } },
    quote:    { comp: QuoteWidget,    label: "인용구", def: { quotes: [{ text: "생각을 장벽 없이.", author: "Cupronickel" }] } },
  };

  let widgets = [];
  let editing = null;       // 설정 중인 위젯 id
  let configMode = false;   // 위젯 편집 모드 토글
  let loaded = false;

  let allNotes = [], pinnedMemos = [], rendered = {};
  let mainEl;

  onMount(async () => {
    widgets = (await ipc_readJson("app/widgets.json")) ?? defaultWidgets();
    loaded = true;
    loadPinned();
  });
  $: { if ($activeTabId) loadPinned(); }

  async function ipc_readJson(path) {
    try { return JSON.parse(await ipc.readText(path)); } catch { return null; }
  }
  function defaultWidgets() {
    return [
      { id: 1, type: "clock", config: { ...TYPES.clock.def } },
      { id: 2, type: "quote", config: { ...TYPES.quote.def } },
    ];
  }
  function saveWidgets() { ipc.writeText("app/widgets.json", JSON.stringify(widgets)).catch(() => {}); }

  let _w = 100;
  function addWidget(type) {
    widgets = [...widgets, { id: _w++, type, config: { ...TYPES[type].def } }];
    saveWidgets();
  }
  function removeWidget(id) { widgets = widgets.filter((w) => w.id !== id); if (editing === id) editing = null; saveWidgets(); }
  function patchConfig(id, patch) {
    widgets = widgets.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w));
    saveWidgets();
  }
  function curWidget() { return widgets.find((w) => w.id === editing); }

  // --- 부착 메모 ---
  async function loadPinned() {
    try { allNotes = JSON.parse(await ipc.readText("memo/notes.json")); await refresh(); }
    catch { allNotes = []; pinnedMemos = []; }
  }
  async function refresh() {
    pinnedMemos = allNotes.filter((n) => n.pinned);
    const ext = getTextExt(); const out = {};
    for (const m of pinnedMemos) out[m.id] = ext ? await ext.render(esc(m.text)) : esc(m.text);
    rendered = out;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
  function persist() { ipc.writeText("memo/notes.json", JSON.stringify(allNotes)).catch(() => {}); }

  let dragId = null, off = { x: 0, y: 0 };
  const MEMO_W = 170, MEMO_H = 110, TOP_OFFSET = 340;
  function onDown(evt, m) {
    dragId = m.id; off = { x: evt.clientX - (m.x ?? 40), y: evt.clientY - (m.y ?? 40) };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  }
  function onMove(evt) {
    if (dragId == null) return;
    const rect = mainEl.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - MEMO_W - 56);
    const maxY = Math.max(0, rect.height - MEMO_H - TOP_OFFSET - 28);
    const x = Math.min(maxX, Math.max(0, evt.clientX - off.x));
    const y = Math.min(maxY, Math.max(0, evt.clientY - off.y));
    allNotes = allNotes.map((n) => (n.id === dragId ? { ...n, x, y } : n));
    pinnedMemos = allNotes.filter((n) => n.pinned);
  }
  function onUp() {
    dragId = null;
    window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
    persist();
  }
</script>

<div class="main" bind:this={mainEl}>
  <div class="topbar">
    <button class="cfg" class:on={configMode} on:click={() => { configMode = !configMode; editing = null; }}>
      {configMode ? "완료" : "위젯 편집"}
    </button>
    {#if configMode}
      <div class="add-menu">
        {#each Object.entries(TYPES) as [type, t]}
          <button on:click={() => addWidget(type)}>+ {t.label}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="board">
    {#each widgets as w (w.id)}
      <div class="card" class:editing={configMode}>
        <svelte:component this={TYPES[w.type].comp} config={w.config} />
        {#if configMode}
          <div class="card-actions">
            <button on:click={() => (editing = editing === w.id ? null : w.id)}>설정</button>
            <button class="del" on:click={() => removeWidget(w.id)}>삭제</button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- 위젯 설정 패널 -->
  {#if editing && curWidget()}
    {@const w = curWidget()}
    <div class="wcfg editable">
      <h3>{TYPES[w.type].label} 설정</h3>
      {#if w.type === "clock"}
        <label>형식
          <select value={w.config.mode} on:change={(e) => patchConfig(w.id, { mode: e.target.value })}>
            <option value="digital">디지털</option><option value="analog">아날로그</option>
          </select>
        </label>
        <label class="chk"><input type="checkbox" checked={w.config.hour24} on:change={(e) => patchConfig(w.id, { hour24: e.target.checked })} />24시간제</label>
        <label>폰트
          <select value={w.config.font} on:change={(e) => patchConfig(w.id, { font: e.target.value })}>
            <option value="mono">고정폭</option><option value="ui">기본</option>
          </select>
        </label>
      {:else if w.type === "dday"}
        <label>이름<input value={w.config.label} on:input={(e) => patchConfig(w.id, { label: e.target.value })} /></label>
        <label>날짜<input type="date" value={w.config.date} on:change={(e) => patchConfig(w.id, { date: e.target.value })} /></label>
      {:else if w.type === "quote"}
        <label>인용구(한 줄에 "문장 | 저자")
          <textarea on:input={(e) => patchConfig(w.id, { quotes: e.target.value.split("\n").map((l) => { const [t, a] = l.split("|"); return { text: (t||"").trim(), author: (a||"").trim() }; }).filter((q) => q.text) })}
            >{w.config.quotes.map((q) => `${q.text} | ${q.author}`).join("\n")}</textarea>
        </label>
      {:else}
        <p class="hint">이 위젯은 설정 항목이 없습니다.</p>
      {/if}
      <button class="close" on:click={() => (editing = null)}>닫기</button>
    </div>
  {/if}

  {#each pinnedMemos as m (m.id)}
    <div class="postit" style="left:{m.x ?? 40}px; top:{(m.y ?? 40) + 340}px" on:pointerdown={(e) => onDown(e, m)}>
      {#if rendered[m.id]}{@html rendered[m.id]}{:else}{m.text}{/if}
    </div>
  {/each}
</div>

<style>
  .main { height: 100%; position: relative; background-color: var(--bg); padding: 20px 28px 28px; overflow: hidden; }
  .topbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; min-height: 30px; }
  .cfg { border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .cfg.on { border-color: var(--accent); color: var(--accent); }
  .add-menu { display: flex; gap: 6px; }
  .add-menu button { border: 1px dashed var(--line); border-radius: 6px; padding: 4px 10px; color: var(--text-dim); font-size: 12px; }
  .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; align-content: start; }
  .card { position: relative; background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--line);
    border-radius: 12px; padding: 20px; display: grid; place-items: center; min-height: 120px; }
  .card.editing { outline: 1px dashed var(--accent-2); }
  .card-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; }
  .card-actions button { font-size: 11px; border: 1px solid var(--line); border-radius: 4px; padding: 2px 6px; background: var(--surface-2); }
  .card-actions .del { color: var(--danger); border-color: var(--danger); }
  .wcfg { position: absolute; top: 60px; right: 24px; width: 240px; background: var(--surface-2);
    border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); z-index: 10; }
  .wcfg h3 { margin: 0; font-size: 13px; color: var(--text-dim); }
  .wcfg label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
  .wcfg label.chk { flex-direction: row; align-items: center; gap: 6px; color: var(--text); }
  .wcfg input:not([type]), .wcfg select, .wcfg textarea { background: var(--surface); color: var(--text);
    border: 1px solid var(--line); border-radius: 6px; padding: 5px 7px; font-family: var(--font-ui); font-size: 13px; }
  .wcfg textarea { min-height: 80px; resize: vertical; }
  .wcfg .close { border: 1px solid var(--line); border-radius: 6px; padding: 5px; }
  .hint { color: var(--text-dim); font-size: 12px; margin: 0; }
  .postit { position: absolute; width: 170px; min-height: 90px; background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
    border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap;
    user-select: none; cursor: grab; box-shadow: 0 4px 12px rgba(0,0,0,0.25); overflow: hidden; }
  .postit:active { cursor: grabbing; }
</style>
