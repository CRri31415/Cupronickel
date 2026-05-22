<script>
  // 설정 화면 — 모션 토글, 해상도, 테마 색/폰트, 모듈 설치/제거, 에디터 줄번호.
  import { settings, updateSettings } from "../core/settings.js";
  import { installed, install, uninstall, meta, allModuleKeys } from "../core/modules.js";

  // 테마 변수 편집용 라벨
  const COLOR_LABELS = {
    "--bg": "배경", "--surface": "패널", "--surface-2": "상위 패널",
    "--line": "경계선", "--text": "본문", "--text-dim": "보조 텍스트",
    "--accent": "강조", "--accent-2": "보조 강조", "--danger": "경고",
  };

  function setColor(key, value) {
    const theme = { ...$settings.theme, vars: { ...$settings.theme.vars, [key]: value } };
    updateSettings({ theme });
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
      <small>끄면 모든 전환이 즉시 처리됩니다(완전 최적화).</small>
    </label>
    <label class="row">
      <span>해상도</span>
      <select value={$settings.resolution} on:change={(e) => updateSettings({ resolution: e.target.value })}>
        <option value="1600x900">1600 × 900</option>
        <option value="1920x1080">1920 × 1080</option>
      </select>
    </label>
    <label class="row">
      <span>에디터 줄번호</span>
      <select value={$settings.editor.lineNumbers}
        on:change={(e) => updateSettings({ editor: { ...$settings.editor, lineNumbers: e.target.value } })}>
        <option value="hybrid">하이브리드 상대</option>
        <option value="absolute">절대</option>
      </select>
    </label>
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

  <section>
    <h2>모듈</h2>
    <p class="hint">설치한 모듈만 메모리에 로드됩니다. 제거하면 데이터는 압축 보관됩니다.</p>
    {#each allModuleKeys() as key}
      <div class="module-row">
        <span class="ico">{meta(key).icon}</span>
        <span class="name">{meta(key).label}</span>
        {#if $installed.includes(key)}
          <button on:click={() => uninstall(key)}>제거</button>
        {:else}
          <button class="primary" on:click={() => install(key)}>설치</button>
        {/if}
      </div>
    {/each}
  </section>
</div>

<style>
  .settings { padding: 28px 32px; max-width: 720px; }
  h1 { font-size: 22px; font-weight: 500; margin: 0 0 20px; }
  h2 { font-size: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 10px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
  .row > span:first-child { width: 120px; }
  .row small { color: var(--text-dim); }
  .colors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .color { display: flex; align-items: center; gap: 8px; }
  .color input { width: 28px; height: 28px; border: 1px solid var(--line); background: none; border-radius: 4px; }
  .hint { color: var(--text-dim); font-size: 12px; }
  .module-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); }
  .module-row .ico { width: 24px; text-align: center; color: var(--accent); }
  .module-row .name { flex: 1; }
  button { border: 1px solid var(--line); border-radius: 6px; padding: 4px 14px; }
  button.primary { border-color: var(--accent); color: var(--accent); }
  select, input[type="checkbox"] { accent-color: var(--accent); }
  select { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
</style>
