<script>
  // ───────────────────────────────────────────────────────────────────────
  // 시트 모듈 — 작은 표 제작 특화.
  //  기본 양식(기획서): 세로줄 없음, 상·하 굵은 가로줄, 헤더 구분선,
  //  Times New Roman 가운데 정렬. CSV/XLSX 불러오기 미지원.
  //  표는 이미지(PNG)로 내보낸다.
  //
  // 데이터: sheet/<id>.json (시트 목록은 _sheets.json 으로 관리).
  // 표를 SVG로 그려 PNG 내보내기에 사용한다.
  // ───────────────────────────────────────────────────────────────────────
  import { onMount } from "svelte";
  import { patchState } from "../../core/tabs.js";

  export let tab;
  export let cn;

  let sheets = [];          // [{id, name}]
  let loaded = false;
  let openId = null;
  let grid = [];            // 2D 배열(rows x cols), grid[0]은 헤더
  let sheetName = "";

  // 인라인
  let addingSheet = false, newSheetName = "";
  let ctx = null;

  onMount(async () => {
    const meta = (await cn.storage.readJson("_sheets.json", {})) ?? {};
    const items = await cn.storage.list();
    const files = items.filter((i) => !i.is_dir && i.name.endsWith(".json") && i.name !== "_sheets.json");
    sheets = files.map((f) => { const id = f.name.replace(/\.json$/, ""); return { id, name: meta[id] ?? id }; });
    loaded = true;
    if (tab?.state?.openId) openSheet(tab.state.openId);
  });

  let _s = 0;
  const sid = () => `sheet${Date.now()}_${_s++}`;

  async function createSheet() {
    const id = sid();
    const meta = (await cn.storage.readJson("_sheets.json", {})) ?? {};
    meta[id] = "새 표"; await cn.storage.writeJson("_sheets.json", meta);
    const g = [["열1", "열2", "열3"], ["", "", ""], ["", "", ""]];
    await cn.storage.writeJson(`${id}.json`, { grid: g });
    sheets = [...sheets, { id, name: "새 표" }];
    openSheet(id);
  }
  async function openSheet(id) {
    const data = await cn.storage.readJson(`${id}.json`, { grid: [["", ""]] });
    grid = data.grid; openId = id;
    sheetName = sheets.find((s) => s.id === id)?.name ?? "표";
    patchState(tab.id, { openId: id });
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => cn.storage.writeJson(`${openId}.json`, { grid }), 400);
  }
  async function renameSheet(id, name) {
    const meta = (await cn.storage.readJson("_sheets.json", {})) ?? {};
    meta[id] = name; await cn.storage.writeJson("_sheets.json", meta);
    sheets = sheets.map((s) => (s.id === id ? { ...s, name } : s));
    if (openId === id) sheetName = name;
  }
  async function deleteSheet(id) {
    await cn.storage.remove(`${id}.json`);
    const meta = (await cn.storage.readJson("_sheets.json", {})) ?? {};
    delete meta[id]; await cn.storage.writeJson("_sheets.json", meta);
    sheets = sheets.filter((s) => s.id !== id);
    if (openId === id) { openId = null; grid = []; }
  }

  // 셀 편집
  function setCell(r, c, v) { grid[r][c] = v; grid = grid; save(); }
  function addRow() { grid = [...grid, grid[0].map(() => "")]; save(); }
  function addCol() { grid = grid.map((row) => [...row, ""]); save(); }
  function delRow(r) { if (grid.length > 1) { grid = grid.filter((_, i) => i !== r); save(); } }
  function delCol(c) { if (grid[0].length > 1) { grid = grid.map((row) => row.filter((_, i) => i !== c)); save(); } }

  let ctxMenu = null;
  function openCtxMenu(e, id) { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, id }; }
  function closeCtxMenu() { ctxMenu = null; }

  // PNG 내보내기 — 논문 양식 SVG 생성
  let svgEl;
  async function exportPng() {
    try {
      const dataUrl = await cn.exporter.svgToPngDataUrl(svgEl, 3);
      await cn.exporter.savePng(dataUrl, sheetName + ".png");
    } catch (e) { console.warn("내보내기 실패:", e); }
  }

  // SVG 표 레이아웃 계산
  const CW = 120, RH = 34, PAD = 16;
  $: cols = grid[0]?.length ?? 0;
  $: rows = grid.length;
  $: svgW = PAD * 2 + cols * CW;
  $: svgH = PAD * 2 + rows * RH;
</script>

<svelte:window on:click={() => { closeCtxMenu(); }} />

{#if !openId}
  <div class="sheets editable">
    <header><h2>시트</h2><button class="add" on:click={createSheet}>+ 새 표</button></header>
    {#if loaded}
      {#if sheets.length === 0}<p class="empty">표가 없습니다.</p>{:else}
        <div class="list">
          {#each sheets as s (s.id)}
            <div class="row">
              <input class="name" value={s.name} on:input={(e) => renameSheet(s.id, e.target.value)} />
              <button on:click={() => openSheet(s.id)}>열기</button>
              <button class="del" on:click={() => deleteSheet(s.id)}>×</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <div class="editor editable">
    <div class="bar">
      <button class="back" on:click={() => { openId = null; }}>‹ 목록</button>
      <span class="title">{sheetName}</span>
      <button on:click={addRow}>+ 행</button>
      <button on:click={addCol}>+ 열</button>
      <button class="export" on:click={exportPng}>PNG 내보내기</button>
    </div>

    <!-- 편집용 표 -->
    <div class="table-wrap">
      <table class="paper">
        <tbody>
          {#each grid as row, r}
            <tr class:header={r === 0}>
              {#each row as cell, c}
                <td>
                  <input value={cell} on:input={(e) => setCell(r, c, e.target.value)} />
                  {#if r === 0 && grid[0].length > 1}<button class="cdel" on:click={() => delCol(c)} title="열 삭제">×</button>{/if}
                </td>
              {/each}
              {#if grid.length > 1}<td class="rowctl"><button class="rdel" on:click={() => delRow(r)} title="행 삭제">×</button></td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- 내보내기용 SVG(논문 양식): 화면 밖에 숨겨 둠 -->
    <div class="svg-hidden">
      <svg bind:this={svgEl} viewBox="0 0 {svgW} {svgH}" width={svgW} height={svgH} xmlns="http://www.w3.org/2000/svg">
        <rect width={svgW} height={svgH} fill="#ffffff"/>
        <!-- 상단 굵은 줄 -->
        <line x1={PAD} y1={PAD} x2={svgW-PAD} y2={PAD} stroke="#000" stroke-width="2"/>
        <!-- 헤더 구분선 -->
        <line x1={PAD} y1={PAD+RH} x2={svgW-PAD} y2={PAD+RH} stroke="#000" stroke-width="1"/>
        <!-- 하단 굵은 줄 -->
        <line x1={PAD} y1={svgH-PAD} x2={svgW-PAD} y2={svgH-PAD} stroke="#000" stroke-width="2"/>
        {#each grid as row, r}
          {#each row as cell, c}
            <text x={PAD + c*CW + CW/2} y={PAD + r*RH + RH/2 + 5}
              text-anchor="middle" font-family="Times New Roman, serif" font-size="15"
              font-weight={r === 0 ? "bold" : "normal"} fill="#000">{cell}</text>
          {/each}
        {/each}
      </svg>
    </div>
  </div>
{/if}

{#if ctxMenu}
  <div class="ctxmenu" style="left:{ctxMenu.x}px; top:{ctxMenu.y}px">
    <button class="danger" on:click={() => { deleteSheet(ctxMenu.id); closeCtxMenu(); }}>표 삭제</button>
  </div>
{/if}

<style>
  .sheets { padding: 24px 28px; }
  header { display: flex; align-items: center; gap: 12px; }
  h2 { margin: 0; font-weight: 500; }
  .add { border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 12px; }
  .empty { color: var(--text-dim); margin-top: 20px; }
  .list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .name { flex: 1; background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; }
  .row button { border: 1px solid var(--line); border-radius: 6px; padding: 6px 14px; }
  .del { width: 36px; color: var(--text-dim); }
  .del:hover { color: var(--danger); }

  .editor { height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
  .bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
  .back { color: var(--text-dim); border: none; }
  .title { font-weight: 500; flex: 1; }
  .bar button { border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .export { border-color: var(--accent) !important; color: var(--accent); }
  .table-wrap { flex: 1; overflow: auto; padding: 28px; }

  /* 편집 표: 논문 양식 미리보기(상·하 굵은 줄, 헤더 구분선, 세로줄 없음, 가운데 정렬, serif) */
  .paper { border-collapse: collapse; margin: 0 auto; font-family: "Times New Roman", serif; }
  .paper td { padding: 0; text-align: center; position: relative; }
  .paper input { width: 110px; border: none; background: transparent; text-align: center; padding: 7px 5px;
    font-family: "Times New Roman", serif; font-size: 15px; color: var(--text); outline: none; }
  .paper input:focus { background: var(--surface-2); }
  .paper tr:first-child { border-top: 2px solid var(--text); }
  .paper tr.header { border-bottom: 1px solid var(--text); font-weight: bold; }
  .paper tr:last-child { border-bottom: 2px solid var(--text); }
  .cdel, .rdel { position: absolute; border: none; color: var(--text-dim); font-size: 11px; opacity: 0.5; }
  .cdel { top: -16px; right: 2px; } .rdel { color: var(--text-dim); }
  .cdel:hover, .rdel:hover { color: var(--danger); opacity: 1; }
  .rowctl { border: none !important; }
  .svg-hidden { position: absolute; left: -99999px; top: 0; }
  .ctxmenu { position: fixed; z-index: 100; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 4px; }
  .ctxmenu .danger { color: var(--danger); border: none; padding: 8px 12px; }
</style>
