// modules/note/markdown.js
// ───────────────────────────────────────────────────────────────────────
// 노트 전용 마크다운 렌더러. 기획서가 지정한 문법만 지원한다.
//
// 지원:  # 문단(헤딩) / - · * 리스트 / **bold** __bold__ / *it* _it_ /
//        > 인용블록 / ``` 코드블록(하이라이팅 없음) / [^] 각주 /
//        ![] 이미지(파일명만) / [[..]] 문서간 링크 / 생 URL 자동 링크
// 미지원: 표, 가로줄, 인터넷 하이퍼링크( [](url) 형태 )
//
// 인라인 텍스트는 텍스트 범용 확장(cn.text)이 설치돼 있으면 그쪽으로 넘긴다.
// 그렇지 않으면 자체 이스케이프만 한다.
// ───────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// 인라인 처리: bold/italic, 생 URL, 문서간 링크, 이미지, 각주 참조.
// onLink/onImage 콜백으로 노트별 경로 처리를 위임한다.
function inline(text, ctx) {
  let t = esc(text);

  // 이미지 ![alt](파일명) — 파일명만, 같은 폴더 기준 상대경로로 변환
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, file) => {
    const src = ctx.imageSrc(file.trim());
    return `<img alt="${alt}" src="${src}" />`;
  });

  // 문서간 링크 [[노트이름]] 또는 [[노트이름|표시]]
  t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const text = label || target;
    return `<a class="wikilink" data-target="${esc(target.trim())}">${esc(text)}</a>`;
  });

  // 각주 참조 [^id]
  t = t.replace(/\[\^([^\]]+)\]/g, (_, id) => `<sup class="fnref">[${esc(id)}]</sup>`);

  // 굵게: **..** 또는 __..__
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // 기울임: *..* 또는 _.._
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  // 생 URL 자동 링크(인터넷 하이퍼링크 문법 대체). http(s)만.
  t = t.replace(/(^|[\s(])((https?:\/\/)[^\s<)]+)/g, (m, pre, url) =>
    `${pre}<a class="url" href="${url}" data-extlink="1">${url}</a>`);

  return t;
}

/**
 * 노트 마크다운을 HTML로 변환.
 * @param {string} md
 * @param {object} ctx { imageSrc(file)->src }
 * @returns {string} HTML
 */
export function renderMarkdown(md, ctx) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  const footnotes = []; // {id, html}
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 코드블록 ```
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // 닫는 ```
      // smiles 등은 텍스트 확장이 처리하도록 원형 유지(노트 렌더 후 cn.text가 다시 훑음)
      if (lang === "smiles") {
        out.push("```smiles\n" + buf.join("\n") + "\n```");
      } else {
        out.push(`<pre class="code"><code>${esc(buf.join("\n"))}</code></pre>`);
      }
      continue;
    }

    // 각주 정의: [^id]: 내용
    const fnDef = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (fnDef) { footnotes.push({ id: fnDef[1], text: fnDef[2] }); i++; continue; }

    // 헤딩 # ~ ######
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2], ctx)}</h${lvl}>`); i++; continue; }

    // 인용블록 >
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${buf.map((l) => inline(l, ctx)).join("<br>")}</blockquote>`);
      continue;
    }

    // 리스트 - 또는 *
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        buf.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""), ctx)}</li>`);
        i++;
      }
      out.push(`<ul>${buf.join("")}</ul>`);
      continue;
    }

    // 빈 줄
    if (line.trim() === "") { i++; continue; }

    // 일반 문단(연속 줄 묶음)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" &&
           !/^(#{1,6}\s|>|\s*[-*]\s|```)/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p>${buf.map((l) => inline(l, ctx)).join("<br>")}</p>`);
  }

  // 각주 모음
  if (footnotes.length) {
    const items = footnotes.map((f) => `<li id="fn-${esc(f.id)}"><sup>${esc(f.id)}</sup> ${inline(f.text, ctx)}</li>`);
    out.push(`<hr class="fn-sep"/><ol class="footnotes">${items.join("")}</ol>`);
  }

  return out.join("\n");
}
