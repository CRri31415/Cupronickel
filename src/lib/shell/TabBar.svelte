<script>
  // 창 최상단의 크롬식 탭 바. 활성 탭 강조, 닫기 버튼, 분할 토글 제공.
  import { tabs, activeTabId, splitTabId, focus, closeTab, toggleSplit } from "../core/tabs.js";
</script>

<div class="tabbar">
  {#each $tabs as tab (tab.id)}
    <div
      class="tab"
      class:active={$activeTabId === tab.id}
      class:split={$splitTabId === tab.id}
      on:click={() => focus(tab.id)}
      on:auxclick={(e) => e.button === 1 && closeTab(tab.id)}
      title={tab.file ?? tab.title}
    >
      <span class="title">{tab.title}</span>
      <!-- 우측 분할 토글 -->
      <button class="mini" title="우측 분할" on:click|stopPropagation={() => toggleSplit(tab.id)} aria-label="분할">
        <svg viewBox="0 0 16 16" width="12" height="12">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
          <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      </button>
      <button class="mini" title="닫기" on:click|stopPropagation={() => closeTab(tab.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    height: var(--tabbar-h);
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 12px;
    max-width: 200px;
    min-width: 110px;
    border-right: 1px solid var(--line);
    color: var(--text-dim);
    background: var(--surface);
    transition: background var(--motion) var(--motion-ease),
                color var(--motion) var(--motion-ease);
  }
  .tab:hover { color: var(--text); }
  .tab.active { background: var(--surface-2); color: var(--text); }
  .tab.split { box-shadow: inset -2px 0 0 var(--accent-2); }
  .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini {
    border-radius: 3px; padding: 0 5px; line-height: 1.4;
    color: var(--text-dim); font-size: 13px;
  }
  .mini:hover { color: var(--text); background: var(--line); }
</style>
