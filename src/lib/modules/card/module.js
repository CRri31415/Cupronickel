// modules/card/module.js
// 암기 모듈 매니페스트. singleton=true (동시에 한 탭만).
import CardView from "./CardView.svelte";

export default {
  label: "암기",
  icon: "C",
  singleton: true,
  exclusiveFile: false,
  apiVersion: "1.0",
  load: async () => ({ default: CardView }),
};
