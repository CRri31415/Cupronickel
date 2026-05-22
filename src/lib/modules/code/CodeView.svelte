<script>
  // ───────────────────────────────────────────────────────────────────────
  // 개발용 텍스트 에디터 모듈.
  //  - 프로젝트(폴더)별 파일 관리. 언어: C99 / Python3 / Haskell.
  //  - 빌드/실행: 사용자가 설치한 실행환경으로 명령 실행(cn.exec.run).
  //  - vi 키맵 일부: 활성화 전 ':wq를 입력해 종료할 수 있는가?' 확인 절차.
  //  - 줄번호: 하이브리드 상대(기본) / 절대(설정).
  //
  // 데이터: code/<project>/<files>. 인덱스 code/_index.json: {projects:[{name, files:[]}]}
  // ───────────────────────────────────────────────────────────────────────
  import { onMount } from "svelte";
  import { settings } from "../../core/settings.js";
  import { patchState } from "../../core/tabs.js";

  export let tab;
  export let cn;

  let projects = [];        // [{name, files:[fname]}]
  let loaded = false;
  let curProject = null, curFile = null;
  let content = "";
  let output = "";          // 빌드/실행 출력

  // vi
  let viEnabled = false;
  let viMode = "insert";    // "normal" | "insert"
  let viGate = false;       // 확인 절차 표시
  let viGateInput = "";

  // 인라인 입력
  let addingProject = false, newProjName = "";
  let addingFile = false, newFileName = "";

  // 언어별 기본 빌드/실행 명령. %f = 파일명. 사용자가 설정에서 바꿀 수 있고,
  // 실수로 망친 경우 기본값 복원 버튼을 제공한다.
  const DEFAULT_CMDS = {
    c:  "gcc %f -o out && ./out",
    py: "python %f",
    hs: "ghc --make %f && ./%e",   // %e = 확장자 제외 실행파일명
  };
  let cmds = { ...DEFAULT_CMDS };
  let showCmdSettings = false;

  function loadCmds() {
    cn.storage.readJson("_commands.json", null).then((c) => { if (c) cmds = { ...DEFAULT_CMDS, ...c }; });
  }
  function saveCmds() { cn.storage.writeJson("_commands.json", cmds); }
  function resetCmds() { cmds = { ...DEFAULT_CMDS }; saveCmds(); }

  onMount(async () => {
    const idx = (await cn.storage.readJson("_index.json", null)) ?? { projects: [] };
    projects = idx.projects ?? [];
    loaded = true;
    loadCmds();
    if (tab?.state?.curProject) {
      curProject = tab.state.curProject;
      if (tab.state.curFile) openFile(tab.state.curProject, tab.state.curFile);
    }
  });
  function saveIndex() { cn.storage.writeJson("_index.json", { projects }); }

  const filePath = (p, f) => `${p}/${f}`;

  async function openFile(p, f) {
    curProject = p; curFile = f;
    content = (await cn.storage.readText(filePath(p, f))) ?? "";
    patchState(tab.id, { curProject: p, curFile: f });
  }
  let saveTimer = null;
  function onEdit(v) {
    content = v;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (curProject && curFile) cn.storage.writeText(filePath(curProject, curFile), content); }, 400);
  }

  // 프로젝트/파일 생성
  function startAddProject() { addingProject = true; newProjName = ""; }
  async function commitProject() {
    const n = newProjName.trim();
    if (n && !projects.some((p) => p.name === n)) {
      await cn.storage.mkdir(n);  // 실제 폴더 생성
      projects = [...projects, { name: n, files: [] }]; saveIndex();
    }
    addingProject = false;
  }
  function startAddFile(p) { addingFile = p; newFileName = ""; }
  async function commitFile() {
    const p = addingFile; const f = newFileName.trim(); addingFile = false;
    if (!f) return;
    const proj = projects.find((x) => x.name === p);
    if (proj.files.includes(f)) { alert("같은 파일이 있습니다."); return; }
    proj.files = [...proj.files, f]; projects = projects; saveIndex();
    await cn.storage.writeText(filePath(p, f), "");
    openFile(p, f);
  }
  function deleteFile(p, f) {
    cn.storage.remove(filePath(p, f));
    const proj = projects.find((x) => x.name === p);
    proj.files = proj.files.filter((x) => x !== f); projects = projects; saveIndex();
    if (curProject === p && curFile === f) { curFile = null; content = ""; }
  }
  function deleteProject(p) {
    cn.storage.remove(p);
    projects = projects.filter((x) => x.name !== p); saveIndex();
    if (curProject === p) { curProject = null; curFile = null; content = ""; }
  }

  // 우클릭 메뉴
  let ctx = null;
  function openCtx(e, type, p, f) { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, type, p, f }; }
  function closeCtx() { ctx = null; }

  // 이름 변경
  let renaming = null, renameValue = "";
  function startRename(type, p, f) { renaming = { type, p, f }; renameValue = type === "project" ? p : f; ctx = null; }
  async function commitRename() {
    const r = renaming; renaming = null; const v = renameValue.trim();
    if (!v) return;
    if (r.type === "project") {
      if (projects.some((x) => x.name === v)) { alert("같은 프로젝트가 있습니다."); return; }
      const proj = projects.find((x) => x.name === r.p);
      for (const f of proj.files) {
        const body = await cn.storage.readText(filePath(r.p, f));
        await cn.storage.writeText(filePath(v, f), body ?? "");
      }
      await cn.storage.remove(r.p);
      proj.name = v; projects = projects; saveIndex();
      if (curProject === r.p) curProject = v;
    } else {
      const proj = projects.find((x) => x.name === r.p);
      if (proj.files.includes(v)) { alert("같은 파일이 있습니다."); return; }
      const body = await cn.storage.readText(filePath(r.p, r.f));
      await cn.storage.writeText(filePath(r.p, v), body ?? "");
      await cn.storage.remove(filePath(r.p, r.f));
      proj.files = proj.files.map((x) => (x === r.f ? v : x)); projects = projects; saveIndex();
      if (curProject === r.p && curFile === r.f) { curFile = v; }
    }
  }

  // 빌드/실행
  async function runFile() {
    if (!curProject || !curFile) return;
    const ext = curFile.split(".").pop();
    const langKey = ext === "c" ? "c" : ext === "py" ? "py" : ext === "hs" ? "hs" : null;
    if (!langKey) { output = "지원 언어(.c/.py/.hs)가 아닙니다."; return; }
    output = "실행 중...";
    // 명령 문자열에서 %f(파일명), %e(확장자 제외)를 치환한 뒤 셸로 실행한다.
    const base = curFile.replace(/\.[^.]+$/, "");
    const cmdStr = cmds[langKey].replace(/%f/g, curFile).replace(/%e/g, base);
    try {
      // 셸 연산자(&&, ./)를 처리하기 위해 OS 셸로 실행한다.
      const isWin = navigator.userAgent.includes("Windows");
      const prog = isWin ? "cmd" : "sh";
      const args = isWin ? ["/c", cmdStr] : ["-c", cmdStr];
      const r = await cn.exec.run(curProject, prog, args);
      output = (r.stdout || "") + (r.stderr ? "\n[stderr]\n" + r.stderr : "") + `\n[종료 코드 ${r.code}]`;
    } catch (e) { output = "실행 실패: " + e; }
  }

  // 줄번호(하이브리드 상대 / 절대)
  $: lines = content.split("\n");
  $: lineMode = $settings.editor?.lineNumbers ?? "hybrid";
  let cursorLine = 0;
  function onCursor(e) {
    const ta = e.target;
    cursorLine = ta.value.slice(0, ta.selectionStart).split("\n").length - 1;
  }
  function lineLabel(i) {
    if (lineMode === "absolute") return i + 1;
    if (i === cursorLine) return i + 1;          // 현재 줄은 절대
    return Math.abs(i - cursorLine);              // 나머지는 상대
  }

  // vi 키맵(일부)
  function enableVi() { viGate = true; viGateInput = ""; }
  function checkGate() {
    if (viGateInput.trim() === ":wq") { viEnabled = true; viMode = "insert"; viGate = false; }
    else alert("vi 종료 명령(:wq)을 정확히 입력해야 vi 키맵이 활성화됩니다.");
  }
  function onKey(e) {
    if (!viEnabled) return;
    const ta = e.target;
    if (viMode === "insert") {
      if (e.key === "Escape") { e.preventDefault(); viMode = "normal"; }
      return;
    }
    // normal 모드: 일부 명령만
    const handled = ["h","j","k","l","i","a","o","x"];
    if (e.key === "i") { e.preventDefault(); viMode = "insert"; }
    else if (e.key === "a") { e.preventDefault(); ta.selectionStart++; viMode = "insert"; }
    else if (e.key === "o") { e.preventDefault(); insertNewline(ta); viMode = "insert"; }
    else if (e.key === "x") { e.preventDefault(); deleteChar(ta); }
    else if (handled.includes(e.key) || e.key.length === 1) { e.preventDefault(); /* 입력 차단 */ }
  }
  function insertNewline(ta) {
    const p = ta.selectionStart;
    content = content.slice(0, p) + "\n" + content.slice(p);
    onEdit(content);
  }
  function deleteChar(ta) {
    const p = ta.selectionStart;
    content = content.slice(0, p) + content.slice(p + 1);
    onEdit(content);
  }
</script>

<svelte:window on:click={closeCtx} />

<div class="code editable">
  <aside class="tree">
    <div class="thead"><span>프로젝트</span><button on:click={startAddProject}>+</button></div>
    {#if addingProject}
      <input class="inline" bind:value={newProjName} placeholder="프로젝트 이름"
        on:keydown={(e) => e.key === "Enter" && commitProject()} on:blur={commitProject} autofocus />
    {/if}
    {#if loaded}
      {#each projects as p (p.name)}
        <div class="proj" on:contextmenu={(e) => openCtx(e, "project", p.name)}>
          {#if renaming?.type === "project" && renaming.p === p.name}
            <input class="inline" bind:value={renameValue} on:keydown={(e) => e.key === "Enter" && commitRename()} on:blur={commitRename} autofocus />
          {:else}
            <span class="pname">{p.name}</span>
            <button class="addf" on:click={() => startAddFile(p.name)} title="새 파일">+</button>
          {/if}
        </div>
        {#if addingFile === p.name}
          <input class="inline indented" bind:value={newFileName} placeholder="파일명 (예: main.c)"
            on:keydown={(e) => e.key === "Enter" && commitFile()} on:blur={commitFile} autofocus />
        {/if}
        {#each p.files as f (f)}
          {#if renaming?.type === "file" && renaming.p === p.name && renaming.f === f}
            <input class="inline indented" bind:value={renameValue} on:keydown={(e) => e.key === "Enter" && commitRename()} on:blur={commitRename} autofocus />
          {:else}
            <div class="file" class:on={curProject === p.name && curFile === f}
                 on:click={() => openFile(p.name, f)} on:contextmenu={(e) => openCtx(e, "file", p.name, f)}>{f}</div>
          {/if}
        {/each}
      {/each}
    {/if}
  </aside>

  <div class="pane">
    {#if curFile}
      <div class="bar">
        <span class="path">{curProject} / {curFile}</span>
        <button class="run" on:click={runFile}>▶ 빌드/실행</button>
        <button class="cmdset" on:click={() => (showCmdSettings = !showCmdSettings)} title="실행 명령 설정">⚙</button>
        {#if !viEnabled}
          <button class="vi" on:click={enableVi}>vi 키맵</button>
        {:else}
          <span class="vi-mode">vi: {viMode === "normal" ? "NORMAL" : "INSERT"}</span>
        {/if}
      </div>

      {#if showCmdSettings}
        <div class="cmd-settings editable">
          <div class="cmd-head">실행 명령 설정 <span class="cmd-hint">%f=파일명, %e=확장자 제외</span></div>
          <label>C99 (.c)<input value={cmds.c} on:input={(e) => { cmds.c = e.target.value; saveCmds(); }} /></label>
          <label>Python3 (.py)<input value={cmds.py} on:input={(e) => { cmds.py = e.target.value; saveCmds(); }} /></label>
          <label>Haskell (.hs)<input value={cmds.hs} on:input={(e) => { cmds.hs = e.target.value; saveCmds(); }} /></label>
          <div class="cmd-actions">
            <button class="reset" on:click={resetCmds}>기본값 복원</button>
            <button on:click={() => (showCmdSettings = false)}>닫기</button>
          </div>
        </div>
      {/if}

      <div class="edit-area">
        <div class="gutter">
          {#each lines as _, i}<div class="ln" class:cur={i === cursorLine}>{lineLabel(i)}</div>{/each}
        </div>
        <textarea class="editor" value={content}
          on:input={(e) => onEdit(e.target.value)} on:keydown={onKey}
          on:keyup={onCursor} on:click={onCursor}
          spellcheck="false" placeholder="코드를 입력하세요"></textarea>
      </div>

      {#if output}
        <div class="output"><div class="ohead">출력 <button on:click={() => (output = "")}>×</button></div><pre>{output}</pre></div>
      {/if}
    {:else}
      <div class="empty">파일을 선택하거나 새로 만드세요.<br/><small>지원 언어: C99(.c) · Python3(.py) · Haskell(.hs)<br/>실행 환경(GCC/Python/GHC)은 직접 설치해야 합니다.</small></div>
    {/if}
  </div>
</div>

{#if viGate}
  <div class="modal-bg" on:click={() => (viGate = false)}>
    <div class="modal" on:click|stopPropagation>
      <h3>vi 키맵 활성화</h3>
      <p>vi에 익숙한지 확인합니다. vi에서 저장하고 종료하는 명령을 입력하세요.</p>
      <input bind:value={viGateInput} placeholder="예: :wq" on:keydown={(e) => e.key === "Enter" && checkGate()} autofocus />
      <div class="modal-actions">
        <button class="ok" on:click={checkGate}>확인</button>
        <button on:click={() => (viGate = false)}>취소</button>
      </div>
    </div>
  </div>
{/if}

{#if ctx}
  <div class="ctxmenu" style="left:{ctx.x}px; top:{ctx.y}px">
    {#if ctx.type === "project"}
      <button on:click={() => startRename("project", ctx.p)}>이름 변경</button>
      <button class="danger" on:click={() => { deleteProject(ctx.p); closeCtx(); }}>프로젝트 삭제</button>
    {:else}
      <button on:click={() => startRename("file", ctx.p, ctx.f)}>이름 변경</button>
      <button class="danger" on:click={() => { deleteFile(ctx.p, ctx.f); closeCtx(); }}>파일 삭제</button>
    {/if}
  </div>
{/if}

<style>
  .code { height: 100%; display: grid; grid-template-columns: 200px 1fr; box-sizing: border-box; }
  .tree { border-right: 1px solid var(--line); padding: 14px 10px; overflow: auto; }
  .thead { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
  .thead button { border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; }
  .inline { width: 100%; background: var(--surface); color: var(--text); border: 1px solid var(--accent); border-radius: 6px; padding: 5px 8px; margin-bottom: 4px; font-family: var(--font-ui); }
  .inline.indented { width: calc(100% - 14px); margin-left: 14px; }
  .proj { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); margin: 10px 0 4px; padding: 3px 4px; border-radius: 6px; }
  .proj:hover { background: var(--surface-2); }
  .pname { flex: 1; }
  .addf { border: none; color: var(--text-dim); font-size: 14px; padding: 0 6px; }
  .file { padding: 5px 8px 5px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: var(--font-mono); }
  .file:hover { background: var(--surface-2); }
  .file.on { background: var(--surface-2); color: var(--accent); }

  .pane { display: flex; flex-direction: column; min-width: 0; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
  .path { color: var(--text-dim); font-size: 13px; flex: 1; }
  .run { border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 4px 12px; }
  .vi { border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; }
  .vi-mode { font-family: var(--font-mono); font-size: 12px; color: var(--accent-2); }
  .cmdset { border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; }
  .cmd-settings { padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; gap: 8px; }
  .cmd-head { font-size: 12px; color: var(--text-dim); }
  .cmd-hint { font-family: var(--font-mono); opacity: 0.7; }
  .cmd-settings label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--text-dim); }
  .cmd-settings input { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; font-family: var(--font-mono); font-size: 13px; }
  .cmd-actions { display: flex; gap: 8px; margin-top: 4px; }
  .cmd-actions button { border: 1px solid var(--line); border-radius: 6px; padding: 5px 14px; }
  .cmd-actions .reset { border-color: var(--accent-2); color: var(--accent-2); }
  .edit-area { flex: 1; display: flex; min-height: 0; overflow: auto; }
  .gutter { padding: 24px 8px 24px 16px; text-align: right; color: var(--text-dim); font-family: var(--font-mono);
    font-size: 14px; line-height: 1.7; user-select: none; background: var(--surface); }
  .ln.cur { color: var(--accent); }
  .editor { flex: 1; background: var(--surface); color: var(--text); border: none; outline: none; resize: none;
    padding: 24px 28px 24px 8px; font-family: var(--font-mono); font-size: 14px; line-height: 1.7; white-space: pre; }
  .output { border-top: 1px solid var(--line); max-height: 200px; overflow: auto; background: var(--bg); }
  .ohead { display: flex; justify-content: space-between; padding: 6px 12px; color: var(--text-dim); font-size: 12px; }
  .ohead button { border: none; color: var(--text-dim); }
  .output pre { margin: 0; padding: 0 12px 12px; font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; }
  .empty { display: grid; place-items: center; height: 100%; color: var(--text-dim); text-align: center; }
  .empty small { color: var(--text-dim); opacity: 0.7; line-height: 1.8; }

  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: grid; place-items: center; z-index: 200; }
  .modal { background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 22px; width: 360px; display: flex; flex-direction: column; gap: 12px; }
  .modal h3 { margin: 0; }
  .modal p { margin: 0; color: var(--text-dim); font-size: 13px; line-height: 1.6; }
  .modal input { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 8px; font-family: var(--font-mono); }
  .modal-actions { display: flex; gap: 8px; }
  .modal-actions button { flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 7px; }
  .modal-actions .ok { border-color: var(--accent); color: var(--accent); }
  .ctxmenu { position: fixed; z-index: 100; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .ctxmenu button { border: none; text-align: left; padding: 8px 12px; border-radius: 5px; color: var(--text); }
  .ctxmenu .danger { color: var(--danger); }
</style>
