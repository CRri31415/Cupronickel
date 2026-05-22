<script>
  // ───────────────────────────────────────────────────────────────────────
  // 노트 모듈 — 마크다운 노트를 폴더로 정리.
  //
  // 저장 구조(기획서): 노트 하나당 전용 폴더. 예) 과학/전자/전자.md
  // 여기서는 단순화를 위해 한 단계 폴더로 관리한다: note/<folder>/<name>/<name>.md
  // (트리 인덱스는 note/_index.json 에 보관: [{folder, name}])
  //
  // 편집/미리보기 토글. 미리보기는 노트 전용 마크다운 렌더러를 쓰고,
  // 텍스트 범용 확장이 설치돼 있으면 그 위에 TeX/SMILES도 적용한다.
  // 문서간 링크([[..]]) 클릭은 같은 note 폴더 내 다른 노트로만 이동(폴더 밖 금지).
  // ───────────────────────────────────────────────────────────────────────
  import { onMount } from "svelte";
  import { renderMarkdown } from "./markdown.js";

  export let tab;
  export let cn;

  let index = [];          // [{folder, name}]
  let loaded = false;
  let current = null;       // {folder, name}
  let content = "";
  let view = "edit";        // "edit" | "preview"
  let html = "";

  onMount(load);
  async function load() {
    index = (await cn.storage.readJson("_index.json", [])) ?? [];
    loaded = true;
  }
  function saveIndex() { cn.storage.writeJson("_index.json", index); }

  // 노트 본문 경로
  const notePath = (n) => `${n.folder}/${n.name}/${n.name}.md`;

  async function openNote(n) {
    current = n; view = "edit";
    content = (await cn.storage.readText(notePath(n))) ?? "";
  }

  let saveTimer = null;
  function onEdit(v) {
    content = v;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (current) cn.storage.writeText(notePath(current), content); }, 400);
  }

  async function newNote() {
    const folder = prompt("폴더 이름:", "기본");
    if (!folder) return;
    const name = prompt("노트 이름:");
    if (!name) return;
    if (index.some((n) => n.folder === folder && n.name === name)) { alert("같은 이름의 노트가 있습니다."); return; }
    const n = { folder: folder.trim(), name: name.trim() };
    index = [...index, n];
    saveIndex();
    await cn.storage.writeText(notePath(n), `# ${n.name}\n\n`);
    openNote(n);
  }

  async function deleteNote(n) {
    // 노트 전용 폴더를 통째로 삭제(그 안의 이미지도 함께 정리됨)
    await cn.storage.remove(`${n.folder}/${n.name}`);
    index = index.filter((x) => !(x.folder === n.folder && x.name === n.name));
    saveIndex();
    if (current && current.folder === n.folder && current.name === n.name) { current = null; content = ""; }
  }

  // 미리보기 렌더
  async function renderPreview() {
    const ctx = {
      // 이미지: 같은 노트 폴더 기준. asset 경로 변환은 추후 확장(여기선 파일명 표시).
      imageSrc: (file) => file,
    };
    let out = renderMarkdown(content, ctx);
    // 텍스트 범용 확장이 있으면 TeX/SMILES까지 적용
    if (cn.text.available()) out = await cn.text.render(out);
    html = out;
  }
  $: if (view === "preview") renderPreview();

  // 문서간 링크 클릭 처리(이벤트 위임)
  function onPreviewClick(e) {
    const a = e.target.closest("a.wikilink");
    if (a) {
      e.preventDefault();
      const target = a.dataset.target;
      // note 폴더 안의 동일 이름 노트로만 이동(폴더 밖 접근 금지)
      const found = index.find((n) => n.name === target);
      if (found) openNote(found);
      else alert(`'${target}' 노트를 찾을 수 없습니다.`);
    }
  }

  // 폴더별 그룹화
  $: byFolder = (() => {
    const m = {};
    for (const n of index) (m[n.folder] ||= []).push(n);
    return m;
  })();
</script>

<div class="note editable">
  <!-- 트리 -->
  <aside class="tree">
    <div class="thead">노트
      <button class="new" on:click={newNote}>+ 새 노트</button>
    </div>
    {#if loaded}
      {#each Object.entries(byFolder) as [folder, notes]}
        <div class="folder">{folder}</div>
        {#each notes as n (n.folder + "/" + n.name)}
          <div class="leaf" class:on={current && current.folder === n.folder && current.name === n.name}>
            <button class="leaf-name" on:click={() => openNote(n)}>{n.name}</button>
            <button class="leaf-del" on:click={() => deleteNote(n)} aria-label="삭제">×</button>
          </div>
        {/each}
      {/each}
    {/if}
  </aside>

  <!-- 편집/미리보기 -->
  <div class="pane">
    {#if current}
      <div class="bar">
        <span class="path">{current.folder} / {current.name}</span>
        <div class="toggle">
          <button class:on={view === "edit"} on:click={() => (view = "edit")}>편집</button>
          <button class:on={view === "preview"} on:click={() => (view = "preview")}>미리보기</button>
        </div>
      </div>
      {#if view === "edit"}
        <textarea class="editor" value={content} on:input={(e) => onEdit(e.target.value)}
          placeholder="# 제목&#10;마크다운으로 작성하세요. [[다른노트]]로 링크, $수식$ 등."></textarea>
      {:else}
        <div class="preview" on:click={onPreviewClick}>{@html html}</div>
      {/if}
    {:else}
      <div class="empty">노트를 선택하거나 "+ 새 노트"로 만드세요.</div>
    {/if}
  </div>
</div>

<style>
  .note { height: 100%; display: grid; grid-template-columns: 220px 1fr; box-sizing: border-box; }
  .tree { border-right: 1px solid var(--line); padding: 14px 10px; overflow: auto; }
  .thead { display: flex; align-items: center; justify-content: space-between; font-size: 12px;
    color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
  .new { border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 2px 8px; font-size: 11px; }
  .folder { font-size: 12px; color: var(--text-dim); margin: 10px 0 4px; }
  .leaf { display: flex; align-items: center; border-radius: 6px; }
  .leaf.on { background: var(--surface-2); }
  .leaf-name { flex: 1; text-align: left; border: none; padding: 6px 8px; color: var(--text); }
  .leaf.on .leaf-name { color: var(--accent); }
  .leaf-del { border: none; color: var(--text-dim); padding: 4px 8px; }
  .leaf-del:hover { color: var(--danger); }

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
  .preview :global(.footnotes) { font-size: 13px; color: var(--text-dim); }
  .empty { display: grid; place-items: center; height: 100%; color: var(--text-dim); }
</style>
