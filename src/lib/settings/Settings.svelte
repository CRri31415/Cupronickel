<script>
  // 설정 화면 — 표시/성능, 테마, (설치된) 모듈별 설정, 모듈 설치.
  import { settings, updateSettings } from "../core/settings.js";
  import { installed, install, meta, allModuleKeys } from "../core/modules.js";
  import { ipc } from "../core/ipc.js";

  const COLOR_LABELS = {
    "--bg": "배경", "--surface": "패널", "--surface-2": "상위 패널",
    "--line": "경계선", "--text": "본문", "--text-dim": "보조 텍스트",
    "--accent": "강조", "--accent-2": "보조 강조", "--danger": "경고",
  };

  function setColor(key, value) {
    const theme = { ...$settings.theme, vars: { ...$settings.theme.vars, [key]: value } };
    updateSettings({ theme });
  }

  // vi 키맵 활성화 게이트
  let viGate = false, viGateInput = "", gateError = "";
  // 다양한 vi 저장+종료 명령(콜론 포함). :wq, :x, :wq!, :wqa, ZZ 등.
  const QUIT_CMDS = [":wq", ":x", ":wq!", ":x!", ":wqa", ":wqa!", ":xa", "zz"];
  function checkGate() {
    const v = viGateInput.trim().toLowerCase();
    if (QUIT_CMDS.includes(v)) {
      updateSettings({ editor: { ...$settings.editor, vi: true } });
      viGate = false; viGateInput = ""; gateError = "";
    } else if (v === "wq" || v === "x") {
      gateError = "콜론(:)을 포함해야 합니다. 노멀 모드에서 콜론을 먼저 입력해 명령 모드로 들어갑니다.";
    } else {
      gateError = "올바른 vi 저장+종료 명령이 아닙니다.";
    }
  }
</script>

<div class="settings editable">
  <h1>설정</h1>

  <section>
    <h2>표시 / 성능</h2>
    <label class="row">
      <span>애니메이션</span>
      <input type="checkbox" checked={$settings.motion}
        on:change={(e) => updateSettings({ motion: e.target.checked })} />
      <small>탭 전환·버튼 등의 부드러운 효과. 끄면 모든 전환이 즉시 처리되어 약간 더 가볍습니다.</small>
    </label>
    <label class="row">
      <span>창 크기</span>
      <select value={$settings.resolution} on:change={(e) => updateSettings({ resolution: e.target.value })}>
        <option value="1600x900">1600 × 900</option>
        <option value="1920x1080">1920 × 1080</option>
      </select>
      <small>창 픽셀 크기를 고정합니다(전체화면 아님).</small>
    </label>
    <div class="row">
      <span>데이터 폴더</span>
      <button class="folder-btn" on:click={() => ipc.openDataFolder()}>파일 탐색기에서 열기</button>
      <small>설정·노트·카드 등 모든 데이터가 저장된 폴더를 엽니다.</small>
    </div>
  </section>

  <section>
    <h2>테마</h2>
    <div class="colors">
      {#each Object.entries($settings.theme.vars) as [key, val]}
        <label class="color">
          <input type="color" value={val} on:input={(e) => setColor(key, e.target.value)} />
          <span>{COLOR_LABELS[key] ?? key}</span>
        </label>
      {/each}
    </div>
  </section>

  <!-- 에디터 설정: 에디터 모듈이 설치된 경우에만 표시.
       (이전엔 에디터가 없는데도 줄번호 설정이 보이던 모순을 수정) -->
  {#if $installed.includes("code")}
    <section>
      <h2>에디터</h2>
      <label class="row">
        <span>줄 번호</span>
        <select value={$settings.editor.lineNumbers}
          on:change={(e) => updateSettings({ editor: { ...$settings.editor, lineNumbers: e.target.value } })}>
          <option value="hybrid">하이브리드 상대</option>
          <option value="absolute">절대</option>
        </select>
      </label>
      <div class="row">
        <span>vi 키맵</span>
        {#if $settings.editor.vi}
          <button class="folder-btn" on:click={() => updateSettings({ editor: { ...$settings.editor, vi: false } })}>사용 중 — 끄기</button>
        {:else}
          <button class="folder-btn" on:click={() => (viGate = true)}>켜기</button>
        {/if}
        <small>vi 사용자를 위한 모달/노멀/인서트 키맵을 켭니다.</small>
      </div>
    </section>
  {/if}

  {#if viGate}
    <div class="modal-bg" on:click={() => (viGate = false)}>
      <div class="modal" on:click|stopPropagation>
        <h3>vi 키맵 활성화</h3>
        <p>vi에 익숙한지 확인합니다. <strong>노멀 모드에서 저장 후 종료하는 명령</strong>을 콜론(:)까지 포함해 입력하세요. (예: 콜론 다음 wq)</p>
        <input bind:value={viGateInput} on:keydown={(e) => e.key === "Enter" && checkGate()}
          placeholder="여기에 입력" autofocus />
        {#if gateError}<span class="gate-err">{gateError}</span>{/if}
        <div class="modal-actions">
          <button class="ok" on:click={checkGate}>확인</button>
          <button on:click={() => { viGate = false; gateError = ""; }}>취소</button>
        </div>
      </div>
    </div>
  {/if}

  <section>
    <h2>모듈</h2>
    <p class="hint">설치한 모듈만 메모리에 로드됩니다.</p>
    {#each allModuleKeys() as key}
      <div class="module-row">
        <span class="ico">{meta(key).icon}</span>
        <span class="name">{meta(key).label}</span>
        {#if $installed.includes(key)}
          <span class="state">설치됨</span>
        {:else}
          <button class="primary" on:click={() => install(key)}>설치</button>
        {/if}
      </div>
    {/each}
    <p class="hint small">모듈 제거 기능은 이번 버전에서 비활성화되어 있습니다.</p>
  </section>
</div>

<style>
  .settings { padding: 28px 32px; max-width: 720px; }
  h1 { font-size: 22px; font-weight: 500; margin: 0 0 20px; }
  h2 { font-size: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 10px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 8px 0; flex-wrap: wrap; }
  .row > span:first-child { width: 90px; }
  .row small { color: var(--text-dim); flex-basis: 100%; margin-left: 102px; }
  .colors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .color { display: flex; align-items: center; gap: 8px; }
  .color input { width: 28px; height: 28px; border: 1px solid var(--line); background: none; border-radius: 4px; }
  .hint { color: var(--text-dim); font-size: 12px; }
  .hint.small { margin-top: 12px; font-size: 11px; }
  .module-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); }
  .module-row .ico { width: 24px; text-align: center; color: var(--accent); }
  .module-row .name { flex: 1; }
  .module-row .state { color: var(--text-dim); font-size: 12px; }
  button { border: 1px solid var(--line); border-radius: 6px; padding: 4px 14px; }
  button.primary { border-color: var(--accent); color: var(--accent); }
  .folder-btn { border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; }
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: grid; place-items: center; z-index: 200; }
  .modal { background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 22px; width: 380px; display: flex; flex-direction: column; gap: 12px; }
  .modal h3 { margin: 0; }
  .modal p { margin: 0; color: var(--text-dim); font-size: 13px; line-height: 1.6; }
  .modal input { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 8px; font-family: var(--font-mono); }
  .gate-err { color: var(--danger); font-size: 12px; }
  .modal-actions { display: flex; gap: 8px; }
  .modal-actions button { flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 7px; }
  .modal-actions .ok { border-color: var(--accent); color: var(--accent); }
  select, input[type="checkbox"] { accent-color: var(--accent); }
  select { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
</style>
