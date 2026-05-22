// modules/memo/module.js
// 메모 모듈 매니페스트 — 모든 모듈이 따르는 규격의 예시.
// (core/modules.js 의 ModuleManifest 타입 참고)
import MemoView from "./MemoView.svelte";

export default {
  // 메타데이터는 META에도 있지만, 매니페스트가 최종 권위를 가진다.
  label: "메모",
  icon: "M",
  singleton: false,
  exclusiveFile: true,   // 같은 메모 묶음을 두 탭이 동시 편집 금지
  // 탭에 마운트할 컴포넌트(동적 import 로 코드 분리)
  load: async () => ({ default: MemoView }),
};
