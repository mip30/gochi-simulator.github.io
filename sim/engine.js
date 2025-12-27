import { monthToYearMonth, periodFromMonthIndex, clamp } from "./state.js";
import { applySchedule, applyBirthday, evolveRelation } from "./rules.js";

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function entry({ title, text, dialogues = [], choices = [], meta = {}, period }) {
  return {
    id: id("e"),
    title,
    text,
    dialogues,
    choices,
    choiceMade: null,
    meta,
    period, // ✅ 기간 단위 표시용
  };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

  // 2개월치 스케줄 적용(각 캐릭터당 2번)
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

  // 생일: 이 2개월 안에 생일 월이 포함되면
  const monthsInPeriod = [period.start.month, period.end.month];
  for (const c of state.characters) {
    if (monthsInPeriod.includes(c.birthday.m)) {
      applyBirthday(state, c);
      const others = state.characters.filter(x => x.id !== c.id).map(x => x.name);
      newLogEntries.push(birthdayEntry(c, others, period));
    }
  }

  // 개인 이벤트: 캐릭터당 1~2개(2개월이라 조금 넉넉하게)
  for (const c of state.characters) {
    newLogEntries.push(randomPersonalEvent(c, period));
    if (Math.random() < 0.6) newLogEntries.push(randomPersonalEvent(c, period));
  }

  // 관계 이벤트/단계 변화(단방향)
  for (const from of state.characters) {
    for (const to of state.characters) {
      if (from.id === to.id) continue;
      const key = `${from.id}->${to.id}`;
      const rel = state.relations[key];
      if (!rel) continue;

      // 드리프트(2개월치로 약간 더)
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

  // 12월 대회: 기간에 12월이 포함되면
  if (monthsInPeriod.includes(12)) {
    const extras = ["레온", "미라", "카일", "하나", "세라"];
    const roster = [...state.characters.map(c => c.name)];
    while (roster.length < 6) roster.push(extras[Math.floor(Math.random() * extras.length)]);
    newLogEntries.push(entry({
      period,
      title: `연말 대회 (참가: ${roster.join(", ")})`,
      text: "연말. 분위기가 들끓는다. 선택은 세 가지.",
      dialogues: state.characters.map(c => ({ speaker: c.name, line: mbtiLine(c.mbti, "선택") })).slice(0, 3),
      choices: [
        { tag:"A", label:"공격적으로 간다" },
        { tag:"B", label:"안전하게 간다" },
        { tag:"C", label:"상황을 본다" },
      ],
      meta: { kind:"tournament" }
    }));
  }

  // 다음 기간(2개월)
  const nextMonthIndex = clamp(state.monthIndex + 2, 0, 120);
  return { newLogEntries, nextMonthIndex, nextMoney: state.money };
}
