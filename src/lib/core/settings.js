// lib/core/settings.js
// 전역 설정. 변경되면 즉시 DOM(:root)에 반영하고 app/settings.json 에 저장한다.

import { writable, get } from "svelte/store";
import { ipc } from "./ipc.js";

// 기본값. 테마 객체는 CSS 변수 키와 1:1 대응한다.
const DEFAULTS = {
  motion: true,                 // 애니메이션 on/off (기획서: 끄면 완전 최적화)
  resolution: "1600x900",       // "1920x1080" | "1600x900" 만 지원
  theme: {
    name: "Cupronickel (어스톤)",
    vars: {
      "--bg": "#1c1a16", "--surface": "#262219", "--surface-2": "#2f2a20",
      "--line": "#3b352a", "--text": "#d8cdb8", "--text-dim": "#9a9079",
      "--accent": "#b08454", "--accent-2": "#6f7d63", "--danger": "#a8694e",
    },
    fontUi: '"Iosevka","Pretendard","Segoe UI",sans-serif',
    fontMono: '"Iosevka","Consolas",monospace',
  },
  editor: { lineNumbers: "hybrid" }, // "hybrid" | "absolute"
};

export const settings = writable(DEFAULTS);

// :root에 테마/모션을 반영한다.
function apply(s) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(s.theme.vars)) root.style.setProperty(k, v);
  root.style.setProperty("--font-ui", s.theme.fontUi);
  root.style.setProperty("--font-mono", s.theme.fontMono);
  root.dataset.motion = s.motion ? "on" : "off";
}

export async function loadSettings() {
  try {
    const raw = await ipc.readText("app/settings.json");
    const parsed = JSON.parse(raw);
    settings.set({ ...DEFAULTS, ...parsed });
  } catch {
    settings.set(DEFAULTS); // 최초 실행
  }
  apply(get(settings));
}

// 부분 갱신 + 즉시 반영 + 저장.
export async function updateSettings(patch) {
  settings.update((s) => ({ ...s, ...patch }));
  const s = get(settings);
  apply(s);
  await ipc.writeText("app/settings.json", JSON.stringify(s, null, 2));
}
