<script>
  // 메모 모듈 — 포스트잇 + 폴더 분류(빈 폴더도 인덱스로 보존).
  // 메인화면에 최대 16개 부착(좌표 저장 → 메인에서 드래그) 또는 메모서랍 보관.
  // 데이터: memo/notes.json (메모들), memo/_folders.json (폴더 목록).
  // 폴더 생성은 인라인 입력, 폴더 삭제는 우클릭 메뉴.
  import { onMount } from "svelte";
  import { patchState } from "../../core/tabs.js";

  export let tab;
  export let cn;

  const MAX_LEN = 280;
  const MAX_PINNED = 16;

  let notes = [];          // { id, text, pinned, folder, x, y }
  let folders = ["기본"];
  let loaded = false;
  let activeFolder = "전체";

  let addingFolder = false, newFolderName = "";
  let ctx = null; // 우클릭 메뉴 {x,y,folder}

  onMount(async () => {
    notes = (await cn.storage.readJson("notes.json", [])) ?? [];
    for (const n of notes) n.folder ??= "기본";
    folders = (await cn.storage.readJson("_folders.json", null)) ?? ["기본"];
    // 메모에 있는 폴더도 합쳐 보존
    for (const n of notes) if (!folders.includes(n.folder)) folders.push(n.folder);
    loaded = true;
    if (tab?.state?.activeFolder) activeFolder = tab.state.activeFolder;
  });
  function saveNotes() { cn.storage.writeJson("notes.json", notes); }
  function saveFolders() { cn.storage.writeJson("_folders.json", folders); }
  function selectFolder(f) { activeFolder = f; patchState(tab.id, { activeFolder: f }); }

  function add() {
    const folder = activeFolder === "전체" ? (folders[0] ?? "기본") : activeFolder;
    notes = [...notes, { id: Date.now(), text: "", pinned: false, folder, x: 40, y: 40 }];
    saveNotes();
  }
  function edit(id, text) { notes = notes.map((n) => (n.id === id ? { ...n, text: text.slice(0, MAX_LEN) } : n)); saveNotes(); }
  function setFolder(id, folder) { notes = notes.map((n) => (n.id === id ? { ...n, folder } : n)); saveNotes(); }
  function remove(id) { notes = notes.filter((n) => n.id !== id); saveNotes(); }
  function togglePin(id) {
    const pinnedCount = notes.filter((n) => n.pinned).length;
    notes = notes.map((n) => {
      if (n.id !== id) return n;
      if (!n.pinned && pinnedCount >= MAX_PINNED) return n;
      return { ...n, pinned: !n.pinned, x: n.x ?? 40 + (pinnedCount % 4) * 30, y: n.y ?? 40 + Math.floor(pinnedCount / 4) * 30 };
    });
    saveNotes();
  }

  function startAddFolder() { addingFolder = true; newFolderName = ""; }
  function commitFolder() {
    const name = newFolderName.trim();
    if (name && !folders.includes(name)) { folders = [...folders, name]; saveFolders(); }
    addingFolder = false;
  }
  function deleteFolder(f) {
    notes = notes.filter((n) => n.folder !== f);
    folders = folders.filter((x) => x !== f);
    saveNotes(); saveFolders();
    if (activeFolder === f) selectFolder("전체");
  }
  function openCtx(e, folder) { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, folder }; }
  function closeCtx() { ctx = null; }

  $: allFolders = ["전체", ...folders];
  $: visible = notes.filter((n) => activeFolder === "전체" || n.folder === activeFolder);
  $: pinned = visible.filter((n) => n.pinned);
  $: drawer = visible.filter((n) => !n.pinned);
</script>

<svelte:window on:click={closeCtx} />

<div class="memo editable">
  <aside class="folders">
    <div class="fhead"><span>폴더</span><button class="addf" on:click={startAddFolder} title="새 폴더">+</button></div>
    {#if addingFolder}
      <input class="inline-input" bind:value={newFolderName} placeholder="폴더 이름"
        on:keydown={(e) => e.key === "Enter" && commitFolder()} on:blur={commitFolder} autofocus />
    {/if}
    {#each allFolders as f (f)}
      <button class="folder" class:on={activeFolder === f} on:click={() => selectFolder(f)}
        on:contextmenu={(e) => f !== "전체" && openCtx(e, f)}>{f}</button>
    {/each}
  </aside>

  <div class="pane">
    <header>
      <h2>{activeFolder}</h2>
      <button class="add" on:click={add}>+ 새 포스트잇</button>
      <span class="count">메인 부착 {notes.filter((n) => n.pinned).length}/{MAX_PINNED}</span>
    </header>

    {#if loaded}
      <h3>메모서랍</h3>
      <div class="grid">
        {#each drawer as n (n.id)}
          <div class="postit">
            <textarea maxlength={MAX_LEN} value={n.text} on:input={(e) => edit(n.id, e.target.value)} placeholder="280자 이내"></textarea>
            <footer>
              <span class="len">{n.text.length}/{MAX_LEN}</span>
              <select value={n.folder} on:change={(e) => setFolder(n.id, e.target.value)}>
                {#each folders as f}<option value={f}>{f}</option>{/each}
              </select>
              <button on:click={() => togglePin(n.id)}>부착</button>
              <button on:click={() => remove(n.id)}>삭제</button>
            </footer>
          </div>
        {/each}
      </div>

      {#if pinned.length}
        <h3>메인화면 부착됨</h3>
        <div class="grid">
          {#each pinned as n (n.id)}
            <div class="postit on-main">
              <textarea maxlength={MAX_LEN} value={n.text} on:input={(e) => edit(n.id, e.target.value)}></textarea>
              <footer>
                <span class="len">{n.text.length}/{MAX_LEN}</span>
                <button on:click={() => togglePin(n.id)}>서랍으로</button>
                <button on:click={() => remove(n.id)}>삭제</button>
              </footer>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if ctx}
  <div class="ctxmenu" style="left:{ctx.x}px; top:{ctx.y}px">
    <button class="danger" on:click={() => { deleteFolder(ctx.folder); closeCtx(); }}>폴더 삭제</button>
  </div>
{/if}

<style>
  .memo { height: 100%; display: grid; grid-template-columns: 160px 1fr; box-sizing: border-box; }
  .folders { border-right: 1px solid var(--line); padding: 16px 10px; display: flex; flex-direction: column; gap: 4px; overflow: auto; }
  .fhead { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 1px; padding: 0 6px 6px; }
  .addf { border: 1px solid var(--line); border-radius: 6px; padding: 0 8px; font-size: 14px; }
  .inline-input { background: var(--surface); color: var(--text); border: 1px solid var(--accent); border-radius: 6px; padding: 5px 8px; font-family: var(--font-ui); }
  .folder { border: none; border-radius: 6px; padding: 7px 8px; text-align: left; }
  .folder:hover { background: var(--surface-2); }
  .folder.on { background: var(--surface-2); color: var(--accent); }

  .pane { padding: 24px 28px; overflow: auto; }
  header { display: flex; align-items: center; gap: 14px; }
  h2 { margin: 0; font-weight: 500; }
  h3 { color: var(--text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 22px 0 8px; }
  .add { border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 12px; }
  .count { margin-left: auto; color: var(--text-dim); font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .postit { background: color-mix(in srgb, var(--accent) 12%, var(--surface-2)); border: 1px solid var(--line);
    border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .postit.on-main { box-shadow: inset 3px 0 0 var(--accent-2); }
  textarea { resize: vertical; min-height: 90px; background: transparent; border: none; outline: none;
    color: var(--text); font-family: var(--font-ui); font-size: 13px; line-height: 1.5; }
  footer { display: flex; align-items: center; gap: 6px; font-size: 11px; flex-wrap: wrap; }
  .len { margin-right: auto; color: var(--text-dim); }
  footer select { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 4px; font-size: 11px; }
  footer button { border: 1px solid var(--line); border-radius: 4px; padding: 2px 6px; color: var(--text-dim); }
  footer button:hover { color: var(--text); }
  .ctxmenu { position: fixed; z-index: 100; background: var(--surface-2); border: 1px solid var(--line);
    border-radius: 8px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .ctxmenu button { border: none; text-align: left; padding: 8px 12px; border-radius: 5px; color: var(--text); }
  .ctxmenu .danger { color: var(--danger); }
</style>
