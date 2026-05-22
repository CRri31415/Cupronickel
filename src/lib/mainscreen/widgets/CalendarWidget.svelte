<script>
  // 달력 위젯 — 이번 달 미니 달력. 히트맵 지원(달력 모듈 데이터와 연동 예정).
  // alpha: heat 맵은 config.heat(날짜→0~1)로 주입받아 표시한다.
  export let config = { heat: {} };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  function heatColor(d) {
    const v = config.heat?.[`${year}-${month + 1}-${d}`] ?? 0;
    if (!v) return "transparent";
    return `color-mix(in srgb, var(--accent-2) ${Math.round(v * 100)}%, transparent)`;
  }
</script>

<div class="cal">
  <div class="head">{year}.{String(month + 1).padStart(2, "0")}</div>
  <div class="grid">
    {#each ["일","월","화","수","목","금","토"] as w}<span class="w">{w}</span>{/each}
    {#each cells as d}
      <span class="d" class:today={d === now.getDate()} style="background:{d ? heatColor(d) : 'transparent'}">{d ?? ""}</span>
    {/each}
  </div>
</div>

<style>
  .cal { font-size: 11px; }
  .head { color: var(--text-dim); margin-bottom: 4px; text-align: center; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .w { color: var(--text-dim); text-align: center; }
  .d { aspect-ratio: 1; display: grid; place-items: center; border-radius: 3px; color: var(--text); }
  .d.today { outline: 1px solid var(--accent); }
</style>
