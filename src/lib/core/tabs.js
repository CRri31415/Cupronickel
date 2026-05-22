// lib/core/tabs.js
// 탭 매니저 — 크롬식 탭 + 분할 + 활성/비활성(메모리↔디스크) + 세션 영속화.
//
// 기획서 규칙 반영:
//  - singleton 모듈(암기/달력)은 동시에 한 탭만.
//  - exclusiveFile 모듈(노트/메모/에디터/그래프/시트)은 같은 파일을 두 탭이 열 수 없음.
//  - 활성 탭: 최근 사용 → 메모리에 컴포넌트가 마운트됨.
//    비활성 탭: 일정 시간 미사용 → 컴포넌트 언마운트(메모리 해제), 가벼운 상태만 유지.
//  - 종료/재실행 시 세션 스냅샷으로 탭 상태가 그대로 복원됨.

import { writable, get } from "svelte/store";
import { ipc } from "./ipc.js";
import { meta } from "./modules.js";

// 비활성 전환까지의 유휴 시간(ms). 설정에서 조정 가능하게 확장할 수 있다.
const IDLE_MS = 5 * 60 * 1000;

/**
 * @typedef {Object} Tab
 * @property {string}  id        고유 id
 * @property {string}  module    모듈 키 ("memo" 등) / "main" / "settings"
 * @property {string}  title     탭 제목
 * @property {string=} file      편집 중인 파일 상대경로(있으면 단일 파일 락 대상)
 * @property {boolean} active    true=메모리 마운트, false=디스크(언마운트)
 * @property {number}  lastUsed  마지막 사용 시각(ms)
 * @property {object}  state     모듈이 복원에 쓰는 가벼운 상태(스크롤 위치 등)
 */

export const tabs = writable(/** @type {Tab[]} */ ([]));
export const activeTabId = writable(null);
// 분할 화면에서 우측 패널에 표시할 탭 id(없으면 단일 화면)
export const splitTabId = writable(null);

let seq = 1;
const newId = () => `t${seq++}_${Date.now()}`;

/** 새 탭 열기. singleton/exclusiveFile 규칙을 강제한다. */
export function openTab({ module, title, file = undefined, state = {} }) {
  const list = get(tabs);

  // singleton: 이미 열려 있으면 그 탭으로 포커스
  if (meta(module)?.singleton) {
    const existing = list.find((t) => t.module === module);
    if (existing) return focus(existing.id);
  }
  // exclusiveFile: 같은 파일이 열려 있으면 그 탭으로 포커스
  if (file && meta(module)?.exclusiveFile) {
    const existing = list.find((t) => t.module === module && t.file === file);
    if (existing) return focus(existing.id);
  }

  const tab = {
    id: newId(), module, title, file,
    active: true, lastUsed: Date.now(), state,
  };
  tabs.update((ts) => [...ts, tab]);
  focus(tab.id);
  persist();
  return tab.id;
}

/** 코어 화면(메인/설정) 전용 헬퍼. */
export function openCore(kind) {
  const title = kind === "settings" ? "설정" : "메인";
  const list = get(tabs);
  const existing = list.find((t) => t.module === kind);
  if (existing) return focus(existing.id);
  return openTab({ module: kind, title });
}

/** 탭 포커스: 활성화하고 lastUsed 갱신. */
export function focus(id) {
  activeTabId.set(id);
  tabs.update((ts) =>
    ts.map((t) => (t.id === id ? { ...t, active: true, lastUsed: Date.now() } : t))
  );
  persist();
  return id;
}

/** 탭 닫기. 닫은 게 활성탭이면 인접 탭으로 포커스 이동. */
export function closeTab(id) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const next = list[idx + 1] ?? list[idx - 1];
  tabs.set(list.filter((t) => t.id !== id));
  if (get(splitTabId) === id) splitTabId.set(null);
  if (get(activeTabId) === id) activeTabId.set(next ? next.id : null);
  persist();
}

/** 우측 분할 패널에 탭 띄우기(같은 탭이면 분할 해제). */
export function toggleSplit(id) {
  splitTabId.update((cur) => (cur === id ? null : id));
}

/** 모듈이 자기 상태를 갱신할 때 사용(스크롤 위치 등 가벼운 것만). */
export function patchState(id, patch) {
  tabs.update((ts) =>
    ts.map((t) => (t.id === id ? { ...t, state: { ...t.state, ...patch }, lastUsed: Date.now() } : t))
  );
  persist();
}

/** 유휴 탭을 비활성(언마운트)로 내린다. 활성/분할 중인 탭은 제외. */
export function sweepIdle() {
  const now = Date.now();
  const keepActive = get(activeTabId);
  const keepSplit = get(splitTabId);
  tabs.update((ts) =>
    ts.map((t) => {
      if (t.id === keepActive || t.id === keepSplit) return t;
      if (t.active && now - t.lastUsed > IDLE_MS) return { ...t, active: false };
      return t;
    })
  );
}

// --- 세션 영속화 ---

let saveTimer = null;
function persist() {
  // 잦은 호출을 모아 디스크 쓰기를 줄인다.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const snapshot = {
      tabs: get(tabs),
      activeTabId: get(activeTabId),
      splitTabId: get(splitTabId),
    };
    try { await ipc.saveSession(JSON.stringify(snapshot)); } catch {}
  }, 300);
}

/** 시작 시 세션 복원. 복원된 탭은 일단 비활성(디스크)으로 두고, 포커스 탭만 활성화. */
export async function restoreSession() {
  try {
    const raw = await ipc.loadSession();
    if (!raw) return false;
    const snap = JSON.parse(raw);
    const restored = (snap.tabs ?? []).map((t) => ({ ...t, active: false }));
    tabs.set(restored);
    splitTabId.set(snap.splitTabId ?? null);
    if (snap.activeTabId && restored.some((t) => t.id === snap.activeTabId)) {
      focus(snap.activeTabId);
    } else if (restored[0]) {
      focus(restored[0].id);
    }
    // id 시퀀스 충돌 방지
    seq = restored.length + 1;
    return restored.length > 0;
  } catch {
    return false;
  }
}
