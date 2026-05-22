<script>
  // 그래프 보드 편집기. 한 보드 파일(graph/<boardId>.json)을 편집한다.
  //  - 노드: 도형/색/텍스트 편집, 삭제.
  //  - 간선: 도구로 시작→끝 클릭 연결, 유향/굵기 변경, 삭제. 화살표는 도형 가장자리에서 시작.
  //  - 드래그 이동, 격자 고정, PNG 내보내기.
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { step, snapToGrid } from "./simulation.js";

  export let cn;
  export let boardId;
  export let title = "보드";
  const dispatch = createEventDispatcher();

  const W = 1000, H = 680;
  const FILE = `${boardId}.json`;

  let nodes = [];
  let edges = [];
  let selectedId = null;
  let selectedEdge = null;
  let tool = "select";   // "select" | "edge"
  let edgeStart = null;
  let running = true;
  let svgEl;
  let loaded = false;

  const SHAPES = ["circle", "rect", "diamond"];
  const COLORS = ["#b08454", "#6f7d63", "#9a9079", "#a8694e", "#5e6b78"];

  onMount(async () => {
    const data = await cn.storage.readJson(FILE, { nodes: [], edges: [] });
    nodes = data.nodes ?? [];
    edges = data.edges ?? [];
    for (const n of nodes) { n.vx ??= 0; n.vy ??= 0; n.pinned ??= false; }
    if (nodes.length === 0) seed();
    loaded = true;
    loop();
  });
  function seed() {
    nodes = [
      { id: nid(), x: W/2-80, y: H/2, vx:0, vy:0, pinned:false, shape:"circle", color:COLORS[0], text:"노드 A" },
      { id: nid(), x: W/2+80, y: H/2, vx:0, vy:0, pinned:false, shape:"rect", color:COLORS[1], text:"노드 B" },
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

  let raf;
  function loop() {
    if (running && !dragging) {
      const energy = step(nodes, edges, { w: W, h: H }, {});
      nodes = nodes;
      if (energy < 0.05) running = false;
    }
    raf = requestAnimationFrame(loop);
  }
  onDestroy(() => { cancelAnimationFrame(raf); save(); });
  function wake() { running = true; }

  $: byId = new Map(nodes.map((n) => [n.id, n]));
  function radius(n) { return Math.max(26, Math.min(46, 18 + n.text.length * 3)); }

  // 간선 좌표 — 화살표가 끝 노드 도형에 가려지지 않도록, 끝점을 노드 반지름만큼 당겨 가장자리에서 멈춘다.
  $: edgeLines = edges.map((e) => {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const ra = radius(a), rb = radius(b);
    return {
      e,
      x1: a.x + ux * ra,           // 시작 노드 가장자리
      y1: a.y + uy * ra,
      x2: b.x - ux * (rb + 4),     // 끝 노드 가장자리(+여유로 화살표 머리가 보이게)
      y2: b.y - uy * (rb + 4),
    };
  }).filter(Boolean);

  // 노드 편집
  function addNode() {
    nodes = [...nodes, { id: nid(), x: W/2+(Math.random()-0.5)*120, y: H/2+(Math.random()-0.5)*120,
      vx:0, vy:0, pinned:false, shape:"circle", color:COLORS[0], text:"새 노드" }];
    wake(); save();
  }
  function deleteNode(id) {
    nodes = nodes.filter((n) => n.id !== id);
    edges = edges.filter((e) => e.from !== id && e.to !== id);
    if (selectedId === id) selectedId = null;
    wake(); save();
  }
  function selected() { return nodes.find((n) => n.id === selectedId); }
  function patchSelected(p) { nodes = nodes.map((n) => (n.id === selectedId ? { ...n, ...p } : n)); save(); }
  function togglePin(id) {
    nodes = nodes.map((n) => { if (n.id !== id) return n; const nn = { ...n, pinned: !n.pinned }; if (nn.pinned) snapToGrid(nn); return nn; });
    wake(); save();
  }

  function nodeClick(id) {
    if (tool === "edge") {
      if (edgeStart == null) { edgeStart = id; return; }
      if (edgeStart !== id) {
        const exists = edges.some((e) => (e.from===edgeStart&&e.to===id)||(e.from===id&&e.to===edgeStart));
        if (!exists) { edges = [...edges, { id: eid(), from: edgeStart, to: id, directed: false, width: 2 }]; wake(); save(); }
      }
      edgeStart = null;
    } else { selectedId = id; selectedEdge = null; }
  }
  function setTool(t) { tool = t; edgeStart = null; }
  function selectEdge(id) { selectedEdge = id; selectedId = null; }
  function deleteEdge(id) { edges = edges.filter((e) => e.id !== id); if (selectedEdge===id) selectedEdge=null; save(); }
  function cycleEdge(e) {
    edges = edges.map((x) => x.id===e.id ? { ...x, directed: !x.directed, width: x.directed ? (x.width%6)+1 : x.width } : x);
    save();
  }
  function curEdge() { return edges.find((e) => e.id === selectedEdge); }

  // 드래그
  let dragging = null, dragOff = { x:0, y:0 };
  function toBoard(evt) { const r = svgEl.getBoundingClientRect(); return { x:(evt.clientX-r.left)/r.width*W, y:(evt.clientY-r.top)/r.height*H }; }
  function onDown(evt, n) {
    if (tool !== "select") return;
    selectedId = n.id; selectedEdge = null; dragging = n.id;
    const p = toBoard(evt); dragOff = { x: p.x-n.x, y: p.y-n.y };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  }
  function onMove(evt) {
    if (!dragging) return;
    const p = toBoard(evt);
    nodes = nodes.map((n) => n.id===dragging ? { ...n, x:p.x-dragOff.x, y:p.y-dragOff.y, vx:0, vy:0 } : n);
  }
  function onUp() {
    const n = nodes.find((x) => x.id === dragging);
    if (n && n.pinned) { snapToGrid(n); nodes = nodes; }
    dragging = null;
    window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
    wake(); save();
  }

  async function exportPng() {
    const was = running; running = false;
    try {
      const dataUrl = await cn.exporter.svgToPngDataUrl(svgEl, 2);
      await cn.exporter.savePng(dataUrl, title + ".png");
    } catch (e) { console.warn("내보내기 실패:", e); }
    running = was;
  }
</script>

<div class="graph">
  <div class="toolbar">
    <button class="back" on:click={() => dispatch("back")}>‹ 목록</button>
    <span class="board-title">{title}</span>
    <button on:click={addNode}>+ 노드</button>
    <div class="tools">
      <button class:on={tool==="select"} on:click={() => setTool("select")}>선택</button>
      <button class:on={tool==="edge"} on:click={() => setTool("edge")}>간선</button>
    </div>
    <button class:on={running} on:click={() => (running=!running)}>{running?"정지":"재배치"}</button>
    <button on:click={exportPng}>PNG</button>
    <span class="hint">{#if tool==="edge"}{edgeStart?"끝 노드 클릭":"시작 노드 클릭"}{:else}끌어 이동 · 클릭 선택{/if}</span>
  </div>

  <div class="stage">
    <svg bind:this={svgEl} viewBox="0 0 {W} {H}" class="board"
         on:click|self={() => { selectedId=null; selectedEdge=null; edgeStart=null; }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="var(--line)" stroke-width="0.5"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--text)"/>
        </marker>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" opacity="0.5"/>

      {#each edgeLines as L (L.e.id)}
        <line x1={L.x1} y1={L.y1} x2={L.x2} y2={L.y2}
          stroke={selectedEdge===L.e.id ? "var(--accent)" : "var(--text-dim)"} stroke-width={L.e.width}
          marker-end={L.e.directed ? "url(#arrow)" : ""}
          on:click|stopPropagation={() => selectEdge(L.e.id)}
          class="edge" />
      {/each}

      {#each nodes as n (n.id)}
        <g class="node" class:sel={selectedId===n.id} class:start={edgeStart===n.id}
           on:pointerdown={(e) => onDown(e, n)} on:click|stopPropagation={() => nodeClick(n.id)}>
          {#if n.shape==="circle"}<circle cx={n.x} cy={n.y} r={radius(n)} fill={n.color}/>
          {:else if n.shape==="rect"}<rect x={n.x-radius(n)} y={n.y-radius(n)*0.7} width={radius(n)*2} height={radius(n)*1.4} rx="6" fill={n.color}/>
          {:else}<polygon points="{n.x},{n.y-radius(n)} {n.x+radius(n)},{n.y} {n.x},{n.y+radius(n)} {n.x-radius(n)},{n.y}" fill={n.color}/>{/if}
          <text x={n.x} y={n.y} text-anchor="middle" dominant-baseline="central" class="label">{n.text}</text>
        </g>
      {/each}
    </svg>

    <!-- 노드 인스펙터 -->
    {#if selected()}
      <aside class="inspector editable">
        <h3>노드</h3>
        <label>텍스트<input value={selected().text} on:input={(e) => patchSelected({ text: e.target.value })} /></label>
        <label>도형
          <select value={selected().shape} on:change={(e) => patchSelected({ shape: e.target.value })}>
            {#each SHAPES as s}<option value={s}>{s==="circle"?"원":s==="rect"?"사각형":"마름모"}</option>{/each}
          </select>
        </label>
        <div class="swatches">
          {#each COLORS as c}<button class="swatch" style="background:{c}" class:on={selected().color===c} on:click={() => patchSelected({ color: c })} aria-label="색"></button>{/each}
        </div>
        <label class="check"><input type="checkbox" checked={selected().pinned} on:change={() => togglePin(selectedId)} />격자 고정</label>
        <button class="danger" on:click={() => deleteNode(selectedId)}>노드 삭제</button>
      </aside>
    {/if}

    <!-- 간선 인스펙터 -->
    {#if curEdge()}
      <aside class="inspector editable">
        <h3>간선</h3>
        <label class="check"><input type="checkbox" checked={curEdge().directed} on:change={() => cycleEdge(curEdge())} />화살표(유향)</label>
        <label>굵기
          <input type="range" min="1" max="6" value={curEdge().width}
            on:input={(e) => { const w=Number(e.target.value); edges = edges.map((x)=>x.id===selectedEdge?{...x,width:w}:x); save(); }} />
        </label>
        <button class="danger" on:click={() => deleteEdge(selectedEdge)}>간선 삭제</button>
      </aside>
    {/if}
  </div>
</div>

<style>
  .graph { height: 100%; display: flex; flex-direction: column; }
  .toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
  .toolbar button { border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .toolbar button.on { border-color: var(--accent); color: var(--accent); }
  .back { color: var(--text-dim); }
  .board-title { font-weight: 500; margin-right: 4px; }
  .tools { display: flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
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
  .inspector { position: absolute; top: 12px; right: 12px; width: 210px; background: var(--surface-2);
    border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .inspector h3 { margin: 0; font-size: 13px; color: var(--text-dim); }
  .inspector label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
  .inspector input:not([type]), .inspector select { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; font-family: var(--font-ui); }
  .swatches { display: flex; gap: 6px; }
  .swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; }
  .swatch.on { border-color: var(--text); }
  .check { flex-direction: row; align-items: center; gap: 6px; color: var(--text); }
  .danger { color: var(--danger); border: 1px solid var(--danger); border-radius: 6px; padding: 5px; }
</style>
