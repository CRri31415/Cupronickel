<script>
  // 메모 모듈 — 포스트잇 생성/보관 + 폴더 분류. 한 장당 280자.
  // 메인화면에 최대 16개 부착(좌표 저장 → 메인에서 드래그 이동) 또는 메모서랍 보관.
  // 데이터는 memo/notes.json.
  import { onMount } from "svelte";

  export let tab;
  export let cn;

  const MAX_LEN = 280;
  const MAX_PINNED = 16;

  let notes = []; // { id, text, pinned, folder, x, y }
  let loaded = false;
  let activeFolder = "전체";

  onMount(load);
  async function load() {
    notes = (await cn.storage.readJson("notes.json", [])) ?? [];
    for (const n of notes) n.folder ??= "기본";
    loaded = true;
  }
  async function save() { await cn.storage.writeJson("notes.json", notes); }

  function add() {
    const folder = activeFolder === "전체" ? "기본" : activeFolder;
    notes = [...notes, { id: Date.now(), text: "", pinned: false, folder, x: 40, y: 40 }];
    save();
  }
  function edit(id, text) { notes = notes.map((n) => (n.id === id ? { ...n, text: text.slice(0, MAX_LEN) } : n)); save(); }
  function setFolder(id, folder) { notes = notes.map((n) => (n.id === id ? { ...n, folder } : n)); save(); }
  function remove(id) { notes = notes.filter((n) => n.id !== id); save(); }
  function togglePin(id) {
    const pinnedCount = notes.filter((n) => n.pinned).length;
    notes = notes.map((n) => {
      if (n.id !== id) return n;
      if (!n.pinned && pinnedCount >= MAX_PINNED) return n;
      // 부착 시 초기 좌표 부여(겹치지 않게 약간씩 어긋나게)
      return { ...n, pinned: !n.pinned, x: n.x ?? 40 + (pinnedCount % 4) * 30, y: n.y ?? 40 + Math.floor(pinnedCount / 4) * 30 };
    });
    save();
  }
  function addFolder() { const name = prompt("새 폴더 이름:"); if (name && name.trim()) activeFolder = name.trim(); }

  $: folders = ["전체", ...new Set(notes.map((n) => n.folder))];
  $: visible = notes.filter((n) => activeFolder === "전체" || n.folder === activeFolder);
  $: pinned = visible.filter((n) => n.pinned);
  $: drawer = visible.filter((n) => !n.pinned);
</script>

<div class="memo editable">
  <aside class="folders">
    <div class="fhead">폴더</div>
    {#each folders as f}
      <button class="folder" class:on={activeFolder === f} on:click={() => (activeFolder = f)}>{f}</button>
    {/each}
    <button class="new-folder" on:click={addFolder}>+ 폴더</button>
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
                {#each folders.filter((f) => f !== "전체") as f}<option value={f}>{f}</option>{/each}
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

<style>
  .memo { height: 100%; display: grid; grid-template-columns: 160px 1fr; box-sizing: border-box; }
  .folders { border-right: 1px solid var(--line); padding: 16px 10px; display: flex; flex-direction: column; gap: 4px; overflow: auto; }
  .fhead { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; padding: 0 6px 6px; }
  .folder { border: none; border-radius: 6px; padding: 7px 8px; text-align: left; }
  .folder:hover { background: var(--surface-2); }
  .folder.on { background: var(--surface-2); color: var(--accent); }
  .new-folder { margin-top: 8px; border: 1px dashed var(--line); border-radius: 6px; padding: 6px; color: var(--text-dim); }

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
</style>
