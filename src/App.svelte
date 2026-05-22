<script>
  // App.svelte — 셸 조립: [사이드바] [탭바 + 워크스페이스]
  import { onMount, onDestroy } from "svelte";
  import Sidebar from "./lib/shell/Sidebar.svelte";
  import TabBar from "./lib/shell/TabBar.svelte";
  import Workspace from "./lib/shell/Workspace.svelte";
  import { sweepIdle } from "./lib/core/tabs.js";

  // 주기적으로 유휴 탭을 비활성(언마운트)로 내려 메모리를 회수한다.
  let sweep;
  onMount(() => { sweep = setInterval(sweepIdle, 60 * 1000); });
  onDestroy(() => clearInterval(sweep));
</script>

<div class="app-shell">
  <Sidebar />
  <div class="main-col">
    <TabBar />
    <Workspace />
  </div>
</div>

<style>
  .app-shell { display: flex; height: 100vh; }
  .main-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
</style>
