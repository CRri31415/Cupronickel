<script>
  // ───────────────────────────────────────────────────────────────────────
  // 노트 모듈 — 실제 폴더 구조 기반.
  //
  // 폴더는 디스크에 실제로 생성한다(빈 폴더도 .keep 없이 mkdir로 보존).
  // 구조: note/<folder>/ 아래에 노트별 전용 폴더 <name>/<name>.md
  // 폴더 목록 = note/ 의 하위 디렉토리, 노트 목록 = note/<folder>/ 의 하위 디렉토리.
  //
  // 화면 상태(선택 노트/뷰)는 tab.state로 보존. 폴더/노트 생성은 인라인 입력,
  // 이름 변경·삭제는 우클릭 메뉴. 노트는 폴더 간 드래그 이동.
  // ───────────────────────────────────────────────────────────────────────
  import { onMount } from "svelte";
  import { renderMarkdown } from "./markdown.js";
  import { patchState } from "../../core/tabs.js";

  export let tab;
  export let cn;

  let tree = {};            // { folderName: [noteName, ...] }
  let loaded = false;
  let current = null;        // {folder, name}
  let content = "";
  let viewMode = "edit";
  let html = "";

  let addingFolder = false, newFolderName = "";
  let addingNoteIn = null,  newNoteName = "";
  let renaming = null;       // {type, folder, name}
  let renameValue = "";
  let ctx = null;
  let dragNote = null;

  onMount(async () => {
    // 과거 버전 잔재로 생길 수 있는 'null' 폴더 정리
    try { await cn.storage.remove("null"); } catch {}
    await refreshTree();
    loaded = true;
    if (tab?.state?.current) {
      const c = tab.state.current;
      if (tree[c.folder]?.includes(c.name)) openNote(c, tab.state.viewMode);
    }
  });

  // 디스크에서 폴더/노트 구조를 읽어온다.
  async function refreshTree() {
    const t = {};
    const folders = (await cn.storage.list()).filter((i) => i.is_dir && i.name && i.name !== "null");
    for (const f of folders) {
      const notes = (await cn.storage.list(f.name)).filter((i) => i.is_dir && i.name && i.name !== "null").map((i) => i.name);
      t[f.name] = notes;
    }
    tree = t;
  }

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

  // 폴더(실제 디렉토리 생성)
  function startAddFolder() { addingFolder = true; newFolderName = ""; }
  async function commitFolder() {
    const name = newFolderName.trim(); addingFolder = false;
    if (!name || tree[name]) return;
    await cn.storage.mkdir(name);     // 실제 폴더 생성
    await refreshTree();
  }
  async function deleteFolder(folder) {
    await cn.storage.remove(folder);
    await refreshTree();
    if (current?.folder === folder) { current = null; content = ""; }
  }

  // 노트(전용 폴더 + md 생성)
  function startAddNote(folder) { addingNoteIn = folder; newNoteName = ""; }
  async function commitNote() {
    const folder = addingNoteIn; const name = newNoteName.trim(); addingNoteIn = null;
    if (!name) return;
    if (tree[folder]?.includes(name)) { alert("같은 이름의 노트가 있습니다."); return; }
    await cn.storage.writeText(`${folder}/${name}/${name}.md`, `# ${name}\n\n`);
    await refreshTree();
    openNote({ folder, name });
  }
  async function deleteNote(n) {
    await cn.storage.remove(`${n.folder}/${n.name}`);
    await refreshTree();
    if (current?.folder === n.folder && current?.name === n.name) { current = null; content = ""; }
  }

  // 이름 변경(우클릭 → 변경): 폴더/노트 모두 디렉토리 이동으로 처리
  function startRename(type, folder, name) {
    renaming = { type, folder, name }; renameValue = type === "folder" ? folder : name;
    ctx = null;
  }
  async function commitRename() {
    const r = renaming; renaming = null;
    const v = renameValue.trim();
    if (!v) return;
    if (r.type === "folder") {
      if (tree[v]) { alert("같은 폴더가 있습니다."); return; }
      await cn.storage.mkdir(v);
      for (const note of tree[r.folder]) {
        const body = await cn.storage.readText(`${r.folder}/${note}/${note}.md`);
        await cn.storage.writeText(`${v}/${note}/${note}.md`, body ?? "");
      }
      await cn.storage.remove(r.folder);
      if (current?.folder === r.folder) current = { ...current, folder: v };
    } else {
      if (tree[r.folder]?.includes(v)) { alert("같은 노트가 있습니다."); return; }
      const body = await cn.storage.readText(`${r.folder}/${r.name}/${r.name}.md`);
      await cn.storage.writeText(`${r.folder}/${v}/${v}.md`, body ?? "");
      await cn.storage.remove(`${r.folder}/${r.name}`);
      if (current?.folder === r.folder && current?.name === r.name) current = { folder: r.folder, name: v };
    }
    await refreshTree();
  }

  // 우클릭 메뉴
  function openCtx(e, type, folder, name) { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, type, folder, name }; }
  function closeCtx() { ctx = null; }

  // 드래그(노트 → 다른 폴더)
  function onDragStart(n) { dragNote = n; }
  async function onDropFolder(folder) {
    if (!dragNote || dragNote.folder === folder) { dragNote = null; return; }
    const from = dragNote; dragNote = null;
    const body = await cn.storage.readText(`${from.folder}/${from.name}/${from.name}.md`);
    await cn.storage.writeText(`${folder}/${from.name}/${from.name}.md`, body ?? "");
    await cn.storage.remove(`${from.folder}/${from.name}`);
    await refreshTree();
    if (current?.folder === from.folder && current?.name === from.name) current = { folder, name: from.name };
  }

  // 미리보기
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
      for (const [folder, notes] of Object.entries(tree))
        if (notes.includes(a.dataset.target)) { openNote({ folder, name: a.dataset.target }); return; }
      alert(`'${a.dataset.target}' 노트를 찾을 수 없습니다.`);
    }
  }
</script>

<svelte:window on:click={closeCtx} />

<div class="note editable">
  <aside class="tree">
    <div class="thead"><span>노트</span><button on:click={startAddFolder} title="새 폴더">📁+</button></div>
    {#if addingFolder}
      <input class="inline-input" bind:value={newFolderName} placeholder="폴더 이름"
        on:keydown={(e) => e.key === "Enter" && commitFolder()} on:blur={commitFolder} autofocus />
    {/if}
    {#if loaded}
      {#each Object.entries(tree) as [folder, notes] (folder)}
        <div class="folder" on:contextmenu={(e) => openCtx(e, "folder", folder)}
             on:dragover|preventDefault on:drop={() => onDropFolder(folder)}>
          {#if renaming?.type === "folder" && renaming.folder === folder}
            <input class="rename" bind:value={renameValue} on:keydown={(e) => e.key === "Enter" && commitRename()} on:blur={commitRename} autofocus />
          {:else}
            <span class="fname">{folder}</span>
            <button class="addnote" on:click={() => startAddNote(folder)} title="새 노트">+</button>
          {/if}
        </div>
        {#if addingNoteIn === folder}
          <input class="inline-input indented" bind:value={newNoteName} placeholder="노트 이름"
            on:keydown={(e) => e.key === "Enter" && commitNote()} on:blur={commitNote} autofocus />
        {/if}
        {#each notes as name (folder + "/" + name)}
          <div class="leaf" class:on={current?.folder === folder && current?.name === name}
               draggable="true" on:dragstart={() => onDragStart({ folder, name })}
               on:contextmenu={(e) => openCtx(e, "note", folder, name)}>
            {#if renaming?.type === "note" && renaming.folder === folder && renaming.name === name}
              <input class="rename" bind:value={renameValue} on:keydown={(e) => e.key === "Enter" && commitRename()} on:blur={commitRename} autofocus />
            {:else}
              <button class="leaf-name" on:click={() => openNote({ folder, name })}>{name}</button>
            {/if}
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

{#if ctx}
  <div class="ctxmenu" style="left:{ctx.x}px; top:{ctx.y}px">
    {#if ctx.type === "folder"}
      <button on:click={() => { startAddNote(ctx.folder); closeCtx(); }}>새 노트</button>
      <button on:click={() => startRename("folder", ctx.folder)}>이름 변경</button>
      <button class="danger" on:click={() => { deleteFolder(ctx.folder); closeCtx(); }}>폴더 삭제</button>
    {:else}
      <button on:click={() => startRename("note", ctx.folder, ctx.name)}>이름 변경</button>
      <button class="danger" on:click={() => { deleteNote({ folder: ctx.folder, name: ctx.name }); closeCtx(); }}>노트 삭제</button>
    {/if}
  </div>
{/if}

<style>
  .note { height: 100%; display: grid; grid-template-columns: 220px 1fr; box-sizing: border-box; }
  .tree { border-right: 1px solid var(--line); padding: 14px 10px; overflow: auto; }
  .thead { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
  .thead button { border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; font-size: 12px; }
  .inline-input, .rename { width: 100%; background: var(--surface); color: var(--text); border: 1px solid var(--accent);
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
  .preview :global(.smiles svg) { background: #fff; border-radius: 6px; max-width: 100%; }
  .preview :global(.footnotes) { font-size: 13px; color: var(--text-dim); }
  .empty { display: grid; place-items: center; height: 100%; color: var(--text-dim); }
  .ctxmenu { position: fixed; z-index: 100; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px;
    padding: 4px; display: flex; flex-direction: column; min-width: 120px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .ctxmenu button { border: none; text-align: left; padding: 8px 12px; border-radius: 5px; color: var(--text); }
  .ctxmenu button:hover { background: var(--surface); }
  .ctxmenu .danger { color: var(--danger); }
</style>
