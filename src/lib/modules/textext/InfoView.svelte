<script>
  // 텍스트 확장 모듈 안내 화면. 이 모듈은 백그라운드 확장이라 편집 화면이 없다.
  // 설치되면 노트/암기/메모/달력에서 $TeX$ 와 ```smiles 가 자동 렌더된다.
  export let tab;
  export let cn;

  // 미리보기용 샘플
  let preview = "";
  import { onMount } from "svelte";
  onMount(async () => {
    preview = await cn.text.render("질량-에너지 등가: $E = mc^2$\n\n원형 적분: $$\\int_0^{2\\pi} \\sin\\theta\\, d\\theta = 0$$\n\n카페인:\n```smiles\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C\n```");
  });
</script>

<div class="info editable">
  <h2>텍스트 범용 확장</h2>
  <p>이 모듈이 설치되어 있으면, 노트·암기·메모·달력의 텍스트에서 다음이 자동으로 렌더됩니다.</p>
  <ul>
    <li><code>$ ... $</code> — 인라인 TeX 수식</li>
    <li><code>$$ ... $$</code> — 디스플레이 TeX 수식</li>
    <li><code>```smiles</code> 코드블록 — SMILES 분자 구조 렌더링</li>
  </ul>
  <h3>미리보기</h3>
  <div class="preview">{@html preview}</div>
</div>

<style>
  .info { padding: 28px 32px; max-width: 680px; }
  h2 { margin: 0 0 12px; font-weight: 500; }
  h3 { color: var(--text-dim); font-size: 13px; margin: 24px 0 10px; }
  p { color: var(--text); line-height: 1.6; }
  ul { color: var(--text-dim); line-height: 1.9; }
  code { background: var(--surface-2); padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono); }
  .preview { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 18px; line-height: 1.8; }
  .preview :global(.smiles img) { background: #fff; border-radius: 6px; padding: 4px; }
</style>
