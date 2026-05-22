// modules/code/module.js
// 개발용 텍스트 에디터 모듈.
import CodeView from "./CodeView.svelte";

export default {
  label: "에디터",
  icon: "E",
  singleton: false,
  exclusiveFile: true,
  apiVersion: "1.0",
  load: async () => ({ default: CodeView }),
};
