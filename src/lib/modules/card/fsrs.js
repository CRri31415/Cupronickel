// modules/card/fsrs.js
// ─────────────────────────────────────────────────────────────────────────
// FSRS(Free Spaced Repetition Scheduler) 간이 구현.
//
// 기획서: 암기 알고리즘은 FSRS를 사용한다. 난이도 피드백은 1~4(클수록 쉬움),
// 쉽다고 평가된 카드는 더 긴 간격 뒤에 다시 나온다.
//
// FSRS의 핵심 상태는 카드마다 다음 셋이다:
//   - stability(S): 기억이 유지되는 정도(클수록 오래 기억). 다음 복습 간격의 기반.
//   - difficulty(D): 카드 자체의 어려움(1~10).
//   - due: 다음 복습 예정일(timestamp).
//
// 평점(rating): 1=Again(다시), 2=Hard(어려움), 3=Good(보통), 4=Easy(쉬움).
//
// 여기서는 공식 FSRS-4.5의 가중치(w)를 사용하되, 구현은 유지보수가 쉽도록
// 핵심 식만 옮긴 간이판이다. 완전한 최적화/파라미터 학습은 범위에서 제외.
// ─────────────────────────────────────────────────────────────────────────

// FSRS-4.5 기본 가중치(공개된 기본값).
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234,
  1.616, 0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

const REQUEST_RETENTION = 0.9; // 목표 기억 유지율(90%)
const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 간격 공식 상수

const DAY = 86400000; // ms

/** 새 카드의 초기 상태(아직 복습 전). */
export function newCardState() {
  return { stability: 0, difficulty: 0, due: Date.now(), reps: 0, lastReview: null };
}

/** 초기 난이도 D0(rating 기반). */
function initDifficulty(rating) {
  return clampD(W[4] - Math.exp(W[5] * (rating - 1)) + 1);
}
/** 초기 안정도 S0(rating별 가중치). */
function initStability(rating) {
  return Math.max(W[rating - 1], 0.1);
}
function clampD(d) { return Math.min(Math.max(d, 1), 10); }

/** 안정도로부터 다음 복습 간격(일)을 구한다. */
function intervalDays(stability) {
  const days = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.max(1, Math.round(days));
}

/** 경과 시간(t)과 안정도(S)로 현재 회상 확률 R. */
function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

/**
 * 카드 상태를 평점으로 갱신해 다음 상태를 돌려준다.
 * @param {object} state newCardState() 형태
 * @param {1|2|3|4} rating
 * @param {number} now  현재 시각(ms)
 */
export function review(state, rating, now = Date.now()) {
  let { stability, difficulty, reps, lastReview } = state;

  if (reps === 0 || stability === 0) {
    // 첫 복습: 초기값 설정
    difficulty = initDifficulty(rating);
    stability = initStability(rating);
  } else {
    const elapsedDays = lastReview ? Math.max(0, (now - lastReview) / DAY) : 0;
    const r = retrievability(elapsedDays, stability);

    // 난이도 갱신
    difficulty = clampD(difficulty - W[6] * (rating - 3));
    // 평균으로의 회귀
    difficulty = clampD(W[7] * initDifficulty(3) + (1 - W[7]) * difficulty);

    if (rating === 1) {
      // Again: 안정도 하락(망각)
      stability = W[11] * Math.pow(difficulty, -W[12]) *
        (Math.pow(stability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
      stability = Math.max(0.1, stability);
    } else {
      // 성공: 안정도 증가
      const hardPenalty = rating === 2 ? W[15] : 1;
      const easyBonus = rating === 4 ? W[16] : 1;
      const inc = Math.exp(W[8]) * (11 - difficulty) * Math.pow(stability, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) * hardPenalty * easyBonus;
      stability = stability * (1 + inc);
    }
  }

  const days = intervalDays(stability);
  return {
    stability,
    difficulty,
    reps: reps + 1,
    lastReview: now,
    due: now + days * DAY,
    lastInterval: days, // UI 표시용
  };
}

/** 카드가 지금 복습 대상인지(due가 지났는지). */
export function isDue(state, now = Date.now()) {
  return (state.due ?? 0) <= now;
}

/** 평점별 예상 다음 간격(일)을 미리 계산해 버튼에 보여주기 위함. */
export function previewIntervals(state, now = Date.now()) {
  return {
    1: review(state, 1, now).lastInterval,
    2: review(state, 2, now).lastInterval,
    3: review(state, 3, now).lastInterval,
    4: review(state, 4, now).lastInterval,
  };
}
