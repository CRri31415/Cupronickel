// modules/textext/module.js
// ───────────────────────────────────────────────────────────────────────
// 텍스트 범용 확장 모듈.
//
// 기획서: $..$ TeX 문법과 ```smiles 코드블록 SMILES 렌더링을 제공하고,
// "설치돼 있다면 다른 모듈에서 호출하여 사용"하는 방식으로 작동한다.
//
// 동작: 이 모듈이 로드되면 core/textext.js 레지스트리에 변환기를 등록한다.
// 그러면 노트/암기/메모/달력 등이 cn.text.render()를 통해 자동으로 이 변환기를 쓴다.
//
// 이 모듈은 탭으로 열 화면이 없는 "백그라운드 확장"이라, 안내 화면만 제공한다.
// 무거운 라이브러리(KaTeX, smiles-drawer)는 이 모듈이 설치된 경우에만 로드된다.
// ───────────────────────────────────────────────────────────────────────
import InfoView from "./InfoView.svelte";
import { registerTextExt } from "../../core/textext.js";
import { renderExtended } from "./render.js";

// 모듈 로드 시점에 변환기를 등록한다(설치 = 로드).
registerTextExt({ render: renderExtended });

export default {
  label: "텍스트확장",
  icon: "Tx",
  singleton: true,
  exclusiveFile: false,
  apiVersion: "1.0",
  load: async () => ({ default: InfoView }),
};
