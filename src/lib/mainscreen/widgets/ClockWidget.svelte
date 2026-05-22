<script>
  // 시계 위젯 — 아날로그/디지털, 12/24시간, 폰트 옵션.
  export let config = { mode: "digital", hour24: true, font: "mono" };

  let now = new Date();
  // 1초마다 갱신. 위젯이 언마운트되면 자동 정리되어 성능 누수가 없다.
  const timer = setInterval(() => (now = new Date()), 1000);
  import { onDestroy } from "svelte";
  onDestroy(() => clearInterval(timer));

  $: h24 = now.getHours();
  $: h12 = ((h24 + 11) % 12) + 1;
  $: hh = String(config.hour24 ? h24 : h12).padStart(2, "0");
  $: mm = String(now.getMinutes()).padStart(2, "0");
  $: ss = String(now.getSeconds()).padStart(2, "0");
  $: ampm = h24 < 12 ? "AM" : "PM";

  // 아날로그 침 각도
  $: secDeg = now.getSeconds() * 6;
  $: minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
  $: hourDeg = (h24 % 12) * 30 + now.getMinutes() * 0.5;
</script>

{#if config.mode === "digital"}
  <div class="digital" style="font-family: var(--font-{config.font === 'mono' ? 'mono' : 'ui'})">
    {hh}:{mm}<span class="sec">:{ss}</span>
    {#if !config.hour24}<span class="ampm">{ampm}</span>{/if}
  </div>
{:else}
  <svg viewBox="-50 -50 100 100" class="analog">
    <circle r="46" class="face" />
    {#each Array(12) as _, i}
      <line x1="0" y1="-40" x2="0" y2="-44" class="tick" transform="rotate({i * 30})" />
    {/each}
    <line x1="0" y1="6" x2="0" y2="-24" class="hand hour" transform="rotate({hourDeg})" />
    <line x1="0" y1="8" x2="0" y2="-34" class="hand min" transform="rotate({minDeg})" />
    <line x1="0" y1="10" x2="0" y2="-40" class="hand sec" transform="rotate({secDeg})" />
    <circle r="2" class="pin" />
  </svg>
{/if}

<style>
  .digital { font-size: 34px; letter-spacing: 1px; color: var(--text); }
  .digital .sec { color: var(--text-dim); font-size: 0.6em; }
  .digital .ampm { color: var(--accent); font-size: 0.45em; margin-left: 6px; }
  .analog { width: 120px; height: 120px; }
  .face { fill: none; stroke: var(--line); stroke-width: 1.5; }
  .tick { stroke: var(--text-dim); stroke-width: 1.5; }
  .hand { stroke-linecap: round; }
  .hour { stroke: var(--text); stroke-width: 3; }
  .min  { stroke: var(--text); stroke-width: 2; }
  .sec  { stroke: var(--accent); stroke-width: 1; }
  .pin  { fill: var(--accent); }
</style>
