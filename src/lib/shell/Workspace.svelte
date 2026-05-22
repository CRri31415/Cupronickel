<script>
  // 워크스페이스 — 활성 탭과 분할 탭의 콘텐츠를 렌더한다.
  //
  // 상태 보존(중요): 탭을 떠났다 돌아오거나 분할로 이동해도 컴포넌트가 언마운트되지
  // 않도록, "한 번 마운트된 탭은 유지(keep-alive)"하고 CSS로 표시/숨김만 토글한다.
  // 이렇게 하면 그래프 보드 편집 위치, 노트 선택 등 컴포넌트 내부 상태가 보존된다.
  // (이전엔 {#await}가 탭 전환마다 재실행되어 선택 화면으로 돌아가는 버그가 있었다.)
  import { tabs, activeTabId, splitTabId } from "../core/tabs.js";
  import { getManifest } from "../core/modules.js";
  import { makeApi } from "../core/api.js";
  import MainScreen from "../mainscreen/MainScreen.svelte";
  import Settings from "../settings/Settings.svelte";

  // 코어 화면은 동기 컴포넌트, 모듈은 비동기 로드.
  function coreComponent(module) {
    if (module === "main") return MainScreen;
    if (module === "settings") return Settings;
    return null;
  }

  // 모듈 컴포넌트 캐시: 같은 모듈 키는 한 번만 로드.
  const moduleComp = {};       // key -> component
  const loading = {};          // key -> Promise
  async function ensureModule(key) {
    if (moduleComp[key]) return moduleComp[key];
    if (!loading[key]) {
      loading[key] = (async () => {
        const manifest = await getManifest(key);
        const m = await manifest.load();
        moduleComp[key] = m.default;
        return m.default;
      })();
    }
    return loading[key];
  }

  // 마운트해 둘 탭: 지금까지 한 번이라도 활성/분할이 된 탭은 계속 유지.
  // (전체 탭을 다 마운트하면 메모리 낭비이므로, 본 적 있는 탭만 유지)
  let mounted = new Set();
  $: {
    if ($activeTabId) mounted.add($activeTabId);
    if ($splitTabId) mounted.add($splitTabId);
    mounted = mounted; // 반응성
  }
  // 닫힌 탭은 정리
  $: {
    const ids = new Set($tabs.map((t) => t.id));
    for (const id of [...mounted]) if (!ids.has(id)) mounted.delete(id);
    mounted = mounted;
  }

  $: mountedTabs = $tabs.filter((t) => mounted.has(t.id));

  // 각 탭의 props(cn은 한 번만 생성해 재사용)
  const apiCache = {};
  function apiFor(tab) {
    if (tab.module === "main" || tab.module === "settings") return null;
    return (apiCache[tab.id] ||= makeApi(tab.module));
  }

  $: hasActive = $tabs.some((t) => t.id === $activeTabId);
</script>

<div class="workspace" class:split={$splitTabId}>
  {#if !hasActive && !$splitTabId}
    <div class="empty">탭이 없습니다. 좌측에서 모듈을 열어보세요.</div>
  {/if}

  <!-- 본 적 있는 모든 탭을 마운트한 채로 두고, 위치/표시만 바꾼다 -->
  {#each mountedTabs as tab (tab.id)}
    {@const core = coreComponent(tab.module)}
    {@const isLeft = tab.id === $activeTabId}
    {@const isRight = tab.id === $splitTabId}
    <section class="pane"
      class:show-left={isLeft}
      class:show-right={isRight}
      class:hidden={!isLeft && !isRight}>
      {#if core}
        <svelte:component this={core} />
      {:else}
        {#await ensureModule(tab.module) then Comp}
          {#if Comp}<svelte:component this={Comp} {tab} cn={apiFor(tab)} />{/if}
        {/await}
      {/if}
    </section>
    {#if isRight}<div class="gutter" style="order:0"></div>{/if}
  {/each}
</div>

<style>
  .workspace { flex: 1; display: flex; min-height: 0; min-width: 0; position: relative; }
  .pane { flex: 1; min-width: 0; overflow: auto; background: var(--surface); }
  /* 보이지 않는 탭은 레이아웃에서 제거하되 언마운트하지 않는다 */
  .pane.hidden { display: none; }
  .pane.show-left { order: 1; }
  .gutter { width: 1px; background: var(--line); order: 2; }
  .pane.show-right { order: 3; }
  .empty { display: grid; place-items: center; height: 100%; width: 100%; color: var(--text-dim); }
</style>
