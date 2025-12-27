// sim/state.js
export const MAX_CHARS = 4;

export const SCHEDULE_IDS = ["study", "work", "rest", "art", "train"];

export const REL_PRESETS = [
  { id: "strangers", label: "초면" },
  { id: "rivals", label: "라이벌" },
  { id: "family", label: "가족" },
  { id: "crush", label: "짝사랑" },
];

export function uid(prefix="c") {
  return `${prefix}_${Math.random().toString(16).slice(2,10)}${Date.now().toString(16).slice(-4)}`;
}

export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

export function getZodiac(m, d) {
  const z = [
    ["염소자리", 1, 19], ["물병자리", 2, 18], ["물고기자리", 3, 20],
    ["양자리", 4, 19], ["황소자리", 5, 20], ["쌍둥이자리", 6, 20],
    ["게자리", 7, 22], ["사자자리", 8, 22], ["처녀자리", 9, 22],
    ["천칭자리", 10, 22], ["전갈자리", 11, 21], ["사수자리", 12, 21]
  ];
  return (d <= z[m-1][2]) ? z[m-1][0] : z[(m)%12][0];
}

export function newCharacter({ name="주인공", birthM=1, birthD=1, mbti="INTJ" } = {}) {
  const id = uid("c");
  return {
    id,
    name,
    birthday: { m: clamp(birthM,1,12), d: clamp(birthD,1,31) },
    zodiac: getZodiac(clamp(birthM,1,12), clamp(birthD,1,31)),
    mbti: mbti.toUpperCase(),
    stats: { intellect: 10, charm: 10, strength: 10, art: 10, morality: 10, stress: 10 },
    skills: {
      study: { level: 0, exp: 0 },
      work:  { level: 0, exp: 0 },
      rest:  { level: 0, exp: 0 },
      art:   { level: 0, exp: 0 },
      train: { level: 0, exp: 0 },
    },
    flags: {},
  };
}

export function relationKey(aId, bId) {
  return [aId, bId].sort().join("|");
}

export function newRelation(presetId="strangers", meta={}) {
  if (presetId === "rivals") {
    return { affinity: -10, trust: 20, tension: 45, romance: 0, stage: "rivals", meta };
  }
  if (presetId === "family") {
    return { affinity: 35, trust: 55, tension: 10, romance: 0, stage: "family", meta };
  }
  if (presetId === "crush") {
    return { affinity: 15, trust: 25, tension: 15, romance: 35, stage: "crush", meta };
  }
  return { affinity: 0, trust: 10, tension: 10, romance: 0, stage: "strangers", meta };
}

export function newGameState() {
  const c1 = newCharacter({ name: "주인공", birthM: 1, birthD: 1, mbti: "INTJ" });
  return {
    version: 2,
    monthIndex: 0, // 0..119
    money: 100,
    characters: [c1],
    relations: {},
    lastRun: null,
    settings: { useGemini: false, workerUrl: "" },
  };
}

export function monthToYearMonth(monthIndex) {
  const year = Math.floor(monthIndex / 12) + 1;   // 1..10
  const month = (monthIndex % 12) + 1;            // 1..12
  return { year, month };
}

export function isBirthdayMonth(state, char) {
  const { month } = monthToYearMonth(state.monthIndex);
  return month === char.birthday.m;
}
