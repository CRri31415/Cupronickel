// lib/core/ipc.js
// Tauri 백엔드 명령을 감싸는 얇은 래퍼.
// 브라우저(vite dev, Tauri 미연결)에서도 UI를 볼 수 있도록 메모리 폴백을 둔다.

const hasTauri = typeof window !== "undefined" && "__TAURI__" in window;

// 폴백 저장소(개발용). 실제 앱에서는 사용되지 않는다.
const memFiles = new Map();

async function invoke(cmd, args) {
  if (hasTauri) {
    const { invoke } = window.__TAURI__.tauri;
    return invoke(cmd, args);
  }
  // --- dev 폴백 ---
  switch (cmd) {
    case "init_storage": return "(dev)/Cupronickel";
    case "read_text": {
      const v = memFiles.get(args.rel);
      if (v === undefined) throw new Error("not found");
      return v;
    }
    case "write_text": memFiles.set(args.rel, args.contents); return;
    case "save_session": memFiles.set("app/session.json", args.json); return;
    case "load_session": return memFiles.get("app/session.json") ?? "";
    case "list_modules": return [];
    case "install_module":
    case "uninstall_module": return;
    case "save_png": {
      // dev 폴백: 다운로드로 대체
      const a = document.createElement("a");
      a.href = args.dataUrl; a.download = args.name || "export.png"; a.click();
      return args.name || "export.png";
    }
    default: throw new Error("unknown command: " + cmd);
  }
}

export const ipc = {
  init: () => invoke("init_storage"),
  readText: (rel) => invoke("read_text", { rel }),
  writeText: (rel, contents) => invoke("write_text", { rel, contents }),
  saveSession: (json) => invoke("save_session", { json }),
  loadSession: () => invoke("load_session"),
  listModules: () => invoke("list_modules"),
  installModule: (key) => invoke("install_module", { key }),
  uninstallModule: (key) => invoke("uninstall_module", { key }),
  // SVG에서 만든 PNG 데이터URL을 사용자가 고른 위치에 저장(저장 대화상자).
  savePngDataUrl: (dataUrl, name) => invoke("save_png", { dataUrl, name }),
};
