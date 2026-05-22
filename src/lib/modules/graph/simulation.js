// modules/graph/simulation.js
// ─────────────────────────────────────────────────────────────────────────
// 힘 기반 레이아웃(force-directed). Obsidian 그래프 뷰와 유사한 동작.
//
// 작용하는 힘(기획서):
//   1) 척력  — 모든 노드 쌍이 서로 밀어낸다(쿨롱 유사, 거리 제곱 반비례).
//   2) 중심력 — 모든 노드가 보드 중심으로 약하게 당겨진다(흩어짐 방지).
//   3) 인력  — 간선으로 연결된 노드끼리 추가로 당겨진다(용수철).
//   척력과 인력이 평형을 이뤄 연결된 노드는 가까운 거리를 유지한다.
//
// 격자 고정(pinned) 노드는 힘을 받지 않고 좌표가 고정된다.
// 코어/UI와 독립된 순수 로직이라 유지보수가 쉽다.
// ─────────────────────────────────────────────────────────────────────────

// 기본 물리 상수. 필요 시 보드별로 덮어쓸 수 있다.
export const DEFAULTS = {
  repulsion: 9000,   // 척력 세기
  centerPull: 0.012, // 중심으로 향하는 힘
  springK: 0.02,     // 간선 용수철 상수
  springLen: 110,    // 간선의 자연 길이
  damping: 0.85,     // 속도 감쇠(0~1, 클수록 더 오래 움직임)
  maxSpeed: 30,      // 한 스텝 최대 이동량(폭주 방지)
};

/**
 * 한 스텝 시뮬레이션을 진행해 노드 좌표를 갱신한다(제자리 수정).
 * @param {Array} nodes  [{id,x,y,vx,vy,pinned}, ...]
 * @param {Array} edges  [{from,to}, ...] (방향/굵기는 물리에 영향 없음)
 * @param {{w:number,h:number}} bounds 보드 크기(중심 계산용)
 * @param {object} cfg   물리 상수(DEFAULTS 일부 덮어쓰기)
 * @returns {number} 이번 스텝의 총 운동량(수렴 판단에 사용)
 */
export function step(nodes, edges, bounds, cfg = {}) {
  const C = { ...DEFAULTS, ...cfg };
  const cx = bounds.w / 2;
  const cy = bounds.h / 2;

  // id → 노드 빠른 조회
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 누적 힘 초기화
  for (const n of nodes) { n.fx = 0; n.fy = 0; }

  // 1) 척력: 모든 노드 쌍
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { d2 = 0.01; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
      const force = C.repulsion / d2;
      const d = Math.sqrt(d2);
      const ux = dx / d, uy = dy / d;
      a.fx += ux * force; a.fy += uy * force;
      b.fx -= ux * force; b.fy -= uy * force;
    }
  }

  // 2) 중심력
  for (const n of nodes) {
    n.fx += (cx - n.x) * C.centerPull;
    n.fy += (cy - n.y) * C.centerPull;
  }

  // 3) 간선 인력(용수철)
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const force = C.springK * (d - C.springLen);
    const ux = dx / d, uy = dy / d;
    a.fx += ux * force; a.fy += uy * force;
    b.fx -= ux * force; b.fy -= uy * force;
  }

  // 적분: 속도 갱신 → 위치 갱신. pinned 노드는 건너뛴다.
  let energy = 0;
  for (const n of nodes) {
    if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
    n.vx = (n.vx + n.fx) * C.damping;
    n.vy = (n.vy + n.fy) * C.damping;
    // 속도 제한
    const sp = Math.hypot(n.vx, n.vy);
    if (sp > C.maxSpeed) { n.vx = (n.vx / sp) * C.maxSpeed; n.vy = (n.vy / sp) * C.maxSpeed; }
    n.x += n.vx;
    n.y += n.vy;
    energy += n.vx * n.vx + n.vy * n.vy;
  }
  return energy;
}

/** 노드를 가장 가까운 격자점에 스냅(격자 고정용). */
export function snapToGrid(node, gridSize = 40) {
  node.x = Math.round(node.x / gridSize) * gridSize;
  node.y = Math.round(node.y / gridSize) * gridSize;
  node.vx = 0; node.vy = 0;
}
