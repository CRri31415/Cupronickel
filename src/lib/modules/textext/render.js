// modules/textext/render.js
// 입력 텍스트(평문 또는 이미 렌더된 HTML)에서 TeX와 SMILES만 골라 렌더한다.
//
// 설계: 이 함수는 입력이 이미 HTML일 수 있다고 가정한다(노트 미리보기처럼 마크다운
// 렌더러를 먼저 거친 경우). 따라서 전체를 이스케이프하지 않고, $$..$$, $..$,
// smiles 블록만 찾아 그 부분만 교체한다. 나머지 HTML은 보존한다.
// (이전 버전은 전체를 escape해 <br> 등이 깨지고 헤더가 노출됐다.)

import katex from "katex";
import "katex/dist/katex.min.css";
import SmilesDrawer from "smiles-drawer";

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// SMILES → SVG 문자열. SvgDrawer는 주어진 <svg> 요소에 동기적으로 그리므로
// canvas의 비동기 렌더 타이밍 문제가 없다(카페인 미표시 버그 대응).
function smilesToSvg(smiles) {
  try {
    const drawer = new SmilesDrawer.SvgDrawer({ width: 280, height: 200, padding: 12 });
    // 분리된 SVG 요소를 만들어 거기에 그린 뒤 outerHTML을 가져온다.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "280");
    svg.setAttribute("height", "200");
    let ok = false;
    SmilesDrawer.parse(
      smiles.trim(),
      (tree) => { drawer.draw(tree, svg, "light"); ok = true; },
      (err) => { ok = false; console.warn("SMILES parse error:", err); }
    );
    return ok ? svg.outerHTML : "";
  } catch (e) { console.warn("SMILES draw error:", e); return ""; }
}

export async function renderExtended(input) {
  let text = String(input);

  // 1) ```smiles ... ``` (평문 코드펜스)
  text = text.replace(/```smiles\s*([\s\S]*?)```/g, (_, code) => {
    const svg = smilesToSvg(code);
    return svg ? `<div class="smiles">${svg}</div>`
               : `<pre class="smiles-error">SMILES 파싱 실패: ${escapeHtml(code.trim())}</pre>`;
  });
  // 1-b) 노트 렌더러가 <pre class="code"><code>smiles ...</code></pre> 로 감싼 경우
  text = text.replace(/<pre class="code"><code>smiles\s*([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
    const decoded = code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const svg = smilesToSvg(decoded);
    return svg ? `<div class="smiles">${svg}</div>`
               : `<pre class="smiles-error">SMILES 파싱 실패: ${escapeHtml(decoded.trim())}</pre>`;
  });

  // 2) 디스플레이 수식 $$..$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    try { return katex.renderToString(tex, { displayMode: true, throwOnError: false }); }
    catch { return escapeHtml("$$" + tex + "$$"); }
  });
  // 3) 인라인 수식 $..$
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
    try { return katex.renderToString(tex, { displayMode: false, throwOnError: false }); }
    catch { return escapeHtml("$" + tex + "$"); }
  });

  return text;
}
