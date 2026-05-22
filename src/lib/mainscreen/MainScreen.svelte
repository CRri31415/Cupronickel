<script>
  // 메인화면 — 위젯 보드 + 메인에 부착된 메모(포스트잇) 표시.
  // 부착 메모는 메모 모듈이 memo/notes.json 에 저장한 pinned 항목을 읽어 보여준다.
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
  let pinnedMemos = [];

  // 메인화면이 열릴 때마다 부착 메모를 다시 읽는다(메모 탭에서 부착/해제한 결과 반영).
  onMount(loadPinned);
  async function loadPinned() {
    try {
      const raw = await ipc.readText("memo/notes.json");
      const all = JSON.parse(raw);
      pinnedMemos = all.filter((n) => n.pinned);
    } catch {
      pinnedMemos = []; // 메모 모듈 미설치 또는 부착 메모 없음
    }
  }
</script>

<div class="main" style={background ? `background-image:url(${background})` : ""}>
  <div class="board">
    {#each widgets as w (w.id)}
      <div class="card">
        <svelte:component this={map[w.type]} config={w.config} />
      </div>
    {/each}
  </div>

  {#if pinnedMemos.length}
    <div class="memos">
      {#each pinnedMemos as m (m.id)}
        <div class="postit">{m.text}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .main {
    height: 100%;
    background-color: var(--bg);
    background-size: cover;
    background-position: center;
    padding: 28px;
    overflow: auto;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 18px;
    align-content: start;
  }
  .card {
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 20px;
    display: grid;
    place-items: center;
    min-height: 120px;
    backdrop-filter: blur(2px);
  }
  .memos {
    margin-top: 22px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }
  .postit {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    min-height: 90px;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    user-select: text;
  }
</style>
