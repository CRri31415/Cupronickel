// lib/core/api.js
// ─────────────────────────────────────────────────────────────────────────
// 모듈용 안정 API (C 방향의 핵심).
//
// 모듈은 코어 내부(ipc.js, tabs.js 등)를 직접 import 하지 않는다.
// 대신 이 파일이 노출하는 버전 고정 객체 `cn`만 사용한다.
// 이렇게 분리해 두면:
//   - 코어 내부 구현이 바뀌어도 모듈은 영향받지 않는다.
//   - 나중에 모듈을 외부 플러그인(B 방향)으로 떼어낼 때, 모듈에
//     이 `cn` 객체만 주입해 주면 코드를 거의 고치지 않고 옮길 수 있다.
//
// API_VERSION: 호환성 계약. 깨는 변경이 생기면 major를 올리고,
// 모듈 매니페스트의 apiVersion과 대조해 경고할 수 있다.
// ─────────────────────────────────────────────────────────────────────────

import { ipc } from "./ipc.js";
import { getTextExt } from "./textext.js";

export const API_VERSION = "1.0";

/**
 * 모듈에 주입되는 API 객체.
 * @typedef {Object} CupronickelApi
 * @property {string} version
 * @property {ModuleStorage} storage   모듈 전용 폴더 한정 파일 입출력
 * @property {TextExtApi}    text      텍스트 범용 확장 호출(있으면 적용, 없으면 통과)
 * @property {ExportApi}     exporter  이미지 등 내보내기 헬퍼
 */

/**
 * 모듈 폴더(예: graph/)로 범위가 한정된 저장소를 만든다.
 * 모듈은 자기 폴더 밖 경로를 신경 쓸 필요가 없다.
 * @param {string} moduleKey  "graph", "note" 등
 */
function makeStorage(moduleKey) {
  // 모듈 폴더 기준 상대경로 → 데이터 루트 기준 상대경로
  const scope = (rel) => `${moduleKey}/${rel}`.replace(/\/+/g, "/");

  /** @typedef {Object} ModuleStorage */
  return {
    /** 텍스트 읽기. 없으면 null. */
    async readText(rel) {
      try { return await ipc.readText(scope(rel)); }
      catch { return null; }
    },
    /** 텍스트 쓰기(상위 폴더 자동 생성). */
    writeText(rel, contents) {
      return ipc.writeText(scope(rel), contents);
    },
    /** JSON 편의 헬퍼. */
    async readJson(rel, fallback = null) {
      const raw = await this.readText(rel);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    writeJson(rel, value) {
      return this.writeText(rel, JSON.stringify(value));
    },
  };
}

/**
 * 텍스트 범용 확장 API.
 * 텍스트 확장 모듈이 설치돼 있으면 그 변환기를 호출하고,
 * 없으면 원문을 그대로 돌려준다(기획서: "설치돼 있다면 호출하여 사용").
 */
const textApi = {
  /** 확장 설치 여부 */
  available() { return getTextExt() != null; },
  /**
   * 평문/마크다운 조각을 확장 처리(TeX, SMILES 등)한 HTML로 변환.
   * 확장 미설치 시 입력을 안전하게 이스케이프한 텍스트만 반환.
   * @param {string} src
   * @returns {Promise<string>} HTML 문자열
   */
  async render(src) {
    const ext = getTextExt();
    if (!ext) return escapeHtml(src);
    return ext.render(src);
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

/** 내보내기 헬퍼. SVG 보드를 PNG로 저장 등. */
const exporter = {
  /**
   * SVG 요소를 PNG 데이터URL로 렌더한다(브라우저 캔버스 사용, 오프라인 가능).
   * @param {SVGSVGElement} svgEl
   * @param {number} scale  해상도 배율
   * @returns {Promise<string>} data:image/png;base64,...
   */
  svgToPngDataUrl(svgEl, scale = 2) {
    return new Promise((resolve, reject) => {
      const xml = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const w = svgEl.viewBox.baseVal.width || svgEl.clientWidth;
        const h = svgEl.viewBox.baseVal.height || svgEl.clientHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  },

  /** 데이터URL을 사용자가 선택한 위치에 PNG 파일로 저장(저장 대화상자). */
  async savePng(dataUrl, suggestedName = "export.png") {
    return ipc.savePngDataUrl(dataUrl, suggestedName);
  },
};

/**
 * 특정 모듈을 위한 API 인스턴스를 만든다.
 * Workspace가 모듈 컴포넌트를 마운트할 때 prop으로 주입한다.
 * @param {string} moduleKey
 * @returns {CupronickelApi}
 */
export function makeApi(moduleKey) {
  return {
    version: API_VERSION,
    storage: makeStorage(moduleKey),
    text: textApi,
    exporter,
  };
}
