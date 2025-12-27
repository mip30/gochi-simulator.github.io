import { clamp } from "./state.js";

export const SCHEDULES = {
  study: { label: "공부",  base: { intellect: +3, stress: +2 }, money: 0 },
  work:  { label: "노동",  base: { stress: +3 }, money: +50 },
  rest:  { label: "휴식",  base: { stress: -4 }, money: 0 },
  art:   { label: "예술",  base: { art: +3, charm: +1, stress: +1 }, money: 0 },
  train: { label: "훈련",  base: { strength: +3, stress: +2 }, money: 0 },
};

export function expNeed(level) { return 6 + level * 2; }
export function skillBonus(level) { return Math.floor(level / 2); }

// MBTI별 “성공 가중치” (스케줄 성공/실패 랜덤)
export function mbtiScheduleBias(mbti, scheduleId) {
  const m = (mbti || "").toUpperCase();

  // 간단 가중치: 1.0이 기본, 높을수록 성공확률↑
  const bias = {
    study: 1.0, work: 1.0, rest: 1.0, art: 1.0, train: 1.0,
  };

  // 대충 성향: N/F는 예술, T/J는 공부/훈련, S는 노동 안정, P는 휴식/즉흥
  if (m.includes("N")) bias.art += 0.15;
  if (m.includes("F")) bias.art += 0.10;
  if (m.includes("T")) bias.study += 0.10;
  if (m.includes("J")) bias.train += 0.10;
  if (m.includes("S")) bias.work += 0.10;
  if (m.includes("P")) bias.rest += 0.10;

  return bias[scheduleId] ?? 1.0;
}

// 별자리 보정(가볍게) — 실제 증가량은 내부 적용, 텍스트에는 언급 금지
export function zodiacBias(zodiac, scheduleId) {
  const z = zodiac || "";
  if (z === "사자자리" && scheduleId === "work") return 1.10;
  if (z === "처녀자리" && scheduleId === "study") return 1.10;
  if (z === "물고기자리" && scheduleId === "art") return 1.12;
  if (z === "염소자리" && scheduleId === "train") return 1.10;
  if (z === "천칭자리" && scheduleId === "rest") return 1.06;
  return 1.0;
}

export function rollSuccess(prob) {
  const p = Math.max(0.05, Math.min(0.95, prob));
  return Math.random() < p;
}

// 스케줄 적용(성공/실패 반영)
export function applySchedule(state, char, scheduleId) {
  const s = SCHEDULES[scheduleId];
  if (!s) return { ok: true };

  const skill = char.skills[scheduleId];
  const bonus = skillBonus(skill.level);

  const baseProb = 0.62; // 기본 성공률
  const prob = baseProb * mbtiScheduleBias(char.mbti, scheduleId) * zodiacBias(char.zodiac, scheduleId);
  const ok = rollSuccess(prob);

  // 성공이면 base 그대로, 실패면 완화(스트레스는 조금 더 올라가거나, 증가폭 감소)
  const mult = ok ? 1.0 : 0.45;

  for (const [k, v] of Object.entries(s.base)) {
    const delta = Math.round(v * mult);
    if (k === "stress") char.stats.stress = clamp(char.stats.stress + delta + (ok ? 0 : 1), 0, 100);
    else char.stats[k] = clamp((char.stats[k] ?? 0) + delta + (ok ? bonus : 0), 0, 100);
  }

  // 돈 (실패면 보상 적게)
  const moneyDelta = Math.round((s.money ?? 0) * (ok ? 1.0 : 0.6));
  state.money = clamp(state.money + moneyDelta + (scheduleId === "work" ? (ok ? bonus * 10 : bonus * 5) : 0), 0, 999999);

  // 숙련도 (실패라도 경험은 쌓임)
  skill.exp += ok ? 2 : 1;
  const need = expNeed(skill.level);
  if (skill.exp >= need) {
    skill.exp -= need;
    skill.level += 1;
  }

  return { ok, prob };
}

export function applyBirthday(state, char) {
  // 텍스트에 수치 언급 금지. 내부로만 처리.
  char.stats.stress = clamp(char.stats.stress - 6, 0, 100);
  char.stats.charm = clamp(char.stats.charm + 1, 0, 100);
  state.money = clamp(state.money - 20, 0, 999999);
}

// 관계 단계 변화: “변화 시 이벤트 반드시”는 엔진에서 처리
export function evolveRelation(rel) {
  const prev = rel.stage;

  // preset 기반 출발점
  // stage 후보: 초면/친구/친밀/라이벌/가족/짝사랑/연인/파트너/파국
  if (prev === "초면" && rel.affinity >= 15 && rel.trust >= 25) rel.stage = "친구";
  if (prev === "친구" && rel.affinity >= 35 && rel.trust >= 45 && rel.tension <= 50) rel.stage = "친밀";

  if (rel.preset === "라이벌" && rel.tension <= 25 && rel.affinity >= 10) rel.stage = "친구";
  if (rel.preset === "가족" && prev !== "가족") rel.stage = "가족";

  if (prev !== "파국" && (rel.tension >= 85 || rel.trust <= 8)) rel.stage = "파국";

  // 연애 루트(가족/파국 제외)
  if (rel.stage !== "가족" && rel.stage !== "파국") {
    if (rel.romance >= 60 && rel.affinity >= 45 && rel.trust >= 55 && rel.tension <= 35) {
      if (rel.stage !== "연인" && Math.random() < 0.25) rel.stage = "연인";
    }
    if (rel.stage === "연인" && rel.romance >= 80 && rel.trust >= 70 && Math.random() < 0.15) rel.stage = "파트너";
  }

  return { prev, next: rel.stage, changed: prev !== rel.stage };
}
