<script>
  // 워크스페이스 — keep-alive 마운트로 탭 상태를 보존한다.
  //
  // 무한 점멸 방지(중요): 마운트 목록을 반응형 블록에서 갱신하면 tab.state 변화가
  // 재마운트를 부르는 루프가 생긴다. 그래서 마운트 목록은 activeTabId/splitTabId가
  // "실제로 바뀔 때만" 일반 코드로 갱신하고, $tabs 전체에는 의존하지 않는다.
  import { tabs, activeTabId, splitTabId } from "../core/tabs.js";
  import { getManifest } from "../core/modules.js";
  import { makeApi } from "../core/api.js";
  import MainScreen from "../mainscreen/MainScreen.svelte";
  import Settings from "../settings/Settings.svelte";

  function coreComponent(module) {
    if (module === "main") return MainScreen;
    if (module === "settings") return Settings;
    return null;
  }

  const moduleComp = {};
  const loading = {};
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

  // 마운트 유지 id 목록(일반 배열, 반응형 루프 없음).
  let mountedIds = [];
  let lastActive = null, lastSplit = null;

  // activeTabId/splitTabId가 실제로 바뀐 경우에만 목록을 갱신한다.
  $: {
    if ($activeTabId !== lastActive || $splitTabId !== lastSplit) {
      lastActive = $activeTabId; lastSplit = $splitTabId;
      const want = new Set(mountedIds);
      if ($activeTabId) want.add($activeTabId);
      if ($splitTabId) want.add($splitTabId);
      mountedIds = [...want];
    }
  }

  // 닫힌 탭 정리: tabs 길이가 줄었을 때만 (id 비교)
  let lastTabCount = -1;
  $: {
    if ($tabs.length !== lastTabCount) {
      lastTabCount = $tabs.length;
      const ids = new Set($tabs.map((t) => t.id));
      const filtered = mountedIds.filter((id) => ids.has(id));
      if (filtered.length !== mountedIds.length) mountedIds = filtered;
    }
  }

  // mountedIds에 해당하는 탭 객체(렌더용). tab.state 변화는 여기 영향 없음.
  $: mountedTabs = mountedIds
    .map((id) => $tabs.find((t) => t.id === id))
    .filter(Boolean);

  const apiCache = {};
  function apiFor(tab) {
    if (tab.module === "main" || tab.module === "settings") return null;
    return (apiCache[tab.id] ||= makeApi(tab.module));
  }

  $: hasAny = $activeTabId || $splitTabId;
</script>

<div class="workspace" class:split={$splitTabId}>
  {#if !hasAny}
    <div class="empty">탭이 없습니다. 좌측에서 모듈을 열어보세요.</div>
  {/if}

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
  {/each}
  {#if $splitTabId}<div class="gutter"></div>{/if}
</div>

<style>
  .workspace { flex: 1; display: flex; min-height: 0; min-width: 0; position: relative; }
  .pane { flex: 1; min-width: 0; overflow: auto; background: var(--surface); }
  .pane.hidden { display: none; }
  .pane.show-left { order: 1; }
  .gutter { width: 1px; background: var(--line); order: 2; }
  .pane.show-right { order: 3; }
  .empty { display: grid; place-items: center; height: 100%; width: 100%; color: var(--text-dim); }
</style>
