<script>
  // ───────────────────────────────────────────────────────────────────────
  // 그래프 다이어그램 보드.
  //
  //  - 노드: 도형(원/사각/마름모) + 색 + 텍스트. 서로 밀어내고 중심으로 당겨지며,
  //    간선으로 이으면 추가로 끌어당겨져 평형을 이룬다.
  //  - 간선: 유향/무향, 굵기 지정.
  //  - 도구 모드: '선택'(기본, 드래그 이동) / '간선'(시작→끝 노드 클릭으로 연결).
  //  - 격자 고정(pin), PNG 내보내기.
  //
  // 코어 접점은 주입된 cn(안정 API)뿐: cn.storage / cn.exporter.
  // ───────────────────────────────────────────────────────────────────────
  import { onMount, onDestroy } from "svelte";
  import { step, snapToGrid } from "./simulation.js";

  export let tab;     // 탭 메타. tab.file 이 보드 파일명
  export let cn;      // 코어 안정 API

  const W = 1000, H = 680;          // 보드 논리 좌표계(viewBox)
  const FILE = tab?.file ?? "board.json";

  let nodes = [];     // {id,x,y,vx,vy,pinned,shape,color,text}
  let edges = [];     // {id,from,to,directed,width}
  let selectedId = null;
  let tool = "select";            // "select" | "edge"
  let edgeStart = null;           // 간선 도구에서 선택된 시작 노드
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
      const clean = nodes.map(({ vx, vy, fx, fy, ...keep }) => keep);
      cn.storage.writeJson(FILE, { nodes: clean, edges });
    }, 400);
  }

  // --- 물리 루프 ---
  let raf;
  function loop() {
    if (running && !dragging) {
      const energy = step(nodes, edges, { w: W, h: H }, {});
      nodes = nodes;            // 반응성 트리거 (간선도 함께 재계산됨, 아래 $: 참고)
      if (energy < 0.05) running = false;
    }
    raf = requestAnimationFrame(loop);
  }
  onDestroy(() => { cancelAnimationFrame(raf); save(); });
  function wake() { running = true; }

  // 노드 빠른 조회 — nodes가 바뀔 때마다 갱신(드래그 시 간선이 따라오게 하는 핵심)
  $: byId = new Map(nodes.map((n) => [n.id, n]));
  // 간선 좌표를 nodes에 의존시켜 반응형으로 계산한다.
  // 이렇게 해야 노드가 움직일 때 간선 끝점도 함께 갱신된다(이전 버그 수정).
  $: edgeLines = edges
    .map((e) => ({ e, a: byId.get(e.from), b: byId.get(e.to) }))
    .filter((x) => x.a && x.b);

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
      const nn = { ...n, pinned };
      if (pinned) snapToGrid(nn);
      return nn;
    });
    wake(); save();
  }

  // 간선 도구: 도구를 켠 뒤 시작 노드 클릭 → 끝 노드 클릭.
  function nodeClick(id) {
    if (tool === "edge") {
      if (edgeStart == null) { edgeStart = id; return; }   // 시작 선택
      if (edgeStart !== id) {                               // 끝 선택 → 연결
        const exists = edges.some((e) =>
          (e.from === edgeStart && e.to === id) || (e.from === id && e.to === edgeStart));
        if (!exists) {
          edges = [...edges, { id: eid(), from: edgeStart, to: id, directed: false, width: 2 }];
          wake(); save();
        }
      }
      edgeStart = null;       // 한 간선 완성 후 초기화(연속 연결하려면 다시 시작 클릭)
    } else {
      selectedId = id;
    }
  }
  function setTool(t) { tool = t; edgeStart = null; }
  function deleteEdge(id) { edges = edges.filter((e) => e.id !== id); selectedEdge = null; save(); }
  function cycleEdge(e) {
    edges = edges.map((x) => x.id === e.id
      ? { ...x, directed: !x.directed, width: x.directed ? (x.width % 6) + 1 : x.width }
      : x);
    save();
  }
  let selectedEdge = null;

  // --- 드래그(선택 도구에서만) ---
  let dragging = null;
  let dragOff = { x: 0, y: 0 };
  function toBoard(evt) {
    const r = svgEl.getBoundingClientRect();
    return { x: (evt.clientX - r.left) / r.width * W, y: (evt.clientY - r.top) / r.height * H };
  }
  function onDown(evt, n) {
    if (tool !== "select") return;     // 간선 도구일 땐 드래그 안 함
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
    // nodes 갱신 → byId/edgeLines 자동 재계산 → 간선이 노드를 따라온다.
  }
  function onUp() {
    const n = nodes.find((x) => x.id === dragging);
    if (n && n.pinned) { snapToGrid(n); nodes = nodes; }
    dragging = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    wake(); save();
  }

  // --- PNG 내보내기 ---
  async function exportPng() {
    const wasRunning = running; running = false;
    try {
      const dataUrl = await cn.exporter.svgToPngDataUrl(svgEl, 2);
      await cn.exporter.savePng(dataUrl, (tab?.title ?? "graph") + ".png");
    } catch (e) { console.warn("내보내기 실패:", e); }
    running = wasRunning;
  }

  function radius(n) { return Math.max(26, Math.min(46, 18 + n.text.length * 3)); }
</script>

<div class="graph">
  <div class="toolbar">
    <button on:click={addNode}>+ 노드</button>
    <div class="tools">
      <button class:on={tool === "select"} on:click={() => setTool("select")}>선택</button>
      <button class:on={tool === "edge"} on:click={() => setTool("edge")}>간선</button>
    </div>
    <button class:on={running} on:click={() => (running = !running)}>{running ? "정지" : "재배치"}</button>
    <button on:click={exportPng}>PNG 내보내기</button>
    <span class="hint">
      {#if tool === "edge"}
        {edgeStart ? "끝 노드를 클릭하세요" : "시작 노드를 클릭하세요"}
      {:else}
        노드를 끌어 옮기고, 클릭해 선택
      {/if}
    </span>
  </div>

  <div class="stage">
    <svg bind:this={svgEl} viewBox="0 0 {W} {H}" class="board"
         on:click|self={() => { selectedId = null; selectedEdge = null; edgeStart = null; }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="var(--line)" stroke-width="0.5"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--text-dim)"/>
        </marker>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" opacity="0.5"/>

      <!-- 간선: edgeLines는 nodes에 반응형으로 의존하므로 노드를 따라 움직인다 -->
      {#each edgeLines as { e, a, b } (e.id)}
        <line
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={selectedEdge === e.id ? "var(--accent)" : "var(--text-dim)"}
          stroke-width={e.width}
          marker-end={e.directed ? "url(#arrow)" : ""}
          on:click|stopPropagation={() => { selectedEdge = e.id; cycleEdge(e); }}
          on:auxclick|preventDefault={() => deleteEdge(e.id)}
          class="edge"
        />
      {/each}

      <!-- 노드 -->
      {#each nodes as n (n.id)}
        <g class="node" class:sel={selectedId === n.id} class:start={edgeStart === n.id}
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
        </g>
      {/each}
    </svg>

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
        <button class="danger" on:click={() => deleteNode(selectedId)}>노드 삭제</button>
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
  .tools { display: flex; gap: 0; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .tools button { border: none; border-radius: 0; }
  .tools button.on { background: var(--accent); color: var(--bg); }
  .hint { margin-left: auto; color: var(--text-dim); font-size: 12px; }

  .stage { flex: 1; position: relative; min-height: 0; }
  .board { width: 100%; height: 100%; display: block; background: var(--surface); }

  .edge { cursor: pointer; }
  .edge:hover { stroke: var(--accent); }
  .node { cursor: grab; }
  .node:active { cursor: grabbing; }
  .node.sel circle, .node.sel rect, .node.sel polygon { stroke: var(--text); stroke-width: 2; }
  .node.start circle, .node.start rect, .node.start polygon { stroke: var(--accent); stroke-width: 3; }
  .label { fill: var(--bg); font-size: 13px; font-family: var(--font-ui); pointer-events: none; }

  .inspector {
    position: absolute; top: 12px; right: 12px; width: 220px;
    background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px;
    padding: 14px; display: flex; flex-direction: column; gap: 10px;
  }
  .inspector h3 { margin: 0; font-size: 13px; color: var(--text-dim); }
  .inspector label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
  .inspector input:not([type]), .inspector select {
    background: var(--surface); color: var(--text); border: 1px solid var(--line);
    border-radius: 6px; padding: 4px 6px; font-family: var(--font-ui);
  }
  .swatches { display: flex; gap: 6px; }
  .swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; }
  .swatch.on { border-color: var(--text); }
  .check { flex-direction: row; align-items: center; gap: 6px; color: var(--text); }
  .danger { color: var(--danger); border: 1px solid var(--danger); border-radius: 6px; padding: 5px; }
  .tip { font-size: 11px; color: var(--text-dim); margin: 0; line-height: 1.4; }
</style>
