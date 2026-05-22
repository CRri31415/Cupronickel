<script>
  // 워크스페이스 — keep-alive 마운트.
  //
  // 점멸/재마운트 방지(핵심):
  //  - 모듈에 넘기는 tab/cn은 탭 id별로 한 번만 생성해 "고정"한다. tabs 스토어가
  //    갱신되어도(patchState 등) 컴포넌트에 넘기는 props 참조가 바뀌지 않으므로
  //    Svelte가 컴포넌트를 재생성하지 않는다.
  //  - 마운트 목록(mountedIds)은 활성/분할 탭이 실제로 바뀔 때만 갱신한다.
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
        const m = await (await getManifest(key)).load();
        moduleComp[key] = m.default;
        return m.default;
      })();
    }
    return loading[key];
  }

  // 탭 id별 고정 컨텍스트(컴포넌트, props). 한 번 만들면 참조 불변.
  const ctxById = {};   // id -> { id, module, tab, cn, core }
  function ctxFor(id) {
    if (ctxById[id]) return ctxById[id];
    const t = $tabs.find((x) => x.id === id);
    if (!t) return null;
    const core = coreComponent(t.module);
    // tab 객체는 고정 참조로 둔다. 모듈은 tab.id만 쓰고, 상태는 patchState로 저장.
    const fixedTab = { id: t.id, module: t.module, title: t.title, file: t.file, state: t.state };
    ctxById[id] = { id, module: t.module, tab: fixedTab, cn: core ? null : makeApi(t.module), core };
    return ctxById[id];
  }

  // 마운트 유지 id 목록
  let mountedIds = [];
  let lastActive = null, lastSplit = null;
  $: {
    if ($activeTabId !== lastActive || $splitTabId !== lastSplit) {
      lastActive = $activeTabId; lastSplit = $splitTabId;
      const want = new Set(mountedIds);
      if ($activeTabId) want.add($activeTabId);
      if ($splitTabId) want.add($splitTabId);
      mountedIds = [...want];
    }
  }
  // 닫힌 탭 정리
  let lastCount = -1;
  $: {
    if ($tabs.length !== lastCount) {
      lastCount = $tabs.length;
      const ids = new Set($tabs.map((t) => t.id));
      const filtered = mountedIds.filter((id) => ids.has(id));
      if (filtered.length !== mountedIds.length) {
        for (const id of mountedIds) if (!ids.has(id)) delete ctxById[id];
        mountedIds = filtered;
      }
    }
  }

  $: hasAny = $activeTabId || $splitTabId;
</script>

<div class="workspace" class:split={$splitTabId}>
  {#if !hasAny}
    <div class="empty">탭이 없습니다. 좌측에서 모듈을 열어보세요.</div>
  {/if}

  {#each mountedIds as id (id)}
    {@const ctx = ctxFor(id)}
    {#if ctx}
      <section class="pane"
        class:show-left={id === $activeTabId}
        class:show-right={id === $splitTabId}
        class:hidden={id !== $activeTabId && id !== $splitTabId}>
        {#if ctx.core}
          <svelte:component this={ctx.core} />
        {:else}
          {#await ensureModule(ctx.module) then Comp}
            {#if Comp}<svelte:component this={Comp} tab={ctx.tab} cn={ctx.cn} />{/if}
          {/await}
        {/if}
      </section>
    {/if}
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
