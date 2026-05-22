<script>
  // 메인화면 — 위젯 보드 + 메인에 부착된 메모(드래그 이동 가능).
  // 부착 메모는 memo/notes.json 의 pinned 항목을 읽어 절대 좌표로 띄운다.
  // 메모를 끌어 옮기면 좌표(x,y)를 같은 파일에 다시 저장한다.
  import { onMount } from "svelte";
  import { ipc } from "../core/ipc.js";
  import ClockWidget from "./widgets/ClockWidget.svelte";
  import DDayWidget from "./widgets/DDayWidget.svelte";
  import CalendarWidget from "./widgets/CalendarWidget.svelte";
  import QuoteWidget from "./widgets/QuoteWidget.svelte";

  const widgets = [
    { id: 1, type: "clock",    config: { mode: "digital", hour24: true, font: "mono" } },
    { id: 2, type: "dday",     config: { label: "프로젝트 마감", date: "2026-12-31" } },
    { id: 3, type: "calendar", config: { heat: {} } },
    { id: 4, type: "quote",    config: { quotes: [{ text: "생각을 장벽 없이 표현하고 정리한다.", author: "설계철학" }] } },
  ];
  const map = { clock: ClockWidget, dday: DDayWidget, calendar: CalendarWidget, quote: QuoteWidget };

  let background = null;
  let allNotes = [];        // 전체 메모(저장 시 그대로 보존)
  let pinnedMemos = [];

  onMount(loadPinned);
  async function loadPinned() {
    try {
      const raw = await ipc.readText("memo/notes.json");
      allNotes = JSON.parse(raw);
      refresh();
    } catch { allNotes = []; pinnedMemos = []; }
  }
  function refresh() { pinnedMemos = allNotes.filter((n) => n.pinned); }
  function persist() { ipc.writeText("memo/notes.json", JSON.stringify(allNotes)).catch(() => {}); }

  // --- 드래그 ---
  let dragId = null, off = { x: 0, y: 0 };
  function onDown(evt, m) {
    dragId = m.id;
    off = { x: evt.clientX - (m.x ?? 40), y: evt.clientY - (m.y ?? 40) };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(evt) {
    if (dragId == null) return;
    const x = Math.max(0, evt.clientX - off.x);
    const y = Math.max(0, evt.clientY - off.y);
    allNotes = allNotes.map((n) => (n.id === dragId ? { ...n, x, y } : n));
    refresh();
  }
  function onUp() {
    dragId = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    persist();
  }
</script>

<div class="main" style={background ? `background-image:url(${background})` : ""}>
  <div class="board">
    {#each widgets as w (w.id)}
      <div class="card"><svelte:component this={map[w.type]} config={w.config} /></div>
    {/each}
  </div>

  <!-- 부착 메모: 절대 위치, 드래그로 이동 -->
  {#each pinnedMemos as m (m.id)}
    <div class="postit" style="left:{m.x ?? 40}px; top:{(m.y ?? 40) + 320}px"
         on:pointerdown={(e) => onDown(e, m)}>
      {m.text}
    </div>
  {/each}
</div>

<style>
  .main { height: 100%; position: relative; background-color: var(--bg); background-size: cover; background-position: center; padding: 28px; overflow: auto; }
  .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; align-content: start; }
  .card { background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--line);
    border-radius: 12px; padding: 20px; display: grid; place-items: center; min-height: 120px; backdrop-filter: blur(2px); }
  .postit {
    position: absolute; width: 170px; min-height: 90px;
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
    border: 1px solid var(--line); border-radius: 8px; padding: 12px;
    font-size: 13px; line-height: 1.5; white-space: pre-wrap; user-select: none;
    cursor: grab; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  }
  .postit:active { cursor: grabbing; }
</style>
