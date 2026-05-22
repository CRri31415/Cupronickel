// modules/textext/render.js
// 평문/마크다운 조각을 받아 TeX와 SMILES를 렌더한 HTML로 변환한다.
//
// 처리 순서:
//   1) ```smiles ... ``` 블록을 추출해 분자 그림(canvas→이미지)으로 치환
//   2) $$..$$ (디스플레이 수식)와 $..$ (인라인 수식)을 KaTeX로 렌더
//   3) 나머지 텍스트는 HTML 이스케이프
//
// KaTeX는 오프라인에서 동작(폰트/CSS 번들). smiles-drawer는 canvas에 그린다.

import katex from "katex";
import "katex/dist/katex.min.css";
import SmilesDrawer from "smiles-drawer";

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// SMILES 문자열 → PNG data URL (오프라인, canvas 사용)
function smilesToDataUrl(smiles) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 300; canvas.height = 200;
    const drawer = new SmilesDrawer.Drawer({ width: 300, height: 200 });
    let url = "";
    SmilesDrawer.parse(smiles.trim(), (tree) => {
      drawer.draw(tree, canvas, "light", false);
      url = canvas.toDataURL("image/png");
    }, () => { url = ""; });
    return url;
  } catch { return ""; }
}

/**
 * @param {string} src 원본 텍스트
 * @returns {Promise<string>} 렌더된 HTML
 */
export async function renderExtended(src) {
  let text = String(src);

  // 1) ```smiles 코드블록
  text = text.replace(/```smiles\s*([\s\S]*?)```/g, (_, code) => {
    const url = smilesToDataUrl(code);
    return url
      ? `<div class="smiles"><img alt="SMILES" src="${url}"/></div>`
      : `<pre class="smiles-error">SMILES 파싱 실패: ${escapeHtml(code)}</pre>`;
  });

  // 2) 수식을 임시 토큰으로 빼두고 나머지를 이스케이프한 뒤 되돌린다.
  const math = [];
  // $$..$$ (디스플레이)
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    math.push({ tex, display: true });
    return `\u0000M${math.length - 1}\u0000`;
  });
  // $..$ (인라인) — 단, $$는 위에서 이미 처리됨
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
    math.push({ tex, display: false });
    return `\u0000M${math.length - 1}\u0000`;
  });

  // smiles로 만든 <div>...</div>는 보존해야 하므로, HTML 조각을 토큰으로 분리
  const html = [];
  text = text.replace(/<div class="smiles">[\s\S]*?<\/div>|<pre class="smiles-error">[\s\S]*?<\/pre>/g, (m) => {
    html.push(m);
    return `\u0000H${html.length - 1}\u0000`;
  });

  // 3) 나머지 이스케이프
  text = escapeHtml(text);

  // 토큰 복원: 수식
  text = text.replace(/\u0000M(\d+)\u0000/g, (_, i) => {
    const { tex, display } = math[Number(i)];
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch {
      return escapeHtml((display ? "$$" : "$") + tex + (display ? "$$" : "$"));
    }
  });
  // 토큰 복원: SMILES HTML
  text = text.replace(/\u0000H(\d+)\u0000/g, (_, i) => html[Number(i)]);

  return text;
}
