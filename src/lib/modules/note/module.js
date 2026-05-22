// modules/note/module.js
// 노트 모듈 매니페스트. 마크다운 노트를 폴더별로 관리.
import NoteView from "./NoteView.svelte";

export default {
  label: "노트",
  icon: "N",
  singleton: false,
  exclusiveFile: true,   // 같은 노트를 두 탭이 동시 편집 금지
  apiVersion: "1.0",
  load: async () => ({ default: NoteView }),
};
