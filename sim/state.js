export const MAX_CHARS = 4;

export const SCHEDULE_IDS = ["study", "work", "rest", "art", "train"];

export const REL_PRESETS = [
  { id: "strangers", label: "초면" },
  { id: "rivals", label: "라이벌" },
  { id: "family", label: "가족" },
  { id: "crush", label: "짝사랑(단방향)" },
];

export function uid(prefix="c") {
  return `${prefix}_${Math.random().toString(16).slice(2,10)}${Date.now().toString(16).slice(-4)}`;
}

export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

export function getZodiac(m, d) {
  const z = [
    ["Capricorn", 1, 19], ["Aquarius", 2, 18], ["Pisces", 3, 20],
    ["Aries", 4, 19], ["Taurus", 5, 20], ["Gemini", 6, 20],
    ["Cancer", 7, 22], ["Leo", 8, 22], ["Virgo", 9, 22],
    ["Libra", 10, 22], ["Scorpio", 11, 21], ["Sagittarius", 12, 21]
  ];
  return (d <= z[m-1][2]) ? z[m-1][0] : z[(m)%12][0];
}

export function newCharacter({ name="Hero", birthM=1, birthD=1, mbti="INTJ" } = {}) {
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
  // directed crush is stored in meta.crushFrom
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
  const c1 = newCharacter({ name: "Hero", birthM: 1, birthD: 1, mbti: "INTJ" });
  return {
    version: 1,
    // time: 10 years monthly = 120 turns
    monthIndex: 0, // 0..119
    money: 100,
    characters: [c1],
    relations: {}, // key -> relation object
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
