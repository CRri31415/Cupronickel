<script>
  // 그래프 모듈 진입 — 보드 목록. 여러 보드를 만들고 각각 편집기에서 연다.
  // 보드는 graph/<id>.json 파일로 저장, 이름은 graph/_boards.json 에 매핑.
  import { onMount } from "svelte";
  import GraphBoard from "./GraphBoard.svelte";

  export let tab;
  export let cn;

  let boards = [];
  let loaded = false;
  let openBoardId = null;

  onMount(load);
  async function load() {
    const items = await cn.storage.list();
    const files = items.filter((i) => !i.is_dir && i.name.endsWith(".json") && i.name !== "_boards.json");
    const meta = (await cn.storage.readJson("_boards.json", {})) ?? {};
    boards = files.map((f) => {
      const id = f.name.replace(/\.json$/, "");
      return { id, name: meta[id] ?? id };
    });
    loaded = true;
  }

  let _b = 0;
  const bid = () => `board${Date.now()}_${_b++}`;

  async function createBoard() {
    const id = bid();
    const meta = (await cn.storage.readJson("_boards.json", {})) ?? {};
    meta[id] = "새 보드";
    await cn.storage.writeJson("_boards.json", meta);
    await cn.storage.writeJson(`${id}.json`, { nodes: [], edges: [] });
    await load();
    openBoardId = id;
  }
  async function renameBoard(id, name) {
    const meta = (await cn.storage.readJson("_boards.json", {})) ?? {};
    meta[id] = name;
    await cn.storage.writeJson("_boards.json", meta);
    boards = boards.map((b) => (b.id === id ? { ...b, name } : b));
  }
  async function deleteBoard(id) {
    await cn.storage.remove(`${id}.json`);
    const meta = (await cn.storage.readJson("_boards.json", {})) ?? {};
    delete meta[id];
    await cn.storage.writeJson("_boards.json", meta);
    await load();
  }
</script>

{#if openBoardId}
  <GraphBoard {cn} boardId={openBoardId} title={boards.find((b) => b.id === openBoardId)?.name}
    on:back={() => { openBoardId = null; load(); }} />
{:else}
  <div class="boards editable">
    <header>
      <h2>그래프 보드</h2>
      <button class="add" on:click={createBoard}>+ 새 보드</button>
    </header>
    {#if loaded}
      {#if boards.length === 0}
        <p class="empty">보드가 없습니다. "+ 새 보드"로 만드세요.</p>
      {:else}
        <div class="list">
          {#each boards as b (b.id)}
            <div class="board-row">
              <input class="name" value={b.name} on:input={(e) => renameBoard(b.id, e.target.value)} />
              <button on:click={() => (openBoardId = b.id)}>열기</button>
              <button class="del" on:click={() => deleteBoard(b.id)} aria-label="삭제">×</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .boards { padding: 24px 28px; }
  header { display: flex; align-items: center; gap: 12px; }
  h2 { margin: 0; font-weight: 500; }
  .add { border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 12px; }
  .empty { color: var(--text-dim); margin-top: 20px; }
  .list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .board-row { display: flex; gap: 8px; align-items: center; }
  .name { flex: 1; background: var(--surface-2); color: var(--text); border: 1px solid var(--line);
          border-radius: 6px; padding: 6px 10px; font-family: var(--font-ui); }
  .board-row button { border: 1px solid var(--line); border-radius: 6px; padding: 6px 14px; }
  .del { width: 36px; color: var(--text-dim); }
  .del:hover { color: var(--danger); border-color: var(--danger); }
</style>
