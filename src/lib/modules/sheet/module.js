// modules/sheet/module.js
// 시트 모듈 — 작은 표 제작 특화(논문 양식), 이미지 내보내기.
import SheetView from "./SheetView.svelte";

export default {
  label: "시트",
  icon: "S",
  singleton: false,
  exclusiveFile: true,
  apiVersion: "1.0",
  load: async () => ({ default: SheetView }),
};
