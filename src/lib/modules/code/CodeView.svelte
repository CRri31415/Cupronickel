<script>
  // ───────────────────────────────────────────────────────────────────────
  // 개발용 텍스트 에디터 모듈.
  //  - 프로젝트(폴더, 실제 디렉토리)별 파일. 언어: C99 / Python3 / Haskell.
  //  - 빌드 명령(콘솔 출력)과 실행 명령(새 터미널 창)을 분리. ▶ 버튼은 빌드→실행 순차.
  //  - vi 키맵 일부(:wq 확인 절차). 줄번호: 하이브리드 상대 / 절대.
  //  - 자동 들여쓰기(엔터 시 이전 줄 들여쓰기 유지), 간단한 문법 하이라이팅.
  // 데이터: code/<project>/<files>, 인덱스 code/_index.json, 명령 code/_commands.json
  // ───────────────────────────────────────────────────────────────────────
  import { onMount } from "svelte";
  import { settings } from "../../core/settings.js";
  import { patchState } from "../../core/tabs.js";

  export let tab;
  export let cn;

  let projects = [];
  let loaded = false;
  let curProject = null, curFile = null;
  let content = "";
  let output = "";
  let taEl, hlEl;

  // vi
  let viEnabled = false, viMode = "insert", viGate = false, viGateInput = "";

  // 인라인 입력 / 우클릭
  let addingProject = false, newProjName = "";
  let addingFile = false, newFileName = "";
  let ctx = null, renaming = null, renameValue = "";

  // 빌드/실행 명령(언어별, %f=파일명 %e=확장자 제외). 사용자 설정 + 기본 복원.
  const DEFAULT_CMDS = {
    c:  { build: 'gcc -Wall -c "%f"', run: '"./%e"' },
    py: { build: 'python -m py_compile "%f"', run: 'python "%f"' },
    hs: { build: 'ghc --make "%f"', run: '"./%e"' },
  };
  let cmds = JSON.parse(JSON.stringify(DEFAULT_CMDS));
  let showCmdSettings = false;

  onMount(async () => {
    const idx = (await cn.storage.readJson("_index.json", null)) ?? { projects: [] };
    projects = idx.projects ?? [];
    loaded = true;
    const c = await cn.storage.readJson("_commands.json", null);
    if (c) cmds = { ...DEFAULT_CMDS, ...c };
    if (tab?.state?.curProject) {
      curProject = tab.state.curProject;
      if (tab.state.curFile) openFile(tab.state.curProject, tab.state.curFile);
    }
  });
  function saveIndex() { cn.storage.writeJson("_index.json", { projects }); }
  function saveCmds() { cn.storage.writeJson("_commands.json", cmds); }
  function resetCmds() { cmds = JSON.parse(JSON.stringify(DEFAULT_CMDS)); saveCmds(); }

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
    syncScroll();
  }

  // 프로젝트/파일
  function startAddProject() { addingProject = true; newProjName = ""; }
  async function commitProject() {
    const n = newProjName.trim(); addingProject = false;
    if (n && !projects.some((p) => p.name === n)) { await cn.storage.mkdir(n); projects = [...projects, { name: n, files: [] }]; saveIndex(); }
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

  // 우클릭 / 이름변경
  function openCtx(e, type, p, f) { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, type, p, f }; }
  function closeCtx() { ctx = null; }
  function startRename(type, p, f) { renaming = { type, p, f }; renameValue = type === "project" ? p : f; ctx = null; }
  async function commitRename() {
    const r = renaming; renaming = null; const v = renameValue.trim();
    if (!v) return;
    if (r.type === "project") {
      if (projects.some((x) => x.name === v)) { alert("같은 프로젝트가 있습니다."); return; }
      const proj = projects.find((x) => x.name === r.p);
      for (const f of proj.files) { const b = await cn.storage.readText(filePath(r.p, f)); await cn.storage.writeText(filePath(v, f), b ?? ""); }
      await cn.storage.remove(r.p); proj.name = v; projects = projects; saveIndex();
      if (curProject === r.p) curProject = v;
    } else {
      const proj = projects.find((x) => x.name === r.p);
      if (proj.files.includes(v)) { alert("같은 파일이 있습니다."); return; }
      const b = await cn.storage.readText(filePath(r.p, r.f));
      await cn.storage.writeText(filePath(r.p, v), b ?? ""); await cn.storage.remove(filePath(r.p, r.f));
      proj.files = proj.files.map((x) => (x === r.f ? v : x)); projects = projects; saveIndex();
      if (curProject === r.p && curFile === r.f) curFile = v;
    }
  }

  // 언어 판별
  function langOf(f) { const e = f?.split(".").pop(); return e === "c" ? "c" : e === "py" ? "py" : e === "hs" ? "hs" : null; }
  function subst(s) { const base = curFile.replace(/\.[^.]+$/, ""); return s.replace(/%f/g, curFile).replace(/%e/g, base); }

  // ▶ 빌드 → 실행 순차
  async function buildAndRun() {
    const lang = langOf(curFile);
    if (!lang) { output = "지원 언어(.c/.py/.hs)가 아닙니다."; return; }
    // 1) 빌드(콘솔 출력)
    output = "빌드 중...";
    const buildStr = subst(cmds[lang].build);
    const isWin = navigator.userAgent.includes("Windows");
    try {
      const r = await cn.exec.build(curProject, isWin ? "cmd" : "sh", isWin ? ["/c", buildStr] : ["-c", buildStr]);
      output = `$ ${buildStr}\n` + (r.stdout || "") + (r.stderr ? "\n" + r.stderr : "") + `\n[빌드 종료 코드 ${r.code}]`;
      if (r.code !== 0) { output += "\n빌드 실패로 실행하지 않습니다."; return; }
    } catch (e) { output = "빌드 실패: " + e; return; }
    // 2) 실행(새 터미널 창)
    const runStr = subst(cmds[lang].run);
    try {
      await cn.exec.runInTerminal(curProject, runStr);
      output += `\n\n실행을 새 터미널 창에서 시작했습니다:\n$ ${runStr}`;
    } catch (e) { output += "\n터미널 실행 실패: " + e; }
  }
  async function buildOnly() {
    const lang = langOf(curFile);
    if (!lang) { output = "지원 언어가 아닙니다."; return; }
    output = "빌드 중...";
    const buildStr = subst(cmds[lang].build);
    const isWin = navigator.userAgent.includes("Windows");
    try {
      const r = await cn.exec.build(curProject, isWin ? "cmd" : "sh", isWin ? ["/c", buildStr] : ["-c", buildStr]);
      output = `$ ${buildStr}\n` + (r.stdout || "") + (r.stderr ? "\n" + r.stderr : "") + `\n[종료 코드 ${r.code}]`;
    } catch (e) { output = "빌드 실패: " + e; }
  }
  async function runOnly() {
    const lang = langOf(curFile);
    if (!lang) { output = "지원 언어가 아닙니다."; return; }
    const runStr = subst(cmds[lang].run);
    try { await cn.exec.runInTerminal(curProject, runStr); output = `실행 시작(새 터미널):\n$ ${runStr}`; }
    catch (e) { output = "터미널 실행 실패: " + e; }
  }

  // 줄번호(하이브리드 상대 / 절대)
  $: lines = content.split("\n");
  $: lineMode = $settings.editor?.lineNumbers ?? "hybrid";
  let cursorLine = 0;
  function updateCursor() {
    if (!taEl) return;
    cursorLine = taEl.value.slice(0, taEl.selectionStart).split("\n").length - 1;
  }
  function lineLabel(i, cur = cursorLine, mode = lineMode) {
    if (mode === "absolute") return i + 1;
    if (i === cur) return i + 1;
    return Math.abs(i - cur);
  }
  // cursorLine/lineMode/lines 변화에 반응하는 줄번호 배열
  $: lineLabels = lines.map((_, i) => lineLabel(i, cursorLine, lineMode));

  // 자동 들여쓰기 + 탭 + vi
  function onKeydown(e) {
    if (viEnabled && handleVi(e)) return;
    const ta = e.target;
    if (e.key === "Enter") {
      e.preventDefault();
      const pos = ta.selectionStart;
      const lineStart = content.lastIndexOf("\n", pos - 1) + 1;
      const indent = (content.slice(lineStart, pos).match(/^[ \t]*/) || [""])[0];
      const ins = "\n" + indent;
      content = content.slice(0, pos) + ins + content.slice(ta.selectionEnd);
      onEdit(content);
      queueMicrotask(() => { ta.selectionStart = ta.selectionEnd = pos + ins.length; updateCursor(); });
    } else if (e.key === "Tab") {
      e.preventDefault();
      const pos = ta.selectionStart;
      content = content.slice(0, pos) + "  " + content.slice(ta.selectionEnd);
      onEdit(content);
      queueMicrotask(() => { ta.selectionStart = ta.selectionEnd = pos + 2; });
    }
  }

  // vi 키맵
  function enableVi() { viGate = true; viGateInput = ""; }
  function checkGate() {
    if (viGateInput.trim() === ":wq") { viEnabled = true; viMode = "insert"; viGate = false; }
    else alert("정확한 vi 종료 명령을 입력해야 활성화됩니다.");
  }
  function handleVi(e) {
    if (viMode === "insert") { if (e.key === "Escape") { e.preventDefault(); viMode = "normal"; return true; } return false; }
    // normal
    if (e.key === "i") { e.preventDefault(); viMode = "insert"; return true; }
    if (e.key === "a") { e.preventDefault(); if (taEl) taEl.selectionStart++; viMode = "insert"; return true; }
    if (e.key === "o") { e.preventDefault(); const p = taEl.selectionStart; content = content.slice(0,p)+"\n"+content.slice(p); onEdit(content); viMode = "insert"; return true; }
    if (e.key === "x") { e.preventDefault(); const p = taEl.selectionStart; content = content.slice(0,p)+content.slice(p+1); onEdit(content); return true; }
    if (e.key.length === 1) { e.preventDefault(); return true; } // 그 외 입력 차단
    return false;
  }

  // 문법 하이라이팅(간단): 키워드/문자열/주석/숫자
  const KEYWORDS = {
    c: ["int","char","float","double","void","return","if","else","for","while","do","switch","case","break","continue","struct","typedef","const","static","sizeof","include","define"],
    py: ["def","return","if","elif","else","for","while","in","import","from","class","try","except","finally","with","as","lambda","None","True","False","and","or","not","print"],
    hs: ["module","where","import","data","type","class","instance","let","in","do","case","of","if","then","else","newtype","deriving"],
  };
  function esc(s) { return s.replace(/[&<>]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
  function highlight(code, lang) {
    let h = esc(code);
    // 주석
    if (lang === "py") h = h.replace(/(#.*)/g, '<span class="cm">$1</span>');
    else if (lang === "hs") h = h.replace(/(--.*)/g, '<span class="cm">$1</span>');
    else h = h.replace(/(\/\/.*)/g, '<span class="cm">$1</span>');
    // 문자열
    h = h.replace(/("[^"]*"|'[^']*')/g, '<span class="st">$1</span>');
    // 숫자
    h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="nm">$1</span>');
    // 키워드
    const kws = KEYWORDS[lang] || [];
    if (kws.length) {
      const re = new RegExp(`\\b(${kws.join("|")})\\b`, "g");
      h = h.replace(re, '<span class="kw">$1</span>');
    }
    return h + "\n"; // 마지막 줄 높이 보정
  }
  $: hlLang = langOf(curFile);
  $: highlighted = curFile ? highlight(content, hlLang) : "";
  function syncScroll() { if (hlEl && taEl) { hlEl.scrollTop = taEl.scrollTop; hlEl.scrollLeft = taEl.scrollLeft; } }
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
        <button class="run" on:click={buildAndRun}>▶ 빌드/실행</button>
        <button on:click={buildOnly}>빌드</button>
        <button on:click={runOnly}>실행</button>
        <button class="cmdset" on:click={() => (showCmdSettings = !showCmdSettings)} title="명령 설정">⚙</button>
        {#if !viEnabled}<button class="vi" on:click={enableVi}>vi 키맵</button>
        {:else}<span class="vi-mode">vi: {viMode === "normal" ? "NORMAL" : "INSERT"}</span>{/if}
      </div>

      {#if showCmdSettings}
        <div class="cmd-settings editable">
          <div class="cmd-head">빌드/실행 명령 <span class="cmd-hint">%f=파일명, %e=확장자 제외</span></div>
          {#each [["c","C99"],["py","Python3"],["hs","Haskell"]] as [k, label]}
            <div class="cmd-row">
              <span class="cmd-lang">{label}</span>
              <input value={cmds[k].build} on:input={(e) => { cmds[k].build = e.target.value; saveCmds(); }} placeholder="빌드" />
              <input value={cmds[k].run} on:input={(e) => { cmds[k].run = e.target.value; saveCmds(); }} placeholder="실행" />
            </div>
          {/each}
          <div class="cmd-actions">
            <button class="reset" on:click={resetCmds}>기본값 복원</button>
            <button on:click={() => (showCmdSettings = false)}>닫기</button>
          </div>
        </div>
      {/if}

      <div class="edit-area">
        <div class="gutter">
          {#each lineLabels as label, i}<div class="ln" class:cur={i === cursorLine}>{label}</div>{/each}
        </div>
        <div class="code-stack">
          <pre class="hl" bind:this={hlEl} aria-hidden="true">{@html highlighted}</pre>
          <textarea class="editor" bind:this={taEl} value={content}
            on:input={(e) => onEdit(e.target.value)} on:keydown={onKeydown}
            on:keyup={updateCursor} on:click={updateCursor} on:scroll={syncScroll}
            spellcheck="false" placeholder="코드를 입력하세요"></textarea>
        </div>
      </div>

      {#if output}
        <div class="output"><div class="ohead">콘솔(빌드 출력) <button on:click={() => (output = "")}>×</button></div><pre>{output}</pre></div>
      {/if}
    {:else}
      <div class="empty">파일을 선택하거나 새로 만드세요.<br/><small>지원: C99(.c) · Python3(.py) · Haskell(.hs)<br/>실행 환경(GCC/Python/GHC)은 직접 설치해야 합니다.<br/>실행은 새 터미널 창에서 열려 입력을 받을 수 있습니다.</small></div>
    {/if}
  </div>
</div>

{#if viGate}
  <div class="modal-bg" on:click={() => (viGate = false)}>
    <div class="modal" on:click|stopPropagation>
      <h3>vi 키맵 활성화</h3>
      <p>vi에 익숙한지 확인합니다. vi에서 저장하고 종료하는 명령을 입력하세요.</p>
      <input bind:value={viGateInput} on:keydown={(e) => e.key === "Enter" && checkGate()} autofocus />
      <div class="modal-actions"><button class="ok" on:click={checkGate}>확인</button><button on:click={() => (viGate = false)}>취소</button></div>
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
  .thead { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
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
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
  .path { color: var(--text-dim); font-size: 13px; flex: 1; }
  .bar button { border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .run { border-color: var(--accent) !important; color: var(--accent); }
  .vi-mode { font-family: var(--font-mono); font-size: 12px; color: var(--accent-2); }
  .cmd-settings { padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; gap: 8px; }
  .cmd-head { font-size: 12px; color: var(--text-dim); }
  .cmd-hint { font-family: var(--font-mono); opacity: 0.7; }
  .cmd-row { display: grid; grid-template-columns: 80px 1fr 1fr; gap: 8px; align-items: center; }
  .cmd-lang { font-size: 12px; color: var(--text-dim); }
  .cmd-row input { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; font-family: var(--font-mono); font-size: 12px; }
  .cmd-actions { display: flex; gap: 8px; margin-top: 4px; }
  .cmd-actions button { border: 1px solid var(--line); border-radius: 6px; padding: 5px 14px; }
  .cmd-actions .reset { border-color: var(--accent-2); color: var(--accent-2); }

  .edit-area { flex: 1; display: flex; min-height: 0; overflow: hidden; }
  .gutter { padding: 16px 8px 16px 16px; text-align: right; color: var(--text-dim); font-family: var(--font-mono); font-size: 14px; line-height: 1.7; user-select: none; background: var(--surface); overflow: hidden; }
  .ln.cur { color: var(--accent); }
  .code-stack { position: relative; flex: 1; min-width: 0; }
  .hl, .editor { margin: 0; padding: 16px 28px 16px 8px; font-family: var(--font-mono); font-size: 14px; line-height: 1.7;
    white-space: pre; tab-size: 2; border: none; }
  .hl { position: absolute; inset: 0; overflow: auto; pointer-events: none; color: var(--text); }
  .editor { position: absolute; inset: 0; background: transparent; color: transparent; caret-color: var(--text);
    resize: none; outline: none; overflow: auto; }
  .hl :global(.kw) { color: var(--accent); }
  .hl :global(.st) { color: var(--accent-2); }
  .hl :global(.cm) { color: var(--text-dim); font-style: italic; }
  .hl :global(.nm) { color: #c08a5a; }

  .output { border-top: 1px solid var(--line); max-height: 200px; overflow: auto; background: var(--bg); }
  .ohead { display: flex; justify-content: space-between; padding: 6px 12px; color: var(--text-dim); font-size: 12px; }
  .ohead button { border: none; color: var(--text-dim); }
  .output pre { margin: 0; padding: 0 12px 12px; font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; }
  .empty { display: grid; place-items: center; height: 100%; color: var(--text-dim); text-align: center; }
  .empty small { opacity: 0.7; line-height: 1.8; }

  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: grid; place-items: center; z-index: 200; }
  .modal { background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 22px; width: 360px; display: flex; flex-direction: column; gap: 12px; }
  .modal h3 { margin: 0; } .modal p { margin: 0; color: var(--text-dim); font-size: 13px; line-height: 1.6; }
  .modal input { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 8px; font-family: var(--font-mono); }
  .modal-actions { display: flex; gap: 8px; }
  .modal-actions button { flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 7px; }
  .modal-actions .ok { border-color: var(--accent); color: var(--accent); }
  .ctxmenu { position: fixed; z-index: 100; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 4px; display: flex; flex-direction: column; min-width: 120px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .ctxmenu button { border: none; text-align: left; padding: 8px 12px; border-radius: 5px; color: var(--text); }
  .ctxmenu button:hover { background: var(--surface); }
  .ctxmenu .danger { color: var(--danger); }
</style>
