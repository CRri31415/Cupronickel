<script>
  // ───────────────────────────────────────────────────────────────────────
  // 암기 모듈 — 덱(분류) + FSRS.
  //
  //  - 카드는 deck(분류명)으로 묶인다. 덱별 카드 수/복습 대상 수를 보여준다.
  //  - 덱별 또는 전체 복습. 복습 대상 수 미리 보기.
  //  - 카드 목록에서 각 카드의 다음 리뷰 날짜를 확인.
  //  - 복습: 앞면 → Space/Enter로 뒷면+평점 → 1~4 키.
  //
  // 데이터: card/cards.json. 코어 접점은 cn(안정 API)뿐.
  // ───────────────────────────────────────────────────────────────────────
  import { onMount, onDestroy } from "svelte";
  import { newCardState, review, isDue, previewIntervals } from "./fsrs.js";

  export let tab;
  export let cn;

  const FILE = "cards.json";
  let cards = [];          // {id, deck, front, back, fsrs}
  let loaded = false;
  let mode = "manage";     // "manage" | "review"
  let activeDeck = "전체";  // 보고 있는 덱

  // 복습 상태
  let queue = [];
  let curIndex = 0;
  let showBack = false;
  let preview = {};

  let _id = 0;
  const cid = () => `c${Date.now()}_${_id++}`;

  onMount(load);
  async function load() {
    cards = (await cn.storage.readJson(FILE, [])) ?? [];
    for (const c of cards) { c.fsrs ??= newCardState(); c.deck ??= "기본"; }
    loaded = true;
  }
  function save() { cn.storage.writeJson(FILE, cards); }

  // 덱 목록(+가상의 "전체")
  $: decks = ["전체", ...new Set(cards.map((c) => c.deck))];
  // 현재 덱의 카드
  $: visibleCards = cards.filter((c) => activeDeck === "전체" || c.deck === activeDeck);
  // 덱별 due 카운트
  function dueCountOf(deck) {
    const now = Date.now();
    return cards.filter((c) => (deck === "전체" || c.deck === deck) && c.front.trim() && isDue(c.fsrs, now)).length;
  }
  $: activeDue = loaded ? dueCountOf(activeDeck) : 0;

  // --- 편집 ---
  function addCard() {
    const deck = activeDeck === "전체" ? "기본" : activeDeck;
    cards = [...cards, { id: cid(), deck, front: "", back: "", fsrs: newCardState() }];
    save();
  }
  function edit(id, field, val) { cards = cards.map((c) => (c.id === id ? { ...c, [field]: val } : c)); save(); }
  function remove(id) { cards = cards.filter((c) => c.id !== id); save(); }

  // 덱 생성: 인라인 입력(메시지 창 대신)
  let addingDeck = false, newDeckName = "";
  function startAddDeck() { addingDeck = true; newDeckName = ""; }
  function commitDeck() {
    const name = newDeckName.trim();
    if (name) activeDeck = name; // 카드를 추가하면 이 덱에 속하게 됨
    addingDeck = false;
  }

  // --- 복습 ---
  function startReview(deck) {
    const now = Date.now();
    queue = cards.filter((c) => (deck === "전체" || c.deck === deck) && c.front.trim() && isDue(c.fsrs, now)).map((c) => c.id);
    if (queue.length === 0) return;
    curIndex = 0; showBack = false; mode = "review"; refreshPreview();
  }
  function curCard() { return cards.find((c) => c.id === queue[curIndex]); }
  function refreshPreview() { const c = curCard(); if (c) { preview = previewIntervals(c.fsrs); renderFaces(c); } }
  function reveal() { showBack = true; }
  function rate(r) {
    if (!showBack) return;
    const c = curCard();
    const next = review(c.fsrs, r);
    cards = cards.map((x) => (x.id === c.id ? { ...x, fsrs: next } : x));
    save();
    if (curIndex + 1 < queue.length) { curIndex += 1; showBack = false; refreshPreview(); }
    else { mode = "manage"; }
  }

  // 카드 앞/뒷면을 텍스트 확장(TeX/SMILES)으로 렌더 (설치 시)
  let frontHtml = "", backHtml = "";
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
  async function renderFaces(c) {
    if (cn.text.available()) {
      frontHtml = await cn.text.render(escapeHtml(c.front));
      backHtml = await cn.text.render(escapeHtml(c.back));
    } else {
      frontHtml = escapeHtml(c.front); backHtml = escapeHtml(c.back);
    }
  }

  function onKey(e) {
    if (mode !== "review") return;
    if (!showBack && (e.code === "Space" || e.code === "Enter")) { e.preventDefault(); reveal(); }
    else if (showBack && ["1","2","3","4"].includes(e.key)) { e.preventDefault(); rate(Number(e.key)); }
  }
  onMount(() => window.addEventListener("keydown", onKey));
  onDestroy(() => window.removeEventListener("keydown", onKey));

  const RATING_LABELS = { 1:"다시", 2:"어려움", 3:"보통", 4:"쉬움" };
  function fmtDue(ts) {
    if (!ts) return "미학습";
    const d = new Date(ts), now = new Date();
    const days = Math.round((d - now) / 86400000);
    if (days <= 0) return "지금";
    if (days === 1) return "내일";
    return `${days}일 후`;
  }
</script>

<div class="card-mod editable">
  {#if mode === "manage"}
    <div class="layout">
      <!-- 덱 사이드바 -->
      <aside class="decks">
        <div class="decks-head">덱</div>
        {#each decks as d}
          <button class="deck" class:on={activeDeck === d} on:click={() => (activeDeck = d)}>
            <span class="dname">{d}</span>
            {#if dueCountOf(d) > 0}<span class="badge">{dueCountOf(d)}</span>{/if}
          </button>
        {/each}
        {#if addingDeck}
          <input class="inline-input" bind:value={newDeckName} placeholder="덱 이름"
            on:keydown={(e) => e.key === "Enter" && commitDeck()} on:blur={commitDeck} autofocus />
        {:else}
          <button class="new-deck" on:click={startAddDeck}>+ 덱</button>
        {/if}
      </aside>

      <!-- 카드 목록 -->
      <div class="cards-pane">
        <header>
          <h2>{activeDeck}</h2>
          <span class="cnt">{visibleCards.length}장 · 복습 {activeDue}장</span>
          <button class="add" on:click={addCard}>+ 카드</button>
          <button class="review" disabled={activeDue === 0} on:click={() => startReview(activeDeck)}>복습 시작</button>
        </header>

        {#if loaded}
          {#if visibleCards.length === 0}
            <p class="empty">카드가 없습니다. "+ 카드"로 추가하세요.</p>
          {:else}
            <div class="list">
              {#each visibleCards as c (c.id)}
                <div class="card-row">
                  <textarea placeholder="앞면" value={c.front} on:input={(e) => edit(c.id, "front", e.target.value)}></textarea>
                  <textarea placeholder="뒷면" value={c.back} on:input={(e) => edit(c.id, "back", e.target.value)}></textarea>
                  <div class="meta">
                    <select value={c.deck} on:change={(e) => edit(c.id, "deck", e.target.value)}>
                      {#each decks.filter((d) => d !== "전체") as d}<option value={d}>{d}</option>{/each}
                    </select>
                    <span class="due">{fmtDue(c.fsrs?.due)}</span>
                    <button class="del" on:click={() => remove(c.id)} aria-label="삭제">×</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {:else}
    <!-- 복습 화면 -->
    <div class="review-stage">
      <div class="progress">{curIndex + 1} / {queue.length}</div>
      <div class="face">
        <div class="front">{@html frontHtml}</div>
        {#if showBack}<div class="divider"></div><div class="back">{@html backHtml}</div>{/if}
      </div>
      {#if !showBack}
        <button class="reveal" on:click={reveal}>뒷면 보기 (Space / Enter)</button>
      {:else}
        <div class="ratings">
          {#each [1,2,3,4] as r}
            <button class="rate" on:click={() => rate(r)}>
              <span class="k">{r}</span><span class="lbl">{RATING_LABELS[r]}</span><span class="iv">{preview[r]}일</span>
            </button>
          {/each}
        </div>
      {/if}
      <button class="quit" on:click={() => (mode = "manage")}>그만두기</button>
    </div>
  {/if}
</div>

<style>
  .card-mod { height: 100%; box-sizing: border-box; }
  .layout { display: grid; grid-template-columns: 180px 1fr; height: 100%; }
  .decks { border-right: 1px solid var(--line); padding: 16px 10px; display: flex; flex-direction: column; gap: 4px; overflow: auto; }
  .decks-head { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; padding: 0 6px 6px; }
  .deck { display: flex; align-items: center; gap: 6px; border: none; border-radius: 6px; padding: 7px 8px; text-align: left; }
  .deck:hover { background: var(--surface-2); }
  .deck.on { background: var(--surface-2); color: var(--accent); }
  .dname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { background: var(--accent); color: var(--bg); border-radius: 10px; font-size: 11px; padding: 0 7px; }
  .new-deck { margin-top: 8px; border: 1px dashed var(--line); border-radius: 6px; padding: 6px; color: var(--text-dim); }
  .inline-input { background: var(--surface); color: var(--text); border: 1px solid var(--accent); border-radius: 6px; padding: 6px 8px; margin-top: 8px; font-family: var(--font-ui); }
  .face :global(.smiles svg) { background: #fff; border-radius: 6px; }

  .cards-pane { padding: 20px 24px; overflow: auto; }
  header { display: flex; align-items: center; gap: 12px; }
  h2 { margin: 0; font-weight: 500; }
  .cnt { color: var(--text-dim); font-size: 12px; }
  .add { margin-left: auto; border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .review { border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 14px; }
  .review:disabled { opacity: 0.4; border-color: var(--line); color: var(--text-dim); }
  .empty { color: var(--text-dim); margin-top: 20px; }

  .list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .card-row { display: grid; grid-template-columns: 1fr 1fr 130px; gap: 8px; align-items: stretch; }
  .card-row textarea { background: var(--surface-2); color: var(--text); border: 1px solid var(--line);
    border-radius: 6px; padding: 8px; min-height: 56px; resize: vertical; font-family: var(--font-ui); font-size: 13px; line-height: 1.5; }
  .meta { display: flex; flex-direction: column; gap: 4px; align-items: stretch; }
  .meta select { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; font-size: 12px; }
  .due { font-size: 11px; color: var(--text-dim); text-align: center; }
  .del { border: 1px solid var(--line); border-radius: 6px; color: var(--text-dim); padding: 2px; }
  .del:hover { color: var(--danger); border-color: var(--danger); }

  .review-stage { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
  .progress { color: var(--text-dim); font-size: 13px; }
  .face { width: min(560px, 80%); min-height: 200px; background: var(--surface-2); border: 1px solid var(--line);
    border-radius: 14px; padding: 32px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; text-align: center; }
  .front { font-size: 22px; }
  .divider { width: 60%; height: 1px; background: var(--line); }
  .back { font-size: 18px; color: var(--text-dim); }
  .reveal { border: 1px solid var(--accent); color: var(--accent); border-radius: 8px; padding: 10px 20px; }
  .ratings { display: flex; gap: 10px; }
  .rate { border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 78px; }
  .rate .k { font-family: var(--font-mono); color: var(--accent); font-size: 16px; }
  .rate .lbl { font-size: 13px; }
  .rate .iv { font-size: 11px; color: var(--text-dim); }
  .rate:hover { border-color: var(--accent); }
  .quit { color: var(--text-dim); border: none; font-size: 12px; }
</style>
