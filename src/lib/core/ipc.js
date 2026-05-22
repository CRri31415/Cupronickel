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
    case "set_window_size": return; // dev(브라우저)에선 무시
    case "list_dir": {
      const prefix = args.rel.endsWith("/") ? args.rel : args.rel + "/";
      const names = new Set();
      for (const k of memFiles.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          const seg = rest.split("/")[0];
          names.add(JSON.stringify({ name: seg, is_dir: rest.includes("/") }));
        }
      }
      return [...names].map((s) => JSON.parse(s));
    }
    case "delete_path": {
      for (const k of [...memFiles.keys()]) {
        if (k === args.rel || k.startsWith(args.rel + "/")) memFiles.delete(k);
      }
      return;
    }
    case "run_command":
      return { stdout: "(dev 모드에서는 명령을 실행하지 않습니다)", stderr: "", code: 0 };
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
  // 창 픽셀 크기를 지정하고 화면 중앙에 배치한다.
  setWindowSize: (width, height) => invoke("set_window_size", { width, height }),
  // 폴더 나열 / 경로 삭제
  listDir: (rel) => invoke("list_dir", { rel }),
  deletePath: (rel) => invoke("delete_path", { rel }),
  runCommand: (project, program, args) => invoke("run_command", { project, program, args }),
};
