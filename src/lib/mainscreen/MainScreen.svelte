<script>
  // 메인화면 — 배경사진(사용자 변경 가능) + 위젯 보드 + 메모 부착 영역.
  // 위젯 배치는 app/widgets.json 에 저장된다(여기서는 기본 레이아웃 시연).
  import ClockWidget from "./widgets/ClockWidget.svelte";
  import DDayWidget from "./widgets/DDayWidget.svelte";
  import CalendarWidget from "./widgets/CalendarWidget.svelte";
  import QuoteWidget from "./widgets/QuoteWidget.svelte";

  // 위젯 인스턴스 목록. 추후 드래그 배치/추가 UI로 확장.
  const widgets = [
    { id: 1, type: "clock",    config: { mode: "digital", hour24: true, font: "mono" } },
    { id: 2, type: "dday",     config: { label: "프로젝트 마감", date: "2026-12-31" } },
    { id: 3, type: "calendar", config: { heat: {} } },
    { id: 4, type: "quote",    config: { quotes: [{ text: "생각을 장벽 없이 표현하고 정리한다.", author: "설계철학" }] } },
  ];
  const map = { clock: ClockWidget, dday: DDayWidget, calendar: CalendarWidget, quote: QuoteWidget };

  // 배경: 사용자가 지정한 이미지가 있으면 app/ 리소스에서 불러오도록 확장.
  let background = null;
</script>

<div class="main" style={background ? `background-image:url(${background})` : ""}>
  <div class="board">
    {#each widgets as w (w.id)}
      <div class="card">
        <svelte:component this={map[w.type]} config={w.config} />
      </div>
    {/each}
  </div>
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
</style>
