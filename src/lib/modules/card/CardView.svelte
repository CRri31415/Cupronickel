<script>
  // ───────────────────────────────────────────────────────────────────────
  // 암기 모듈 — Anki Basic 방식 카드(앞면/뒷면) + FSRS 스케줄링.
  //
  // 두 화면:
  //  - 목록(manage): 카드 추가/편집/삭제, 복습 시작.
  //  - 복습(review): 앞면 표시 → 스페이스/엔터로 뒷면 + 평점 → 1~4 키로 평가.
  //
  // 카드는 card/cards.json 에 저장. 각 카드는 FSRS 상태(due 등)를 함께 가진다.
  // 코어 접점은 주입된 cn(안정 API)뿐.
  // ───────────────────────────────────────────────────────────────────────
  import { onMount, onDestroy } from "svelte";
  import { newCardState, review, isDue, previewIntervals } from "./fsrs.js";

  export let tab;
  export let cn;

  const FILE = "cards.json";
  let cards = [];          // {id, front, back, fsrs}
  let loaded = false;
  let mode = "manage";     // "manage" | "review"

  // 복습 상태
  let queue = [];          // 복습 대상 카드 id 목록
  let curIndex = 0;
  let showBack = false;
  let preview = {};        // 현재 카드의 평점별 예상 간격

  let _id = 0;
  const cid = () => `c${Date.now()}_${_id++}`;

  onMount(load);
  async function load() {
    cards = (await cn.storage.readJson(FILE, [])) ?? [];
    // 상태 보장
    for (const c of cards) c.fsrs ??= newCardState();
    loaded = true;
  }
  function save() { cn.storage.writeJson(FILE, cards); }

  // --- 목록 편집 ---
  function addCard() {
    cards = [...cards, { id: cid(), front: "", back: "", fsrs: newCardState() }];
    save();
  }
  function edit(id, field, val) {
    cards = cards.map((c) => (c.id === id ? { ...c, [field]: val } : c));
    save();
  }
  function remove(id) { cards = cards.filter((c) => c.id !== id); save(); }

  // --- 복습 ---
  function startReview() {
    const now = Date.now();
    queue = cards.filter((c) => c.front.trim() && isDue(c.fsrs, now)).map((c) => c.id);
    if (queue.length === 0) return;
    curIndex = 0; showBack = false; mode = "review";
    refreshPreview();
  }
  function curCard() { return cards.find((c) => c.id === queue[curIndex]); }
  function refreshPreview() {
    const c = curCard();
    if (c) preview = previewIntervals(c.fsrs);
  }
  function reveal() { showBack = true; }
  function rate(r) {
    if (!showBack) return;
    const c = curCard();
    const next = review(c.fsrs, r);
    cards = cards.map((x) => (x.id === c.id ? { ...x, fsrs: next } : x));
    save();
    // 다음 카드
    if (curIndex + 1 < queue.length) {
      curIndex += 1; showBack = false; refreshPreview();
    } else {
      mode = "manage"; // 큐 소진
    }
  }

  // 키보드: 스페이스/엔터=뒤집기, 1~4=평점
  function onKey(e) {
    if (mode !== "review") return;
    if (!showBack && (e.code === "Space" || e.code === "Enter")) { e.preventDefault(); reveal(); }
    else if (showBack && ["1","2","3","4"].includes(e.key)) { e.preventDefault(); rate(Number(e.key)); }
  }
  onMount(() => window.addEventListener("keydown", onKey));
  onDestroy(() => window.removeEventListener("keydown", onKey));

  const RATING_LABELS = { 1: "다시", 2: "어려움", 3: "보통", 4: "쉬움" };

  $: dueCount = loaded ? cards.filter((c) => c.front.trim() && isDue(c.fsrs)).length : 0;
</script>

<div class="card-mod editable">
  {#if mode === "manage"}
    <header>
      <h2>암기</h2>
      <button class="add" on:click={addCard}>+ 카드</button>
      <button class="review" disabled={dueCount === 0} on:click={startReview}>
        복습 시작 ({dueCount})
      </button>
    </header>

    {#if loaded}
      {#if cards.length === 0}
        <p class="empty">카드가 없습니다. "+ 카드"로 추가하세요.</p>
      {:else}
        <div class="list">
          {#each cards as c (c.id)}
            <div class="card-row">
              <textarea placeholder="앞면" value={c.front} on:input={(e) => edit(c.id, "front", e.target.value)}></textarea>
              <textarea placeholder="뒷면" value={c.back} on:input={(e) => edit(c.id, "back", e.target.value)}></textarea>
              <button class="del" on:click={() => remove(c.id)} aria-label="삭제">×</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {:else}
    <!-- 복습 화면 -->
    <div class="review-stage">
      <div class="progress">{curIndex + 1} / {queue.length}</div>
      <div class="face">
        <div class="front">{curCard()?.front}</div>
        {#if showBack}
          <div class="divider"></div>
          <div class="back">{curCard()?.back}</div>
        {/if}
      </div>

      {#if !showBack}
        <button class="reveal" on:click={reveal}>뒷면 보기 (Space / Enter)</button>
      {:else}
        <div class="ratings">
          {#each [1,2,3,4] as r}
            <button class="rate r{r}" on:click={() => rate(r)}>
              <span class="k">{r}</span>
              <span class="lbl">{RATING_LABELS[r]}</span>
              <span class="iv">{preview[r]}일</span>
            </button>
          {/each}
        </div>
      {/if}
      <button class="quit" on:click={() => (mode = "manage")}>그만두기</button>
    </div>
  {/if}
</div>

<style>
  .card-mod { padding: 24px 28px; height: 100%; box-sizing: border-box; }
  header { display: flex; align-items: center; gap: 12px; }
  h2 { margin: 0; font-weight: 500; }
  .add { border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .review { margin-left: auto; border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 14px; }
  .review:disabled { opacity: 0.4; border-color: var(--line); color: var(--text-dim); }
  .empty { color: var(--text-dim); margin-top: 20px; }

  .list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .card-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: stretch; }
  .card-row textarea {
    background: var(--surface-2); color: var(--text); border: 1px solid var(--line);
    border-radius: 6px; padding: 8px; min-height: 56px; resize: vertical;
    font-family: var(--font-ui); font-size: 13px; line-height: 1.5;
  }
  .del { border: 1px solid var(--line); border-radius: 6px; color: var(--text-dim); width: 32px; }
  .del:hover { color: var(--danger); border-color: var(--danger); }

  /* 복습 */
  .review-stage { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
  .progress { color: var(--text-dim); font-size: 13px; }
  .face {
    width: min(560px, 80%); min-height: 200px; background: var(--surface-2);
    border: 1px solid var(--line); border-radius: 14px; padding: 32px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; text-align: center;
  }
  .front { font-size: 22px; }
  .divider { width: 60%; height: 1px; background: var(--line); }
  .back { font-size: 18px; color: var(--text-dim); }
  .reveal { border: 1px solid var(--accent); color: var(--accent); border-radius: 8px; padding: 10px 20px; }
  .ratings { display: flex; gap: 10px; }
  .rate {
    border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px;
    display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 78px;
  }
  .rate .k { font-family: var(--font-mono); color: var(--accent); font-size: 16px; }
  .rate .lbl { font-size: 13px; }
  .rate .iv { font-size: 11px; color: var(--text-dim); }
  .rate:hover { border-color: var(--accent); }
  .quit { color: var(--text-dim); border: none; font-size: 12px; }
</style>
