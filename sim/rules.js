// sim/rules.js
import { clamp } from "./state.js";

export const SCHEDULES = {
  study: { label: "공부",  base: { intellect: +3, stress: +2 }, money: 0 },
  work:  { label: "노동",  base: { stress: +3 }, money: +50 },
  rest:  { label: "휴식",  base: { stress: -4 }, money: 0 },
  art:   { label: "예술",  base: { art: +3, charm: +1, stress: +1 }, money: 0 },
  train: { label: "훈련",  base: { strength: +3, stress: +2 }, money: 0 },
};

export function expNeed(level) {
  return 6 + level * 2;
}

export function skillBonus(level) {
  return Math.floor(level / 2);
}

export function applySchedule(state, char, scheduleId) {
  const s = SCHEDULES[scheduleId];
  if (!s) return;

  const skill = char.skills[scheduleId];
  const bonus = skillBonus(skill.level);

  for (const [k, v] of Object.entries(s.base)) {
    if (k === "stress") {
      char.stats.stress = clamp(char.stats.stress + v, 0, 100);
    } else {
      char.stats[k] = clamp((char.stats[k] ?? 0) + v + (k !== "morality" ? bonus : 0), 0, 100);
    }
  }

  state.money = clamp(state.money + (s.money ?? 0) + (scheduleId === "work" ? bonus * 10 : 0), 0, 999999);

  skill.exp += 1;
  const need = expNeed(skill.level);
  if (skill.exp >= need) {
    skill.exp -= need;
    skill.level += 1;
  }
}

export function applyBirthday(state, char) {
  char.stats.stress = clamp(char.stats.stress - 6, 0, 100);
  char.stats.charm = clamp(char.stats.charm + 1, 0, 100);
  state.money = clamp(state.money - 20, 0, 999999);
}

export function evolveRelation(rel) {
  if (rel.stage === "strangers" && rel.affinity >= 15 && rel.trust >= 25) rel.stage = "friends";
  if (rel.stage === "friends" && rel.affinity >= 35 && rel.trust >= 45 && rel.tension <= 50) rel.stage = "close";

  if ((rel.tension >= 85) || (rel.trust <= 10)) rel.stage = "broken";

  if (rel.stage === "rivals" && rel.tension <= 25 && rel.affinity >= 10) rel.stage = "friends";
}

export function monthlyRelationDrift(rel, context) {
  if (context.sameGroup) { rel.trust += 2; rel.affinity += 1; }
  if (context.growthGap) { rel.tension += 2; }
  if (context.anyHighStress) { rel.tension += 2; rel.trust -= 1; }
  if (context.isRivals) { rel.tension += 1; rel.affinity -= 1; }

  rel.affinity = clamp(rel.affinity, -100, 100);
  rel.trust = clamp(rel.trust, 0, 100);
  rel.tension = clamp(rel.tension, 0, 100);
  rel.romance = clamp(rel.romance, 0, 100);
}
