import { monthToYearMonth, relationKey, isBirthdayMonth, clamp } from "./state.js";
import { applySchedule, applyBirthday, evolveRelation, monthlyRelationDrift } from "./rules.js";

// ---------- Script templates (B style: narration + dialogues) ----------
const MBTI_TONE = {
  INTJ: ["precise", "quiet resolve"],
  INFP: ["gentle", "idealistic"],
  ENFP: ["bright", "impulsive warmth"],
  ISTJ: ["steady", "disciplined"],
};

function toneFor(mbti) {
  return MBTI_TONE[mbti] ?? ["calm", "grounded"];
}

function taskScriptCard(state, char, scheduleId) {
  const { year, month } = monthToYearMonth(state.monthIndex);
  const [t1, t2] = toneFor(char.mbti);

  const lines = {
    study: {
      title: "A page turns quietly",
      narr: `Year ${year}, Month ${month}. The desk lamp hums. ${char.name} keeps going—${t1}, with ${t2}.`,
      dlg: [
        { speaker: char.name, line: "If I focus now, it will matter later." },
      ],
    },
    work: {
      title: "Hands that learn by doing",
      narr: `Year ${year}, Month ${month}. The day asks for effort and returns coins. ${char.name} works through it, even if the body complains.`,
      dlg: [
        { speaker: char.name, line: "One more shift. Then I can breathe." },
      ],
    },
    rest: {
      title: "A small pause, a real one",
      narr: `Year ${year}, Month ${month}. The world does not collapse when ${char.name} rests. For once, the shoulders loosen.`,
      dlg: [
        { speaker: char.name, line: "It's okay. Recovery is also progress." },
      ],
    },
    art: {
      title: "Color finds a reason",
      narr: `Year ${year}, Month ${month}. A line becomes a shape. A shape becomes a mood. ${char.name} lets feeling lead the hand.`,
      dlg: [
        { speaker: char.name, line: "If I can express it, I can survive it." },
      ],
    },
    train: {
      title: "The body keeps its promises",
      narr: `Year ${year}, Month ${month}. Breath, heartbeat, repetition. ${char.name} trains—slowly, stubbornly—until strength feels real.`,
      dlg: [
        { speaker: char.name, line: "Again. Just one more time." },
      ],
    },
  };

  const pack = lines[scheduleId] ?? lines.rest;

  return {
    id: `task_${char.id}_${state.monthIndex}`,
    type: "TASK",
    title: `${pack.title} (${char.name} — ${scheduleId})`,
    narration: pack.narr,
    dialogues: pack.dlg,
    choices: [],
    meta: { charIds: [char.id], scheduleId }
  };
}

function birthdayCard(state, char, celebrants=[]) {
  const { year, month } = monthToYearMonth(state.monthIndex);
  const who = celebrants.length ? celebrants.join(", ") : "someone";
  return {
    id: `bday_${char.id}_${state.monthIndex}`,
    type: "BIRTHDAY",
    title: `Birthday Month (${char.name})`,
    narration: `Year ${year}, Month ${month}. The calendar marks ${char.name}'s birthday. The air feels slightly kinder.`,
    dialogues: [
      { speaker: who, line: "Happy birthday. You made it to another page." },
      { speaker: char.name, line: "…Thank you. I won't forget this." },
    ],
    choices: [
      { tag: "A", label: "Accept the celebration (bond +)" },
      { tag: "B", label: "Keep it modest (stable)" },
      { tag: "C", label: "Push it away (tension +)" },
    ],
    meta: { charIds: [char.id], event: "birthday" }
  };
}

function relationEventCard(state, a, b, kind, rel) {
  const { year, month } = monthToYearMonth(state.monthIndex);
  const base = {
    bonding: {
      title: "A shared moment",
      narr: `Year ${year}, Month ${month}. Between small routines, ${a.name} and ${b.name} find a thread they can hold together.`,
      dlg: [
        { speaker: a.name, line: "I didn't think you'd understand." },
        { speaker: b.name, line: "Try me." },
      ],
      choices: [
        { tag: "A", label: "Open up (trust +)" },
        { tag: "B", label: "Joke it off (safe)" },
        { tag: "C", label: "Stay guarded (tension +)" },
      ]
    },
    argument: {
      title: "Words that scrape",
      narr: `Year ${year}, Month ${month}. Stress sharpens edges. A small disagreement becomes louder than it should.`,
      dlg: [
        { speaker: a.name, line: "You're not listening." },
        { speaker: b.name, line: "And you're not being fair." },
      ],
      choices: [
        { tag: "A", label: "Apologize first (trust +)" },
        { tag: "B", label: "Take space (tension - later)" },
        { tag: "C", label: "Double down (tension +)" },
      ]
    },
    coop: {
      title: "Two hands, one result",
      narr: `Year ${year}, Month ${month}. They try working together. It could become a habit—or a mistake.`,
      dlg: [
        { speaker: b.name, line: "If we do it together, it'll be faster." },
        { speaker: a.name, line: "…Alright. Let's sync." },
      ],
      choices: [
        { tag: "A", label: "Coordinate carefully (success +)" },
        { tag: "B", label: "Go with the flow (mixed)" },
        { tag: "C", label: "Compete while cooperating (rivalry +)" },
      ]
    }
  }[kind];

  return {
    id: `rel_${a.id}_${b.id}_${state.monthIndex}_${kind}`,
    type: "RELATION",
    title: `${base.title} (${a.name} & ${b.name})`,
    narration: base.narr + ` [Stage: ${rel.stage}]`,
    dialogues: base.dlg,
    choices: base.choices,
    meta: { charIds: [a.id, b.id], kind, relKey: relationKey(a.id,b.id) }
  };
}

// choice effects (code-fixed)
function applyChoiceEffects(state, card, choiceTag) {
  if (!choiceTag) return;
  if (card.type === "BIRTHDAY") {
    // small relationship tweaks with everyone else
    const cid = card.meta.charIds[0];
    for (const other of state.characters) {
      if (other.id === cid) continue;
      const key = relationKey(cid, other.id);
      const rel = state.relations[key];
      if (!rel) continue;
      if (choiceTag === "A") { rel.affinity += 3; rel.trust += 2; rel.tension -= 1; }
      if (choiceTag === "B") { rel.affinity += 1; rel.trust += 1; }
      if (choiceTag === "C") { rel.tension += 4; rel.trust -= 1; }
      evolveRelation(rel);
    }
    return;
  }

  if (card.type === "RELATION") {
    const [aId, bId] = card.meta.charIds;
    const key = relationKey(aId, bId);
    const rel = state.relations[key];
    if (!rel) return;

    if (card.meta.kind === "bonding") {
      if (choiceTag === "A") { rel.trust += 4; rel.affinity += 3; rel.tension -= 1; }
      if (choiceTag === "B") { rel.trust += 2; rel.affinity += 1; }
      if (choiceTag === "C") { rel.tension += 3; }
    }

    if (card.meta.kind === "argument") {
      if (choiceTag === "A") { rel.trust += 3; rel.tension -= 2; rel.affinity += 1; }
      if (choiceTag === "B") { rel.tension -= 1; }
      if (choiceTag === "C") { rel.tension += 4; rel.trust -= 2; rel.affinity -= 2; }
    }

    if (card.meta.kind === "coop") {
      if (choiceTag === "A") { rel.trust += 3; rel.affinity += 1; }
      if (choiceTag === "B") { rel.trust += 1; }
      if (choiceTag === "C") { rel.tension += 2; }
    }

    // romance drift (simple): if conditions good, romance ticks up
    if (rel.stage !== "family" && rel.stage !== "broken") {
      if (rel.affinity >= 40 && rel.trust >= 50 && rel.tension <= 40) rel.romance += 2;
      if (rel.stage === "crush" && rel.romance >= 60 && rel.trust >= 55 && rel.affinity >= 45 && rel.tension <= 35) {
        // auto-confession chance (small)
        if (Math.random() < 0.25) rel.stage = "dating";
      }
      if (rel.stage === "dating" && rel.romance >= 80 && rel.trust >= 70 && Math.random() < 0.15) rel.stage = "partners";
    }

    evolveRelation(rel);
  }
}

// monthly engine
export function runOneMonth(state, schedulesByCharId) {
  const cards = [];
  const snapshotBefore = JSON.parse(JSON.stringify(state));

  // 1) TASK cards for each character (always)
  for (const c of state.characters) {
    const scheduleId = schedulesByCharId[c.id] ?? "rest";
    applySchedule(state, c, scheduleId);
    cards.push(taskScriptCard(state, c, scheduleId));
  }

  // 2) Birthday cards (optional)
  const bdays = state.characters.filter(c => isBirthdayMonth(state, c));
  for (const c of bdays) {
    applyBirthday(state, c);
    const celebrants = state.characters.filter(x => x.id !== c.id).map(x => x.name);
    cards.push(birthdayCard(state, c, celebrants));
  }

  // 3) Relationship drift + possible relation event cards
  if (state.characters.length >= 2) {
    // ensure relation objects exist for all pairs
    for (let i=0; i<state.characters.length; i++) {
      for (let j=i+1; j<state.characters.length; j++) {
        const a = state.characters[i], b = state.characters[j];
        const key = relationKey(a.id, b.id);
        if (!state.relations[key]) {
          state.relations[key] = { affinity: 0, trust: 10, tension: 10, romance: 0, stage: "strangers", meta:{} };
        }

        const rel = state.relations[key];
        const scheduleA = schedulesByCharId[a.id] ?? "rest";
        const scheduleB = schedulesByCharId[b.id] ?? "rest";
        const sameGroup = scheduleA === scheduleB && scheduleA !== "rest";
        const anyHighStress = (a.stats.stress >= 80) || (b.stats.stress >= 80);
        const isRivals = rel.stage === "rivals";

        // crude growth-gap check (compare total stats delta)
        const beforeA = snapshotBefore.characters.find(x=>x.id===a.id);
        const beforeB = snapshotBefore.characters.find(x=>x.id===b.id);
        const deltaA = sumStats(a.stats) - sumStats(beforeA.stats);
        const deltaB = sumStats(b.stats) - sumStats(beforeB.stats);
        const growthGap = Math.abs(deltaA - deltaB) >= 4;

        monthlyRelationDrift(rel, { sameGroup, anyHighStress, isRivals, growthGap });
        evolveRelation(rel);

        // event triggers (keep sparse)
        const p = Math.random();
        if (anyHighStress && p < 0.15) {
          cards.push(relationEventCard(state, a, b, "argument", rel));
        } else if (sameGroup && rel.trust >= 40 && p < 0.20) {
          cards.push(relationEventCard(state, a, b, "coop", rel));
        } else if (rel.affinity >= 20 && p < 0.12) {
          cards.push(relationEventCard(state, a, b, "bonding", rel));
        }
      }
    }
  }

  // 4) Highlight placeholder (Gemini or template)
  cards.push({
    id: `highlight_${state.monthIndex}`,
    type: "HIGHLIGHT_PLACEHOLDER",
    title: "Monthly highlight",
    narration: "",
    dialogues: [],
    choices: [],
    meta: { monthIndex: state.monthIndex }
  });

  // advance time
  state.monthIndex = clamp(state.monthIndex + 1, 0, 120);

  state.lastRun = new Date().toISOString();
  return { state, cards };
}

function sumStats(stats) {
  return Object.values(stats).reduce((a,b)=>a+(Number(b)||0),0);
}

export function applyCardChoice(state, card, choiceTag) {
  applyChoiceEffects(state, card, choiceTag);
}
