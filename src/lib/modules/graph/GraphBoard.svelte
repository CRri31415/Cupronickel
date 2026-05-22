<script>
  // 그래프 보드 편집기.
  //  - 노드: 도형/색/텍스트, 격자 고정, 삭제 — 모두 우클릭 메뉴에서.
  //  - 간선: 무향만 지원. 굵기 변경/삭제는 우클릭 메뉴에서.
  //  - 선택 도구: 드래그 이동 / 간선 도구: 시작→끝 클릭으로 연결.
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { step, snapToGrid } from "./simulation.js";

  export let cn;
  export let boardId;
  export let title = "보드";
  const dispatch = createEventDispatcher();

  const W = 1000, H = 680;
  const FILE = `${boardId}.json`;

  let nodes = [];
  let edges = [];          // {id, from, to, width} (무향)
  let tool = "select";
  let edgeStart = null;
  let running = true;
  let svgEl;
  let loaded = false;

  let ctx = null;          // 우클릭 메뉴
  let editNode = null;     // 노드 편집 패널 대상 id

  const SHAPES = ["circle", "rect", "diamond"];
  const COLORS = ["#b08454", "#6f7d63", "#9a9079", "#a8694e", "#5e6b78"];

  onMount(async () => {
    const data = await cn.storage.readJson(FILE, { nodes: [], edges: [] });
    nodes = data.nodes ?? []; edges = data.edges ?? [];
    for (const n of nodes) { n.vx ??= 0; n.vy ??= 0; n.pinned ??= false; }
    if (nodes.length === 0) seed();
    loaded = true; loop();
  });
  function seed() {
    nodes = [
      { id: nid(), x: W/2-80, y: H/2, vx:0, vy:0, pinned:false, shape:"circle", color:COLORS[0], text:"노드 A" },
      { id: nid(), x: W/2+80, y: H/2, vx:0, vy:0, pinned:false, shape:"rect", color:COLORS[1], text:"노드 B" },
    ];
    edges = [{ id: eid(), from: nodes[0].id, to: nodes[1].id, width: 2 }];
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
  $: edgeLines = edges.map((e) => {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) return null;
    const dx = b.x-a.x, dy = b.y-a.y; const d = Math.hypot(dx,dy)||1;
    const ux = dx/d, uy = dy/d;
    return { e, x1: a.x+ux*radius(a), y1: a.y+uy*radius(a), x2: b.x-ux*radius(b), y2: b.y-uy*radius(b) };
  }).filter(Boolean);

  function addNode() {
    nodes = [...nodes, { id: nid(), x: W/2+(Math.random()-0.5)*120, y: H/2+(Math.random()-0.5)*120,
      vx:0, vy:0, pinned:false, shape:"circle", color:COLORS[0], text:"새 노드" }];
    wake(); save();
  }
  function deleteNode(id) {
    nodes = nodes.filter((n) => n.id !== id);
    edges = edges.filter((e) => e.from !== id && e.to !== id);
    if (editNode === id) editNode = null;
    wake(); save();
  }
  function getNode(id) { return nodes.find((n) => n.id === id); }
  function patchNode(id, p) { nodes = nodes.map((n) => (n.id === id ? { ...n, ...p } : n)); save(); }
  function togglePin(id) {
    nodes = nodes.map((n) => { if (n.id !== id) return n; const nn = { ...n, pinned: !n.pinned }; if (nn.pinned) snapToGrid(nn); return nn; });
    wake(); save();
  }

  function nodeClick(id) {
    if (tool === "edge") {
      if (edgeStart == null) { edgeStart = id; return; }
      if (edgeStart !== id) {
        const exists = edges.some((e) => (e.from===edgeStart&&e.to===id)||(e.from===id&&e.to===edgeStart));
        if (!exists) { edges = [...edges, { id: eid(), from: edgeStart, to: id, width: 2 }]; wake(); save(); }
      }
      edgeStart = null;
    }
  }
  function setTool(t) { tool = t; edgeStart = null; }
  function deleteEdge(id) { edges = edges.filter((e) => e.id !== id); save(); }
  function setEdgeWidth(id, w) { edges = edges.map((e) => (e.id === id ? { ...e, width: w } : e)); save(); }

  function openNodeCtx(e, id) { e.preventDefault(); e.stopPropagation(); ctx = { x: e.clientX, y: e.clientY, type: "node", target: id }; }
  function openEdgeCtx(e, id) { e.preventDefault(); e.stopPropagation(); ctx = { x: e.clientX, y: e.clientY, type: "edge", target: id }; }
  function closeCtx() { ctx = null; }
  function curEdgeWidth(id) { return edges.find((e) => e.id === id)?.width ?? 2; }

  let dragging = null, dragOff = { x:0, y:0 };
  function toBoard(evt) { const r = svgEl.getBoundingClientRect(); return { x:(evt.clientX-r.left)/r.width*W, y:(evt.clientY-r.top)/r.height*H }; }
  function onDown(evt, n) {
    if (tool !== "select" || evt.button !== 0) return;
    dragging = n.id;
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
    try { await cn.exporter.savePng(await cn.exporter.svgToPngDataUrl(svgEl, 2), title + ".png"); }
    catch (e) { console.warn("내보내기 실패:", e); }
    running = was;
  }
</script>

<svelte:window on:click={closeCtx} />

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
    <span class="hint">{#if tool==="edge"}{edgeStart?"끝 노드 클릭":"시작 노드 클릭"}{:else}끌어 이동 · 우클릭으로 편집{/if}</span>
  </div>

  <div class="stage">
    <svg bind:this={svgEl} viewBox="0 0 {W} {H}" class="board" on:click|self={() => { edgeStart=null; }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="var(--line)" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" opacity="0.5"/>

      {#each edgeLines as L (L.e.id)}
        <line x1={L.x1} y1={L.y1} x2={L.x2} y2={L.y2} stroke="var(--text-dim)" stroke-width={L.e.width}
          on:contextmenu={(e) => openEdgeCtx(e, L.e.id)} class="edge" />
      {/each}

      {#each nodes as n (n.id)}
        <g class="node" class:start={edgeStart===n.id}
           on:pointerdown={(e) => onDown(e, n)}
           on:click|stopPropagation={() => nodeClick(n.id)}
           on:contextmenu={(e) => openNodeCtx(e, n.id)}>
          {#if n.shape==="circle"}<circle cx={n.x} cy={n.y} r={radius(n)} fill={n.color}/>
          {:else if n.shape==="rect"}<rect x={n.x-radius(n)} y={n.y-radius(n)*0.7} width={radius(n)*2} height={radius(n)*1.4} rx="6" fill={n.color}/>
          {:else}<polygon points="{n.x},{n.y-radius(n)} {n.x+radius(n)},{n.y} {n.x},{n.y+radius(n)} {n.x-radius(n)},{n.y}" fill={n.color}/>{/if}
          <text x={n.x} y={n.y} text-anchor="middle" dominant-baseline="central" class="label">{n.text}</text>
        </g>
      {/each}
    </svg>

    {#if editNode && getNode(editNode)}
      {@const n = getNode(editNode)}
      <aside class="inspector editable">
        <h3>노드 편집</h3>
        <label>텍스트<input value={n.text} on:input={(e) => patchNode(editNode, { text: e.target.value })} /></label>
        <label>도형
          <select value={n.shape} on:change={(e) => patchNode(editNode, { shape: e.target.value })}>
            {#each SHAPES as s}<option value={s}>{s==="circle"?"원":s==="rect"?"사각형":"마름모"}</option>{/each}
          </select>
        </label>
        <div class="swatches">{#each COLORS as c}<button class="swatch" style="background:{c}" class:on={n.color===c} on:click={() => patchNode(editNode, { color: c })} aria-label="색"></button>{/each}</div>
        <label class="check"><input type="checkbox" checked={n.pinned} on:change={() => togglePin(editNode)} />격자 고정</label>
        <button class="close" on:click={() => (editNode = null)}>닫기</button>
      </aside>
    {/if}
  </div>
</div>

{#if ctx}
  <div class="ctxmenu" style="left:{ctx.x}px; top:{ctx.y}px">
    {#if ctx.type === "node"}
      <button on:click={() => { editNode = ctx.target; closeCtx(); }}>편집(도형·색·텍스트)</button>
      <button on:click={() => { togglePin(ctx.target); closeCtx(); }}>격자 고정 전환</button>
      <button class="danger" on:click={() => { deleteNode(ctx.target); closeCtx(); }}>노드 삭제</button>
    {:else}
      <div class="ctx-width">굵기
        <input type="range" min="1" max="6" value={curEdgeWidth(ctx.target)}
          on:input={(e) => setEdgeWidth(ctx.target, Number(e.target.value))} />
      </div>
      <button class="danger" on:click={() => { deleteEdge(ctx.target); closeCtx(); }}>간선 삭제</button>
    {/if}
  </div>
{/if}

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
  .node.start circle, .node.start rect, .node.start polygon { stroke: var(--accent); stroke-width: 3; }
  .label { fill: var(--bg); font-size: 13px; font-family: var(--font-ui); pointer-events: none; }
  .inspector { position: absolute; top: 12px; right: 12px; width: 210px; background: var(--surface-2);
    border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .inspector h3 { margin: 0; font-size: 13px; color: var(--text-dim); }
  .inspector label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
  .inspector input:not([type]), .inspector select { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; }
  .swatches { display: flex; gap: 6px; }
  .swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; }
  .swatch.on { border-color: var(--text); }
  .check { flex-direction: row; align-items: center; gap: 6px; color: var(--text); }
  .close { border: 1px solid var(--line); border-radius: 6px; padding: 5px; }
  .ctxmenu { position: fixed; z-index: 100; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px;
    padding: 4px; display: flex; flex-direction: column; min-width: 150px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .ctxmenu button { border: none; text-align: left; padding: 8px 12px; border-radius: 5px; color: var(--text); }
  .ctxmenu button:hover { background: var(--surface); }
  .ctxmenu .danger { color: var(--danger); }
  .ctx-width { padding: 8px 12px; font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 8px; }
  .ctx-width input { flex: 1; }
</style>
