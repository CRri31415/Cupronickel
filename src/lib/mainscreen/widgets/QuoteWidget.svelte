<script>
  // 인용구 위젯 — 사용자가 입력한 (문장, 저자) 목록에서 무작위로 하나 표시.
  export let config = { quotes: [{ text: "생각을 장벽 없이.", author: "Cupronickel" }] };
  $: pick = config.quotes[Math.floor(Math.random() * config.quotes.length)] ?? { text: "", author: "" };
</script>

<blockquote class="quote">
  <p>“{pick.text}”</p>
  <cite>— {pick.author}</cite>
</blockquote>

<style>
  .quote { margin: 0; max-width: 260px; }
  .quote p { font-style: italic; color: var(--text); line-height: 1.5; }
  .quote cite { display: block; text-align: right; color: var(--text-dim); font-size: 12px; }
</style>
