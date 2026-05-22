// main.js — 프론트엔드 부트스트랩.
// 순서: 스토리지 초기화 → 설정 로드 → 모듈 목록 → 세션 복원(없으면 메인 탭) → 마운트.
import "./app.css";
import App from "./App.svelte";
import { ipc } from "./lib/core/ipc.js";
import { loadSettings } from "./lib/core/settings.js";
import { refreshInstalled } from "./lib/core/modules.js";
import { restoreSession, openCore } from "./lib/core/tabs.js";

async function boot() {
  await ipc.init();            // 폴더 구조 보장
  await loadSettings();        // 테마/모션을 :root에 반영
  await refreshInstalled();    // 설치된 모듈만 사이드바에 노출

  const restored = await restoreSession(); // 이전 탭 상태 복원
  if (!restored) openCore("main");         // 최초 실행이면 메인화면
}

boot();

export default new App({ target: document.getElementById("app") });
