import { clamp, periodFromMonthIndex } from "./state.js";
import { applySchedule, applyBirthday, evolveRelation } from "./rules.js";

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function entry({ title, text, dialogues = [], choices = [], meta = {}, period }) {
  return {
    id: id("e"),
    title,
    text,
    dialogues,
    choices,
    choiceMade: null,
    meta,
    period,
  };
}

// ---------------- MBTI 대사 ----------------
function mbtiLine(mbti, ctx) {
  const m = (mbti || "").toUpperCase();
  const by = {
    INTJ: { 행동:["정리하고 끝내자.","우선순위부터.","낭비는 싫어."], 선택:["리스크를 계산했어.","변수는 줄이자.","답은 이미 나왔어."] },
    INFP: { 행동:["마음이 걸리긴 해.","그래도 해볼게.","상처는 남기기 싫어."], 선택:["후회 없는 쪽으로.","그냥 지나치긴 싫어.","마음이 가는 대로."] },
    ENFP: { 행동:["좋아, 가자!","일단 해보자!","재밌어지겠는데?"], 선택:["지금이 타이밍!","재밌는 쪽으로!","바로 간다."] },
    ISTJ: { 행동:["정해진 순서대로.","기본부터.","흔들리지 말자."], 선택:["확실한 쪽으로.","괜한 일은 피하자.","규칙대로." ] },
    ISFP: { 행동:["조용히 처리하자.","분위기 보고.","손에 잡히는 것부터."], 선택:["느낌이 중요해.","괜찮아 보이면 가.","부딪히긴 싫어." ] },
  };
  const pack = by[m] || { 행동:["알겠어.","가자."], 선택:["음…","그렇게 하자."] };
  return pick(pack[ctx] || pack.행동);
}

function labelSchedule(id) {
  return ({ study:"공부", work:"노동", rest:"휴식", art:"예술", train:"훈련" }[id] ?? id);
}

// ---------------- 선택 결과(스토리 + 수치 변동 표시) ----------------
function formatDelta(delta, moneyDelta) {
  const parts = [];
  const map = { intellect:"지능", charm:"매력", strength:"체력", art:"예술", morality:"도덕", stress:"스트레스" };
  for (const [k, v] of Object.entries(delta || {})) {
    if (!v) continue;
    const sign = v > 0 ? "+" : "";
    parts.push(`${map[k] || k} ${sign}${v}`);
  }
  if (moneyDelta) {
    const sign = moneyDelta > 0 ? "+" : "";
    parts.push(`소지금 ${sign}${moneyDelta}`);
  }
  return parts.length ? parts.join(", ") : "변화 없음";
}

function applyDeltaToChar(c, delta) {
  for (const [k, v] of Object.entries(delta || {})) {
    if (c.stats[k] == null) continue;
    c.stats[k] = clamp(c.stats[k] + v, 0, 100);
  }
}

function storyAfterChoice(tag) {
  const base = {
    A: ["바로 움직였다. 결과가 금방 따라왔다.", "한 번 더 나섰다. 공기가 바뀌었다.", "결정은 빨랐고, 판이 넘어갔다."],
    B: ["속도를 늦췄다. 대신 사고는 줄었다.", "조용히 넘겼다. 여운만 남았다.", "한 발 물러섰다. 분위기가 가라앉았다."],
    C: ["선이 좀 넘어갔다. 반응이 갈렸다.", "무리했다. 흔들림도 같이 왔다.", "욕심이 섞였다. 득실이 동시에 났다."],
  };
  return pick(base[tag] || ["결정을 내렸다."]);
}

/**
 * ✅ main.js가 필요로 하는 export
 * - 선택지 클릭 시: 후속 로그(결과) 반환 + state 반영
 */
export function applyChoice(state, entryRef, tag) {
  const period = entryRef.period || periodFromMonthIndex(state.monthIndex, 2);
  const meta = entryRef.meta || {};

  // 기본 결과 로그
  let title = "결과";
  let text = storyAfterChoice(tag);
  let dialogues = [];
  let delta = {};
  let moneyDelta = 0;

  // 개인/생일 이벤트 등 공통 처리
  if (meta.kind === "event") {
    const c = state.characters.find(x => x.id === meta.charId);
    if (c) {
      dialogues = [{ speaker: c.name, line: mbtiLine(c.mbti, "선택") }];
      title = `${c.name} — 선택의 결과`;

      // 간단한 선택별 변화(로그에 표시 요구사항 충족)
      if (tag === "A") delta = { morality: +2, stress: +1 };
      if (tag === "B") delta = { stress: -2 };
      if (tag === "C") { delta = { stress: +2 }; moneyDelta = +20; }

      applyDeltaToChar(c, delta);
      if (moneyDelta) state.money = clamp(state.money + moneyDelta, 0, 999999);
      text += `\n\n[변동] ${formatDelta(delta, moneyDelta)}`;
    }
    return [entry({ period, title, text, dialogues, meta: { kind: "result", from: entryRef.id } })];
  }

  // 관계 이벤트
  if (meta.kind === "relation_change" && meta.relKey) {
    const rel = state.relations[meta.relKey];
    if (rel) {
      const [fromId, toId] = meta.relKey.split("->");
      const from = state.characters.find(c => c.id === fromId);
      const to = state.characters.find(c => c.id === toId);

      title = `관계 — ${from?.name || "?"} → ${to?.name || "?"}`;
      if (from) dialogues.push({ speaker: from.name, line: mbtiLine(from.mbti, "선택") });
      if (to) dialogues.push({ speaker: to.name, line: mbtiLine(to.mbti, "행동") });

      let dRel = { trust: 0, affinity: 0, tension: 0, romance: 0 };
      if (tag === "A") dRel = { trust: +3, affinity: +2, tension: -1, romance: +1 };
      if (tag === "B") dRel = { trust: +1, affinity: 0, tension: 0, romance: 0 };
      if (tag === "C") dRel = { trust: -1, affinity: -1, tension: +3, romance: 0 };

      rel.trust = clamp(rel.trust + dRel.trust, 0, 100);
      rel.affinity = clamp(rel.affinity + dRel.affinity, -100, 100);
      rel.tension = clamp(rel.tension + dRel.tension, 0, 100);
      rel.romance = clamp(rel.romance + dRel.romance, 0, 100);

      const evo = evolveRelation(rel);

      text += `\n\n[변동] 신뢰 ${dRel.trust>=0?"+":""}${dRel.trust}, 호감 ${dRel.affinity>=0?"+":""}${dRel.affinity}, 긴장 ${dRel.tension>=0?"+":""}${dRel.tension}, 연정 ${dRel.romance>=0?"+":""}${dRel.romance}`;
      if (evo.changed) text += `\n[관계] "${evo.prev}" → "${evo.next}"`;
    }
    return [entry({ period, title, text, dialogues, meta: { kind:"result", from: entryRef.id } })];
  }

  // 대회
  if (meta.kind === "tournament") {
    title = "연말 대회 — 결과";
    if (tag === "A") moneyDelta = +80;
    if (tag === "B") moneyDelta = +40;
    if (tag === "C") moneyDelta = 0;
    state.money = clamp(state.money + moneyDelta, 0, 999999);
    text = storyAfterChoice(tag) + `\n\n[변동] 소지금 ${moneyDelta>=0?"+":""}${moneyDelta}`;
    return [entry({ period, title, text, dialogues: [], meta: { kind:"result", from: entryRef.id } })];
  }

  // 기타
  return [entry({ period, title, text: text + `\n\n[변동] 변화 없음`, dialogues, meta: { kind:"result", from: entryRef.id } })];
}

// ---------------- 2개월 단위 진행 ----------------
function randomPersonalEvent(c, period) {
  const pool = [
    { title:"수상한 소문을 들었다", a:"파고든다", b:"넘긴다", c:"이용한다" },
    { title:"누군가 도움을 청했다", a:"돕는다", b:"모른 척한다", c:"조건을 건다" },
    { title:"적을 마주쳤다", a:"피한다", b:"맞선다", c:"말로 푼다" },
    { title:"충동이 올라왔다", a:"참는다", b:"조금 산다", c:"질러버린다" },
    { title:"작은 오해가 생겼다", a:"바로 푼다", b:"시간을 둔다", c:"그대로 둔다" },
  ];
  const p = pick(pool);
  return entry({
    period,
    title: `${p.title} (${c.name})`,
    text: "선택하면 바로 다음 장면으로 넘어간다.",
    dialogues: [{ speaker: c.name, line: mbtiLine(c.mbti, "선택") }],
    choices: [
      { tag:"A", label:p.a },
      { tag:"B", label:p.b },
      { tag:"C", label:p.c },
    ],
    meta: { kind:"event", charId:c.id, event:"personal" }
  });
}

function birthdayEntry(c, others, period) {
  const who = others.length ? pick(others) : "누군가";
  return entry({
    period,
    title: `생일 (${c.name})`,
    text: "달력에 표시된 날. 분위기가 잠깐 바뀐다.",
    dialogues: [
      { speaker: who, line: "생일이잖아. 오늘만큼은 좀 쉬어." },
      { speaker: c.name, line: mbtiLine(c.mbti, "행동") },
    ],
    choices: [
      { tag:"A", label:"같이 보낸다" },
      { tag:"B", label:"조용히 정리한다" },
      { tag:"C", label:"대충 넘긴다" },
    ],
    meta: { kind:"event", charId:c.id, event:"birthday" }
  });
}

function relationEvent(from, to, relKey, rel, period) {
  const pool = [
    { title:"같이 움직일 일이 생겼다", a:"호흡 맞춘다", b:"각자 한다", c:"경쟁한다" },
    { title:"말이 한 번 엇갈렸다", a:"사과한다", b:"넘긴다", c:"맞받는다" },
    { title:"의외로 통하는 부분이 보였다", a:"인정한다", b:"모른 척", c:"비튼다" },
  ];
  const p = pick(pool);
  return entry({
    period,
    title: `${p.title} — ${from.name} → ${to.name}`,
    text: `현재: ${rel.stage} / 프리셋: ${rel.preset}`,
    dialogues: [
      { speaker: from.name, line: mbtiLine(from.mbti, "선택") },
      { speaker: to.name, line: mbtiLine(to.mbti, "행동") },
    ],
    choices: [
      { tag:"A", label:p.a },
      { tag:"B", label:p.b },
      { tag:"C", label:p.c },
    ],
    meta: { kind:"relation_change", relKey }
  });
}

function relationStageChange(from, to, relKey, prev, next, period) {
  return entry({
    period,
    title: `관계 변화 — ${from.name} → ${to.name}`,
    text: `분위기가 "${prev}"에서 "${next}"로 넘어갔다.`,
    dialogues: [
      { speaker: from.name, line: mbtiLine(from.mbti, "선택") },
      { speaker: to.name, line: mbtiLine(to.mbti, "선택") },
    ],
    choices: [
      { tag:"A", label:"솔직하게 말한다" },
      { tag:"B", label:"거리 유지" },
      { tag:"C", label:"날 세운다" },
    ],
    meta: { kind:"relation_change", relKey }
  });
}

export function runOnePeriod(state, schedulesByCharId) {
  const period = periodFromMonthIndex(state.monthIndex, 2);
  const newLogEntries = [];

  // 2개월치 스케줄 효과 2회 적용
  for (const c of state.characters) {
    const scheduleId = schedulesByCharId[c.id] ?? "rest";
    const r1 = applySchedule(state, c, scheduleId);
    const r2 = applySchedule(state, c, scheduleId);

    const okText =
      (r1.ok && r2.ok) ? "흐름 좋음"
      : (!r1.ok && !r2.ok) ? "자잘하게 꼬임"
      : "들쭉날쭉";

    newLogEntries.push(entry({
      period,
      title: `${c.name} — ${labelSchedule(scheduleId)} (2개월: ${okText})`,
      text: "두 달 동안 같은 일을 반복했다. 남는 건 분위기와 습관이다.",
      dialogues: [{ speaker: c.name, line: mbtiLine(c.mbti, "행동") }],
      meta: { kind:"action", charId:c.id, scheduleId }
    }));
  }

  // 생일(기간 2개월에 포함되면)
  const monthsInPeriod = [period.start.month, period.end.month];
  for (const c of state.characters) {
    if (monthsInPeriod.includes(c.birthday.m)) {
      applyBirthday(state, c);
      const others = state.characters.filter(x => x.id !== c.id).map(x => x.name);
      newLogEntries.push(birthdayEntry(c, others, period));
    }
  }

  // 개인 이벤트
  for (const c of state.characters) {
    newLogEntries.push(randomPersonalEvent(c, period));
    if (Math.random() < 0.6) newLogEntries.push(randomPersonalEvent(c, period));
  }

  // 관계 이벤트(단방향)
  for (const from of state.characters) {
    for (const to of state.characters) {
      if (from.id === to.id) continue;
      const key = `${from.id}->${to.id}`;
      const rel = state.relations[key];
      if (!rel) continue;

      if (from.stats.stress >= 80) { rel.tension = clamp(rel.tension + 3, 0, 100); rel.trust = clamp(rel.trust - 2, 0, 100); }
      if (Math.random() < 0.45) rel.affinity = clamp(rel.affinity + 1, -100, 100);
      if (Math.random() < 0.35) rel.trust = clamp(rel.trust + 1, 0, 100);
      if (Math.random() < 0.30) rel.tension = clamp(rel.tension + 1, 0, 100);
      if (rel.preset === "짝사랑" && Math.random() < 0.45) rel.romance = clamp(rel.romance + 2, 0, 100);
      if (rel.preset === "라이벌" && Math.random() < 0.45) rel.tension = clamp(rel.tension + 2, 0, 100);
      if (rel.preset === "가족") rel.stage = "가족";

      const evo = evolveRelation(rel);
      if (evo.changed) newLogEntries.push(relationStageChange(from, to, key, evo.prev, evo.next, period));
      if (Math.random() < 0.45) newLogEntries.push(relationEvent(from, to, key, rel, period));
    }
  }

  // 다음 기간(2개월)
  const nextMonthIndex = clamp(state.monthIndex + 2, 0, 120);
  return { newLogEntries, nextMonthIndex, nextMoney: state.money };
}
