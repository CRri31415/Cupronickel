<script>
  // 좌측 세로 사이드바. 메인/설정 버튼 + 설치된 모듈을 여는 버튼들.
  import { installed, meta } from "../core/modules.js";
  import { openCore, openTab } from "../core/tabs.js";

  // 모듈 탭 열기. 파일 단위 모듈은 우선 모듈 자체(목록 화면)를 연다.
  function openModule(key) {
    openTab({ module: key, title: meta(key).label });
  }
</script>

<nav class="sidebar">
  <button class="slot" title="메인" on:click={() => openCore("main")}>⌂</button>

  <div class="divider"></div>

  {#each $installed as key (key)}
    <button class="slot" title={meta(key).label} on:click={() => openModule(key)}>
      {meta(key).icon}
    </button>
  {/each}

  <div class="spacer"></div>

  <button class="slot" title="설정" on:click={() => openCore("settings")}>⚙</button>
</nav>

<style>
  .sidebar {
    width: var(--sidebar-w);
    background: var(--bg);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    gap: 4px;
  }
  .slot {
    width: 38px; height: 38px;
    display: grid; place-items: center;
    border-radius: 8px;
    font-size: 16px; color: var(--text-dim);
  }
  .slot:hover { color: var(--text); background: var(--surface-2); }
  .divider { width: 26px; height: 1px; background: var(--line); margin: 4px 0; }
  .spacer { flex: 1; }
</style>
