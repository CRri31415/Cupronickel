<script>
  // ───────────────────────────────────────────────────────────────────────
  // 노트 모듈 — 마크다운 노트를 폴더로 정리.
  //
  // 인덱스(note/_index.json)로 폴더와 노트를 관리한다. 빈 폴더도 인덱스에 남으므로
  // 파일을 안 만들어도 사라지지 않는다.
  //   index = { folders: ["기본","과학",...], notes: [{folder, name}, ...] }
  // 노트 본문: note/<folder>/<name>/<name>.md  (노트당 전용 폴더)
  //
  // 화면 상태(선택 노트/뷰)는 tab.state로 보존되어, 탭을 떠났다 와도 유지된다.
  // 폴더/노트 생성은 자체 인라인 입력. 삭제는 우클릭 메뉴. 노트는 폴더 간 드래그 이동.
  // ───────────────────────────────────────────────────────────────────────
  import { onMount } from "svelte";
  import { renderMarkdown } from "./markdown.js";
  import { patchState } from "../../core/tabs.js";

  export let tab;
  export let cn;

  let folders = ["기본"];
  let notes = [];           // [{folder, name}]
  let loaded = false;

  let current = null;        // {folder, name}
  let content = "";
  let viewMode = "edit";     // "edit" | "preview"
  let html = "";

  // 인라인 입력 상태
  let addingFolder = false, newFolderName = "";
  let addingNoteIn = null,  newNoteName = "";   // 폴더명 또는 null

  // 우클릭 메뉴
  let ctx = null; // {x, y, type:"folder"|"note", target}

  // 드래그
  let dragNote = null;

  onMount(async () => {
    const idx = (await cn.storage.readJson("_index.json", null)) ?? { folders: ["기본"], notes: [] };
    folders = idx.folders ?? ["기본"];
    notes = idx.notes ?? [];
    loaded = true;
    // 탭 상태 복원
    if (tab?.state?.current) {
      const c = tab.state.current;
      if (notes.some((n) => n.folder === c.folder && n.name === c.name)) openNote(c, tab.state.viewMode);
    }
  });
  function saveIndex() { cn.storage.writeJson("_index.json", { folders, notes }); }

  const notePath = (n) => `${n.folder}/${n.name}/${n.name}.md`;

  async function openNote(n, mode = "edit") {
    current = n; viewMode = mode;
    content = (await cn.storage.readText(notePath(n))) ?? "";
    patchState(tab.id, { current: n, viewMode });
  }

  let saveTimer = null;
  function onEdit(v) {
    content = v;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (current) cn.storage.writeText(notePath(current), content); }, 400);
  }

  // --- 폴더 ---
  function startAddFolder() { addingFolder = true; newFolderName = ""; }
  function commitFolder() {
    const name = newFolderName.trim();
    if (name && !folders.includes(name)) { folders = [...folders, name]; saveIndex(); }
    addingFolder = false;
  }
  function deleteFolder(folder) {
    // 폴더와 그 안 노트 전부 삭제
    for (const n of notes.filter((n) => n.folder === folder)) cn.storage.remove(`${n.folder}/${n.name}`);
    notes = notes.filter((n) => n.folder !== folder);
    folders = folders.filter((f) => f !== folder);
    saveIndex();
    if (current && current.folder === folder) { current = null; content = ""; }
  }

  // --- 노트 ---
  function startAddNote(folder) { addingNoteIn = folder; newNoteName = ""; }
  async function commitNote() {
    const folder = addingNoteIn;
    const name = newNoteName.trim();
    addingNoteIn = null;
    if (!name) return;
    if (notes.some((n) => n.folder === folder && n.name === name)) { alert("같은 이름의 노트가 있습니다."); return; }
    const n = { folder, name };
    notes = [...notes, n]; saveIndex();
    await cn.storage.writeText(notePath(n), `# ${name}\n\n`);
    openNote(n);
  }
  function deleteNote(n) {
    cn.storage.remove(`${n.folder}/${n.name}`);
    notes = notes.filter((x) => !(x.folder === n.folder && x.name === n.name));
    saveIndex();
    if (current && current.folder === n.folder && current.name === n.name) { current = null; content = ""; }
  }

  // --- 우클릭 메뉴 ---
  function openCtx(e, type, target) { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, type, target }; }
  function closeCtx() { ctx = null; }

  // --- 드래그(노트를 다른 폴더로) ---
  function onDragStart(n) { dragNote = n; }
  function onDropFolder(folder) {
    if (!dragNote || dragNote.folder === folder) { dragNote = null; return; }
    const from = dragNote;
    // 본문 이동: 새 경로에 쓰고 옛 폴더 삭제
    cn.storage.readText(notePath(from)).then((body) => {
      const moved = { folder, name: from.name };
      cn.storage.writeText(notePath(moved), body ?? "");
      cn.storage.remove(`${from.folder}/${from.name}`);
      notes = notes.map((n) => (n.folder === from.folder && n.name === from.name ? moved : n));
      saveIndex();
      if (current && current.folder === from.folder && current.name === from.name) current = moved;
    });
    dragNote = null;
  }

  // --- 미리보기 --- (content/viewMode 변화에만 반응; html 갱신은 루프를 만들지 않음)
  async function renderPreview(src) {
    let out = renderMarkdown(src, { imageSrc: (file) => file });
    if (cn.text.available()) out = await cn.text.render(out);
    html = out;
  }
  $: if (viewMode === "preview") renderPreview(content);
  function setView(m) { viewMode = m; patchState(tab.id, { current, viewMode: m }); }

  function onPreviewClick(e) {
    const a = e.target.closest("a.wikilink");
    if (a) {
      e.preventDefault();
      const found = notes.find((n) => n.name === a.dataset.target);
      if (found) openNote(found);
      else alert(`'${a.dataset.target}' 노트를 찾을 수 없습니다.`);
    }
  }

  $: byFolder = (() => { const m = {}; for (const f of folders) m[f] = []; for (const n of notes) (m[n.folder] ||= []).push(n); return m; })();
</script>

<svelte:window on:click={closeCtx} />

<div class="note editable">
  <aside class="tree">
    <div class="thead">
      <span>노트</span>
      <div class="thead-btns">
        <button on:click={startAddFolder} title="새 폴더">📁+</button>
      </div>
    </div>

    {#if addingFolder}
      <input class="inline-input" bind:value={newFolderName} placeholder="폴더 이름"
        on:keydown={(e) => e.key === "Enter" && commitFolder()} on:blur={commitFolder} autofocus />
    {/if}

    {#if loaded}
      {#each folders as folder (folder)}
        <div class="folder" on:contextmenu={(e) => openCtx(e, "folder", folder)}
             on:dragover|preventDefault on:drop={() => onDropFolder(folder)}>
          <span class="fname">{folder}</span>
          <button class="addnote" on:click={() => startAddNote(folder)} title="이 폴더에 새 노트">+</button>
        </div>
        {#if addingNoteIn === folder}
          <input class="inline-input indented" bind:value={newNoteName} placeholder="노트 이름"
            on:keydown={(e) => e.key === "Enter" && commitNote()} on:blur={commitNote} autofocus />
        {/if}
        {#each byFolder[folder] as n (n.folder + "/" + n.name)}
          <div class="leaf" class:on={current && current.folder === n.folder && current.name === n.name}
               draggable="true" on:dragstart={() => onDragStart(n)}
               on:contextmenu={(e) => openCtx(e, "note", n)}>
            <button class="leaf-name" on:click={() => openNote(n)}>{n.name}</button>
          </div>
        {/each}
      {/each}
    {/if}
  </aside>

  <div class="pane">
    {#if current}
      <div class="bar">
        <span class="path">{current.folder} / {current.name}</span>
        <div class="toggle">
          <button class:on={viewMode === "edit"} on:click={() => setView("edit")}>편집</button>
          <button class:on={viewMode === "preview"} on:click={() => setView("preview")}>미리보기</button>
        </div>
      </div>
      {#if viewMode === "edit"}
        <textarea class="editor" value={content} on:input={(e) => onEdit(e.target.value)}
          placeholder="# 제목&#10;마크다운으로 작성. [[다른노트]] 링크, $수식$ 등."></textarea>
      {:else}
        <div class="preview" on:click={onPreviewClick}>{@html html}</div>
      {/if}
    {:else}
      <div class="empty">노트를 선택하거나 새로 만드세요.</div>
    {/if}
  </div>
</div>

<!-- 우클릭 메뉴 -->
{#if ctx}
  <div class="ctxmenu" style="left:{ctx.x}px; top:{ctx.y}px">
    {#if ctx.type === "folder"}
      <button on:click={() => { startAddNote(ctx.target); closeCtx(); }}>새 노트</button>
      <button class="danger" on:click={() => { deleteFolder(ctx.target); closeCtx(); }}>폴더 삭제</button>
    {:else}
      <button class="danger" on:click={() => { deleteNote(ctx.target); closeCtx(); }}>노트 삭제</button>
    {/if}
  </div>
{/if}

<style>
  .note { height: 100%; display: grid; grid-template-columns: 220px 1fr; box-sizing: border-box; }
  .tree { border-right: 1px solid var(--line); padding: 14px 10px; overflow: auto; }
  .thead { display: flex; align-items: center; justify-content: space-between; font-size: 12px;
    color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
  .thead-btns button { border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; font-size: 12px; }
  .inline-input { width: 100%; background: var(--surface); color: var(--text); border: 1px solid var(--accent);
    border-radius: 6px; padding: 5px 8px; margin-bottom: 4px; font-family: var(--font-ui); }
  .inline-input.indented { width: calc(100% - 14px); margin-left: 14px; }
  .folder { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); margin: 10px 0 4px; padding: 3px 4px; border-radius: 6px; }
  .folder:hover { background: var(--surface-2); }
  .fname { flex: 1; }
  .addnote { border: none; color: var(--text-dim); font-size: 14px; padding: 0 6px; }
  .addnote:hover { color: var(--accent); }
  .leaf { display: flex; align-items: center; border-radius: 6px; margin-left: 8px; }
  .leaf.on { background: var(--surface-2); }
  .leaf-name { flex: 1; text-align: left; border: none; padding: 6px 8px; color: var(--text); cursor: pointer; }
  .leaf.on .leaf-name { color: var(--accent); }

  .pane { display: flex; flex-direction: column; min-width: 0; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
  .path { color: var(--text-dim); font-size: 13px; }
  .toggle { margin-left: auto; display: flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .toggle button { border: none; border-radius: 0; padding: 4px 12px; }
  .toggle button.on { background: var(--accent); color: var(--bg); }
  .editor { flex: 1; background: var(--surface); color: var(--text); border: none; outline: none; resize: none;
    padding: 24px 28px; font-family: var(--font-mono); font-size: 14px; line-height: 1.7; }
  .preview { flex: 1; overflow: auto; padding: 24px 32px; line-height: 1.7; max-width: 760px; }
  .preview :global(h1) { font-size: 24px; } .preview :global(h2) { font-size: 20px; }
  .preview :global(blockquote) { border-left: 3px solid var(--accent); margin: 12px 0; padding: 4px 14px; color: var(--text-dim); }
  .preview :global(.code) { background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow: auto; }
  .preview :global(.wikilink) { color: var(--accent); cursor: pointer; text-decoration: underline; }
  .preview :global(.url) { color: var(--accent-2); }
  .preview :global(img) { max-width: 100%; border-radius: 6px; }
  .preview :global(.smiles img) { background: #fff; border-radius: 6px; padding: 4px; }
  .preview :global(.footnotes) { font-size: 13px; color: var(--text-dim); }
  .empty { display: grid; place-items: center; height: 100%; color: var(--text-dim); }

  .ctxmenu { position: fixed; z-index: 100; background: var(--surface-2); border: 1px solid var(--line);
    border-radius: 8px; padding: 4px; display: flex; flex-direction: column; min-width: 120px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .ctxmenu button { border: none; text-align: left; padding: 8px 12px; border-radius: 5px; color: var(--text); }
  .ctxmenu button:hover { background: var(--surface); }
  .ctxmenu .danger { color: var(--danger); }
</style>
