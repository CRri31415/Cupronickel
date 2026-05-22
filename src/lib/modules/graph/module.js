// modules/graph/module.js
// 그래프 다이어그램 모듈 매니페스트.
// 안정 API(core/api.js) 위에 올라가는 첫 모듈 — 코어 내부를 직접 참조하지 않는다.
import GraphView from "./GraphView.svelte";

export default {
  label: "그래프",
  icon: "G",
  singleton: false,
  exclusiveFile: true,   // 같은 그래프 보드를 두 탭이 동시 편집 금지
  apiVersion: "1.0",     // 기대하는 코어 API 버전
  load: async () => ({ default: GraphView }),
};
