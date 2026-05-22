<script>
  // 메모 모듈 — 포스트잇 생성/보관. 한 장당 280자 제한.
  // 메인화면에 최대 16개 부착하거나 "메모서랍"에 보관한다.
  // 데이터는 memo/notes.json 에 저장한다.
  import { onMount } from "svelte";

  export let tab; // 탭 메타(영속화에 사용 가능)
  export let cn;  // 코어 안정 API (Workspace가 주입)

  const MAX_LEN = 280;   // 포스트잇 글자 수 제한
  const MAX_PINNED = 16; // 메인화면 부착 최대 개수

  let notes = []; // { id, text, pinned }
  let loaded = false;

  onMount(load);

  async function load() {
    notes = (await cn.storage.readJson("notes.json", [])) ?? [];
    loaded = true;
  }

  async function save() {
    await cn.storage.writeJson("notes.json", notes);
  }

  function add() {
    notes = [...notes, { id: Date.now(), text: "", pinned: false }];
    save();
  }

  function edit(id, text) {
    notes = notes.map((n) => (n.id === id ? { ...n, text: text.slice(0, MAX_LEN) } : n));
    save();
  }

  function remove(id) {
    notes = notes.filter((n) => n.id !== id);
    save();
  }

  function togglePin(id) {
    const pinnedCount = notes.filter((n) => n.pinned).length;
    notes = notes.map((n) => {
      if (n.id !== id) return n;
      if (!n.pinned && pinnedCount >= MAX_PINNED) return n; // 16개 제한
      return { ...n, pinned: !n.pinned };
    });
    save();
  }

  $: pinned = notes.filter((n) => n.pinned);
  $: drawer = notes.filter((n) => !n.pinned);
</script>

<div class="memo editable">
  <header>
    <h2>메모</h2>
    <button class="add" on:click={add}>+ 새 포스트잇</button>
    <span class="count">메인 부착 {pinned.length}/{MAX_PINNED}</span>
  </header>

  {#if loaded}
    <h3>메모서랍</h3>
    <div class="grid">
      {#each drawer as n (n.id)}
        <div class="postit">
          <textarea maxlength={MAX_LEN} value={n.text}
            on:input={(e) => edit(n.id, e.target.value)} placeholder="280자 이내"></textarea>
          <footer>
            <span class="len">{n.text.length}/{MAX_LEN}</span>
            <button on:click={() => togglePin(n.id)}>메인에 부착</button>
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
            <textarea maxlength={MAX_LEN} value={n.text}
              on:input={(e) => edit(n.id, e.target.value)}></textarea>
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

<style>
  .memo { padding: 24px 28px; }
  header { display: flex; align-items: center; gap: 14px; }
  h2 { margin: 0; font-weight: 500; }
  h3 { color: var(--text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 22px 0 8px; }
  .add { border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 12px; }
  .count { margin-left: auto; color: var(--text-dim); font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .postit {
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
    border: 1px solid var(--line); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px;
  }
  .postit.on-main { box-shadow: inset 3px 0 0 var(--accent-2); }
  textarea {
    resize: vertical; min-height: 90px; background: transparent; border: none; outline: none;
    color: var(--text); font-family: var(--font-ui); font-size: 13px; line-height: 1.5;
  }
  footer { display: flex; align-items: center; gap: 6px; font-size: 11px; }
  .len { margin-right: auto; color: var(--text-dim); }
  footer button { border: 1px solid var(--line); border-radius: 4px; padding: 2px 6px; color: var(--text-dim); }
  footer button:hover { color: var(--text); }
</style>
