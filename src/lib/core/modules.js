// lib/core/modules.js
// 모듈 프레임워크 — 기획서가 말한 "쿠프로니켈 자체 프레임".
//
// 모든 모듈은 동일한 매니페스트 규격(아래 JSDoc)을 따른다. 이 규격은
// 추후 업데이트/추가에 대응하기 위한 안정적 계약이다.
//
// 핵심: 설치된 모듈의 코드만 동적 import 한다. 미설치 모듈은 번들에서 분리되어
// (Vite의 code-splitting) 메모리/성능에 영향을 주지 않는다 → 기획서의 초저사양 요구.

import { writable } from "svelte/store";
import { ipc } from "./ipc.js";
import { API_VERSION } from "./api.js";

/**
 * @typedef {Object} ModuleManifest
 * @property {string}  key           폴더/식별자 ("note","card","memo",...)
 * @property {string}  label         사이드바/탭 표시 이름
 * @property {string}  icon          사이드바 아이콘(단문 텍스트 또는 SVG path d)
 * @property {boolean} singleton     true면 동시에 한 탭만 허용 (암기, 달력)
 * @property {boolean} exclusiveFile true면 같은 파일을 두 탭이 동시에 열 수 없음
 * @property {string}  apiVersion    모듈이 기대하는 코어 API 버전("1.0" 등)
 * @property {() => Promise<any>} load  탭에 렌더할 Svelte 컴포넌트를 반환
 */

// key → 동적 로더. 여기에 등록된 키만 "설치 가능한 모듈"로 간주된다.
const LOADERS = {
  memo:  () => import("../modules/memo/module.js"),
  graph: () => import("../modules/graph/module.js"),
  // note:     () => import("../modules/note/module.js"),
  // card:     () => import("../modules/card/module.js"),
  // calendar: () => import("../modules/calendar/module.js"),
  // code:     () => import("../modules/code/module.js"),
  // sheet:    () => import("../modules/sheet/module.js"),
};

// 설치 메타데이터(아이콘/이름 등)는 가벼우므로 미리 둔다.
// 실제 모듈 코드는 설치된 경우에만 로드된다.
const META = {
  note:     { label: "노트",     icon: "N", singleton: false, exclusiveFile: true },
  card:     { label: "암기",     icon: "C", singleton: true,  exclusiveFile: false },
  memo:     { label: "메모",     icon: "M", singleton: false, exclusiveFile: true },
  calendar: { label: "달력",     icon: "L", singleton: true,  exclusiveFile: false },
  code:     { label: "에디터",   icon: "E", singleton: false, exclusiveFile: true },
  graph:    { label: "그래프",   icon: "G", singleton: false, exclusiveFile: true },
  sheet:    { label: "시트",     icon: "S", singleton: false, exclusiveFile: true },
};

// 설치된 모듈 키 목록 (사이드바가 구독)
export const installed = writable([]);

// 로드된 매니페스트 캐시 (한 번 로드한 모듈은 재사용)
const cache = new Map();

/** 백엔드에서 설치 상태를 읽어 store를 채운다. */
export async function refreshInstalled() {
  const states = await ipc.listModules();
  installed.set(states.filter((s) => s.installed && LOADERS[s.key]).map((s) => s.key));
}

/** 모듈 설치 → 백엔드 기록 후 목록 갱신. */
export async function install(key) {
  await ipc.installModule(key);
  await refreshInstalled();
}

/** 모듈 제거 → 캐시 비우고 목록 갱신(메모리 해제). */
export async function uninstall(key) {
  await ipc.uninstallModule(key);
  cache.delete(key);
  await refreshInstalled();
}

/** 설치된 모듈의 매니페스트를 (필요 시 동적 로드하여) 반환. */
export async function getManifest(key) {
  if (cache.has(key)) return cache.get(key);
  const loader = LOADERS[key];
  if (!loader) throw new Error("알 수 없는 모듈: " + key);
  const mod = await loader();
  const manifest = { key, ...META[key], ...mod.default };
  // API 메이저 버전이 다르면 호환되지 않을 수 있음을 경고(로드는 계속).
  if (manifest.apiVersion && majorOf(manifest.apiVersion) !== majorOf(API_VERSION)) {
    console.warn(
      `모듈 '${key}'는 API ${manifest.apiVersion}을 기대하지만 코어는 ${API_VERSION}입니다.`
    );
  }
  cache.set(key, manifest);
  return manifest;
}

/** "1.0" → 1 */
function majorOf(v) { return parseInt(String(v).split(".")[0], 10); }

/** 메타데이터(아이콘/이름)만 동기적으로 얻는다. */
export function meta(key) {
  return META[key];
}

/** 설치 가능한 전체 모듈 키 목록. */
export function allModuleKeys() {
  return Object.keys(META);
}
