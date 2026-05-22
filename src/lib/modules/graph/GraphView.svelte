<script>
  // ───────────────────────────────────────────────────────────────────────
  // 그래프 다이어그램 보드.
  //
  // 구성:
  //  - 노드: 도형(원/사각/마름모) + 색 + 텍스트. 기본적으로 서로 밀어내고
  //    중심으로 당겨지며, 간선으로 이으면 추가로 끌어당겨져 평형을 이룬다.
  //  - 간선: 유향/무향, 굵기 지정. 두 노드를 잇는다.
  //  - 드래그로 노드 이동, 격자 고정(pin) 토글, PNG로 내보내기.
  //
  // 코어와의 접점은 주입된 `cn`(안정 API)뿐이다:
  //  - cn.storage : graph/ 폴더에 보드 JSON 저장/로드
  //  - cn.exporter: SVG → PNG 내보내기
  //  - cn.text    : (텍스트 확장 설치 시) 노드 텍스트 렌더 — 여기서는 평문 우선
  // ───────────────────────────────────────────────────────────────────────
  import { onMount, onDestroy, tick } from "svelte";
  import { step, snapToGrid } from "./simulation.js";

  export let tab;     // 탭 메타. tab.file 이 보드 파일명(없으면 기본 보드)
  export let cn;      // 코어 안정 API

  const W = 1000, H = 680;          // 보드 논리 좌표계(viewBox)
  const FILE = tab?.file ?? "board.json";

  let nodes = [];     // {id, x, y, vx, vy, pinned, shape, color, text}
  let edges = [];     // {id, from, to, directed, width}
  let selectedId = null;
  let linkFrom = null;            // 간선 연결 시작 노드(클릭-클릭 방식)
  let running = true;             // 물리 시뮬레이션 on/off
  let svgEl;
  let loaded = false;

  const SHAPES = ["circle", "rect", "diamond"];
  const COLORS = ["#b08454", "#6f7d63", "#9a9079", "#a8694e", "#5e6b78"];

  // --- 로드 / 저장 ---
  onMount(async () => {
    const data = await cn.storage.readJson(FILE, null);
    if (data) { nodes = data.nodes ?? []; edges = data.edges ?? []; }
    else { seed(); }
    // 로드한 노드에 물리 필드 보장
    for (const n of nodes) { n.vx ??= 0; n.vy ??= 0; n.pinned ??= false; }
    loaded = true;
    loop();
  });

  function seed() {
    nodes = [
      { id: nid(), x: W/2 - 80, y: H/2, vx:0, vy:0, pinned:false, shape:"circle", color:COLORS[0], text:"노드 A" },
      { id: nid(), x: W/2 + 80, y: H/2, vx:0, vy:0, pinned:false, shape:"rect",   color:COLORS[1], text:"노드 B" },
    ];
    edges = [{ id: eid(), from: nodes[0].id, to: nodes[1].id, directed: false, width: 2 }];
  }

  let _n = 0, _e = 0;
  const nid = () => `n${Date.now()}_${_n++}`;
  const eid = () => `e${Date.now()}_${_e++}`;

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // 물리 임시 필드(vx,vy,fx,fy)는 저장에서 제외해 파일을 깔끔히 유지
      const clean = nodes.map(({ vx, vy, fx, fy, ...keep }) => keep);
      cn.storage.writeJson(FILE, { nodes: clean, edges });
    }, 400);
  }

  // --- 물리 루프 ---
  let raf;
  function loop() {
    if (running && !dragging) {
      const energy = step(nodes, edges, { w: W, h: H }, {});
      nodes = nodes;            // Svelte 반응성 트리거
      if (energy < 0.05) running = false; // 수렴하면 자동 정지(성능)
    }
    raf = requestAnimationFrame(loop);
  }
  onDestroy(() => { cancelAnimationFrame(raf); save(); });

  // 변경이 생기면 다시 움직이게 한다.
  function wake() { running = true; }

  // --- 노드/간선 편집 ---
  function addNode() {
    nodes = [...nodes, {
      id: nid(), x: W/2 + (Math.random()-0.5)*120, y: H/2 + (Math.random()-0.5)*120,
      vx:0, vy:0, pinned:false, shape:"circle", color:COLORS[0], text:"새 노드",
    }];
    wake(); save();
  }
  function deleteNode(id) {
    nodes = nodes.filter((n) => n.id !== id);
    edges = edges.filter((e) => e.from !== id && e.to !== id);
    if (selectedId === id) selectedId = null;
    wake(); save();
  }
  function selected() { return nodes.find((n) => n.id === selectedId); }
  function patchSelected(patch) {
    nodes = nodes.map((n) => (n.id === selectedId ? { ...n, ...patch } : n));
    save();
  }
  function togglePin(id) {
    nodes = nodes.map((n) => {
      if (n.id !== id) return n;
      const pinned = !n.pinned;
      if (pinned) snapToGrid(n);   // 고정 시 격자에 스냅
      return { ...n };
    });
    wake(); save();
  }

  // 간선 연결: 한 노드 클릭(시작) → 다른 노드 클릭(끝)
  function nodeClick(id) {
    if (linkFrom && linkFrom !== id) {
      const exists = edges.some((e) =>
        (e.from === linkFrom && e.to === id) || (e.from === id && e.to === linkFrom));
      if (!exists) {
        edges = [...edges, { id: eid(), from: linkFrom, to: id, directed: false, width: 2 }];
        wake(); save();
      }
      linkFrom = null;
    } else {
      selectedId = id;
    }
  }
  function startLink() { if (selectedId) linkFrom = selectedId; }
  function deleteEdge(id) { edges = edges.filter((e) => e.id !== id); save(); }
  function cycleEdge(e) {
    // 무향 → 유향 → (굵기 순환) 으로 간단 토글
    edges = edges.map((x) => x.id === e.id
      ? { ...x, directed: !x.directed, width: x.directed ? (x.width % 6) + 1 : x.width }
      : x);
    save();
  }

  // --- 드래그 ---
  let dragging = null;     // 드래그 중인 노드 id
  let dragOff = { x: 0, y: 0 };
  function toBoard(evt) {
    // 화면 좌표 → viewBox 논리 좌표
    const r = svgEl.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) / r.width * W,
      y: (evt.clientY - r.top) / r.height * H,
    };
  }
  function onDown(evt, n) {
    selectedId = n.id;
    dragging = n.id;
    const p = toBoard(evt);
    dragOff = { x: p.x - n.x, y: p.y - n.y };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(evt) {
    if (!dragging) return;
    const p = toBoard(evt);
    nodes = nodes.map((n) => n.id === dragging
      ? { ...n, x: p.x - dragOff.x, y: p.y - dragOff.y, vx: 0, vy: 0 } : n);
  }
  function onUp() {
    const n = nodes.find((x) => x.id === dragging);
    if (n && n.pinned) snapToGrid(n);
    dragging = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    wake(); save();
  }

  // --- PNG 내보내기 ---
  async function exportPng() {
    const wasRunning = running; running = false;   // 정지 상태로 캡처
    await tick();
    try {
      const dataUrl = await cn.exporter.svgToPngDataUrl(svgEl, 2);
      await cn.exporter.savePng(dataUrl, (tab?.title ?? "graph") + ".png");
    } catch (e) { console.warn("내보내기 실패:", e); }
    running = wasRunning;
  }

  // 간선 좌표 헬퍼
  function nodeById(id) { return nodes.find((n) => n.id === id); }

  // 노드 반지름(텍스트 길이에 따라 살짝 키움)
  function radius(n) { return Math.max(26, Math.min(46, 18 + n.text.length * 3)); }
</script>

<div class="graph">
  <!-- 도구 막대 -->
  <div class="toolbar">
    <button on:click={addNode}>+ 노드</button>
    <button on:click={startLink} disabled={!selectedId} title="선택 노드에서 간선 시작">간선 잇기</button>
    <button class:on={running} on:click={() => (running = !running)}>
      {running ? "정지" : "재배치"}
    </button>
    <button on:click={exportPng}>PNG 내보내기</button>
    <span class="hint">
      {#if linkFrom}연결할 다른 노드를 클릭하세요…{:else}노드를 끌어 옮기고, 클릭해 선택{/if}
    </span>
  </div>

  <div class="stage">
    <!-- 보드 -->
    <svg bind:this={svgEl} viewBox="0 0 {W} {H}" class="board" on:click|self={() => { selectedId = null; linkFrom = null; }}>
      <!-- 격자 배경(고정 시 정렬 기준) -->
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="var(--line)" stroke-width="0.5"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--text-dim)"/>
        </marker>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" opacity="0.5"/>

      <!-- 간선 -->
      {#each edges as e (e.id)}
        {@const a = nodeById(e.from)}
        {@const b = nodeById(e.to)}
        {#if a && b}
          <line
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="var(--text-dim)" stroke-width={e.width}
            marker-end={e.directed ? "url(#arrow)" : ""}
            on:click={() => cycleEdge(e)}
            on:auxclick={() => deleteEdge(e.id)}
            class="edge"
          />
        {/if}
      {/each}

      <!-- 노드 -->
      {#each nodes as n (n.id)}
        <g class="node" class:sel={selectedId === n.id} class:pinned={n.pinned}
           on:pointerdown={(e) => onDown(e, n)}
           on:click|stopPropagation={() => nodeClick(n.id)}>
          {#if n.shape === "circle"}
            <circle cx={n.x} cy={n.y} r={radius(n)} fill={n.color} />
          {:else if n.shape === "rect"}
            <rect x={n.x - radius(n)} y={n.y - radius(n)*0.7} width={radius(n)*2} height={radius(n)*1.4} rx="6" fill={n.color} />
          {:else}
            <polygon points="{n.x},{n.y-radius(n)} {n.x+radius(n)},{n.y} {n.x},{n.y+radius(n)} {n.x-radius(n)},{n.y}" fill={n.color} />
          {/if}
          <text x={n.x} y={n.y} text-anchor="middle" dominant-baseline="central" class="label">{n.text}</text>
          {#if n.pinned}<text x={n.x + radius(n) - 4} y={n.y - radius(n) + 8} class="pin-mark">📌</text>{/if}
        </g>
      {/each}
    </svg>

    <!-- 선택 노드 속성 패널 -->
    {#if selected()}
      <aside class="inspector editable">
        <h3>노드</h3>
        <label>텍스트
          <input value={selected().text} on:input={(e) => patchSelected({ text: e.target.value })} />
        </label>
        <label>도형
          <select value={selected().shape} on:change={(e) => patchSelected({ shape: e.target.value })}>
            {#each SHAPES as s}<option value={s}>{s === "circle" ? "원" : s === "rect" ? "사각형" : "마름모"}</option>{/each}
          </select>
        </label>
        <div class="swatches">
          {#each COLORS as c}
            <button class="swatch" style="background:{c}" class:on={selected().color === c}
              on:click={() => patchSelected({ color: c })} aria-label="색"></button>
          {/each}
        </div>
        <label class="check">
          <input type="checkbox" checked={selected().pinned} on:change={() => togglePin(selectedId)} />
          격자에 고정
        </label>
        <div class="row">
          <button on:click={startLink}>간선 잇기</button>
          <button class="danger" on:click={() => deleteNode(selectedId)}>노드 삭제</button>
        </div>
        <p class="tip">간선 클릭: 유향/굵기 변경 · 간선 가운데클릭: 삭제</p>
      </aside>
    {/if}
  </div>
</div>

<style>
  .graph { height: 100%; display: flex; flex-direction: column; }
  .toolbar {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    border-bottom: 1px solid var(--line); background: var(--surface-2);
  }
  .toolbar button { border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .toolbar button.on { border-color: var(--accent); color: var(--accent); }
  .toolbar button:disabled { opacity: 0.4; cursor: default; }
  .hint { margin-left: auto; color: var(--text-dim); font-size: 12px; }

  .stage { flex: 1; position: relative; min-height: 0; }
  .board { width: 100%; height: 100%; display: block; cursor: default; background: var(--surface); }

  .edge { cursor: pointer; }
  .edge:hover { stroke: var(--accent); }
  .node { cursor: grab; }
  .node:active { cursor: grabbing; }
  .node.sel circle, .node.sel rect, .node.sel polygon { stroke: var(--text); stroke-width: 2; }
  .label { fill: var(--bg); font-size: 13px; font-family: var(--font-ui); pointer-events: none; }
  .pin-mark { font-size: 12px; pointer-events: none; }

  .inspector {
    position: absolute; top: 12px; right: 12px; width: 220px;
    background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px;
    padding: 14px; display: flex; flex-direction: column; gap: 10px;
  }
  .inspector h3 { margin: 0; font-size: 13px; color: var(--text-dim); }
  .inspector label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
  .inspector input[type="text"], .inspector input:not([type]), .inspector select {
    background: var(--surface); color: var(--text); border: 1px solid var(--line);
    border-radius: 6px; padding: 4px 6px; font-family: var(--font-ui);
  }
  .swatches { display: flex; gap: 6px; }
  .swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; }
  .swatch.on { border-color: var(--text); }
  .check { flex-direction: row; align-items: center; gap: 6px; color: var(--text); }
  .row { display: flex; gap: 6px; }
  .row button { flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 4px; }
  .danger { color: var(--danger); border-color: var(--danger) !important; }
  .tip { font-size: 11px; color: var(--text-dim); margin: 0; line-height: 1.4; }
</style>
