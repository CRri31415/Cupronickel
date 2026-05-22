// lib/core/textext.js
// 텍스트 범용 확장 레지스트리.
//
// 기획서: 텍스트 범용 확장 모듈(TeX, SMILES 등)은 "설치돼 있다면 다른 모듈에서
// 호출하여 사용할 수 있게 되는 방식"으로 작동한다.
//
// 구현 방식:
//   - 텍스트 확장 모듈이 설치되면 자신의 변환기를 registerTextExt()로 등록한다.
//   - 다른 모듈(노트/암기/메모/그래프)은 core/api.js의 cn.text.render()를 호출하고,
//     이 레지스트리에 등록된 게 있으면 그것이 쓰인다. 없으면 통과(평문).
//
// 이 간접층 덕분에 텍스트 확장 모듈과 다른 모듈은 서로를 직접 import 하지 않는다.

let provider = null;

/**
 * 텍스트 확장 변환기를 등록한다(텍스트 확장 모듈이 설치 시 호출).
 * @param {{ render: (src: string) => Promise<string> | string }} p
 */
export function registerTextExt(p) { provider = p; }

/** 등록 해제(텍스트 확장 모듈 제거 시). */
export function unregisterTextExt() { provider = null; }

/** 현재 등록된 변환기(없으면 null). */
export function getTextExt() { return provider; }
