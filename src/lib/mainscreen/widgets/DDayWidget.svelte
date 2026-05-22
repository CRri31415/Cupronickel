<script>
  // 디데이 위젯 — 목표 날짜까지 남은 일수를 표시한다.
  // (달력 모듈이 설치되면 일정과 연동하도록 확장 예정. alpha는 직접 입력.)
  export let config = { label: "목표", date: "2026-12-31" };

  $: target = new Date(config.date + "T00:00:00");
  $: today = new Date(new Date().toDateString());
  $: diff = Math.round((target - today) / 86400000);
  $: text = diff === 0 ? "D-DAY" : diff > 0 ? `D-${diff}` : `D+${-diff}`;
</script>

<div class="dday">
  <div class="num">{text}</div>
  <div class="label">{config.label}</div>
</div>

<style>
  .dday { text-align: center; }
  .num { font-family: var(--font-mono); font-size: 30px; color: var(--accent); }
  .label { color: var(--text-dim); font-size: 12px; margin-top: 2px; }
</style>
