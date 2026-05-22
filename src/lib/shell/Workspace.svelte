<script>
  // 워크스페이스 — 활성 탭(및 분할 탭)의 콘텐츠를 렌더한다.
  // 코어 화면(main/settings)은 직접, 모듈은 매니페스트의 컴포넌트를 동적 로드해 표시한다.
  // 비활성 탭은 여기서 마운트되지 않으므로 메모리를 점유하지 않는다.
  import { tabs, activeTabId, splitTabId } from "../core/tabs.js";
  import { getManifest } from "../core/modules.js";
  import { makeApi } from "../core/api.js";
  import MainScreen from "../mainscreen/MainScreen.svelte";
  import Settings from "../settings/Settings.svelte";

  // 탭 id → 렌더할 컴포넌트/속성 결정
  async function resolve(tab) {
    if (!tab) return null;
    if (tab.module === "main") return { component: MainScreen, props: {} };
    if (tab.module === "settings") return { component: Settings, props: {} };
    const manifest = await getManifest(tab.module);
    const comp = await manifest.load();
    // 모듈에는 코어 내부 대신 안정 API(cn)와 탭 메타만 넘긴다.
    return { component: comp.default, props: { tab, cn: makeApi(tab.module) } };
  }

  $: activeTab = $tabs.find((t) => t.id === $activeTabId) ?? null;
  $: splitTab = $splitTabId ? $tabs.find((t) => t.id === $splitTabId) : null;
</script>

<div class="workspace" class:split={splitTab}>
  <section class="pane">
    {#if activeTab}
      {#await resolve(activeTab) then r}
        {#if r}<svelte:component this={r.component} {...r.props} />{/if}
      {/await}
    {:else}
      <div class="empty">탭이 없습니다. 좌측에서 모듈을 열어보세요.</div>
    {/if}
  </section>

  {#if splitTab}
    <div class="gutter"></div>
    <section class="pane">
      {#await resolve(splitTab) then r}
        {#if r}<svelte:component this={r.component} {...r.props} />{/if}
      {/await}
    </section>
  {/if}
</div>

<style>
  .workspace { flex: 1; display: flex; min-height: 0; min-width: 0; }
  .pane { flex: 1; min-width: 0; overflow: auto; background: var(--surface); }
  .gutter { width: 1px; background: var(--line); }
  .empty { display: grid; place-items: center; height: 100%; color: var(--text-dim); }
</style>
