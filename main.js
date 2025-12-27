import { newGameState, newCharacter, MAX_CHARS, newRelation, relationKey } from "./sim/state.js";
import { runOneMonth } from "./sim/engine.js";
import { renderAll } from "./ui/render.js";
import { showScriptModal } from "./ui/modal.js";

const els = {
  btnNew: document.getElementById("btnNew"),
  btnSave: document.getElementById("btnSave"),
  btnLoad: document.getElementById("btnLoad"),
  btnExport: document.getElementById("btnExport"),
  btnAddChar: document.getElementById("btnAddChar"),
  btnRun: document.getElementById("btnRun"),
  chkGemini: document.getElementById("chkGemini"),
  inpWorkerUrl: document.getElementById("inpWorkerUrl"),
  charList: document.getElementById("charList"),
  relBox: document.getElementById("relBox"),
  scheduleBox: document.getElementById("scheduleBox"),
  statsBox: document.getElementById("statsBox"),
  timeBox: document.getElementById("timeBox"),
  moneyBox: document.getElementById("moneyBox"),
  modalRoot: document.getElementById("modalRoot"),
};

let state = loadFromLocal() ?? newGameState();

function ensureRelationsExist() {
  if (state.characters.length < 2) return;
  for (let i=0;i<state.characters.length;i++) {
    for (let j=i+1;j<state.characters.length;j++) {
      const a = state.characters[i], b = state.characters[j];
      const key = relationKey(a.id,b.id);
      if (!state.relations[key]) state.relations[key] = newRelation("strangers", {});
    }
  }
}

function rerender() {
  ensureRelationsExist();
  els.chkGemini.checked = !!state.settings.useGemini;
  els.inpWorkerUrl.value = state.settings.workerUrl ?? "";
  renderAll(state, els, handlers);
}

const handlers = {
  onEditChar: (id) => {
    const c = state.characters.find(x => x.id === id);
    if (!c) return;

    const name = prompt("Name", c.name) ?? c.name;
    const mbti = (prompt("MBTI (e.g., INFP)", c.mbti) ?? c.mbti).toUpperCase();
    const m = Number(prompt("Birth month (1-12)", String(c.birthday.m)) ?? c.birthday.m);
    const d = Number(prompt("Birth day (1-31)", String(c.birthday.d)) ?? c.birthday.d);

    c.name = name.trim() || c.name;
    c.mbti = mbti.trim() || c.mbti;
    c.birthday.m = isFinite(m) ? m : c.birthday.m;
    c.birthday.d = isFinite(d) ? d : c.birthday.d;
    // recompute zodiac
    // (import avoided: quick recompute via simple mapping)
    // easiest: recreate zodiac by calling small helper in state module would be better, but keep minimal:
    // reload page to recalc? no. We'll do inline:
    const zodiac = (await import("./sim/state.js")).getZodiac(c.birthday.m, c.birthday.d);
    c.zodiac = zodiac;

    rerender();
  },
  onRemoveChar: (id) => {
    if (state.characters.length === 1) return;
    state.characters = state.characters.filter(c => c.id !== id);

    // remove relations with that id
    const newRel = {};
    for (const [k,v] of Object.entries(state.relations)) {
      if (!k.split("|").includes(id)) newRel[k] = v;
    }
    state.relations = newRel;
    rerender();
  },
  onApplyPreset: (key, presetId, crushFromId) => {
    const meta = {};
    if (presetId === "crush") meta.crushFrom = crushFromId;
    state.relations[key] = newRelation(presetId, meta);
    rerender();
  },
};

els.btnNew.addEventListener("click", () => {
  if (!confirm("Start a new game? (Current state will be replaced)")) return;
  state = newGameState();
  rerender();
});

els.btnSave.addEventListener("click", () => {
  saveToLocal(state);
  alert("Saved.");
});

els.btnLoad.addEventListener("click", () => {
  const loaded = loadFromLocal();
  if (!loaded) { alert("No save found."); return; }
  state = loaded;
  rerender();
});

els.btnExport.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "raising-sim-save.json";
  a.click();
});

els.btnAddChar.addEventListener("click", () => {
  if (state.characters.length >= MAX_CHARS) return;

  const name = prompt("Name", `Char${state.characters.length+1}`) ?? "";
  const mbti = (prompt("MBTI (e.g., INFP)", "INFP") ?? "INFP").toUpperCase();
  const m = Number(prompt("Birth month (1-12)", "1") ?? "1");
  const d = Number(prompt("Birth day (1-31)", "1") ?? "1");

  state.characters.push(newCharacter({ name: name.trim() || `Char${state.characters.length+1}`, mbti, birthM: m, birthD: d }));
  ensureRelationsExist();
  rerender();
});

els.chkGemini.addEventListener("change", () => {
  state.settings.useGemini = els.chkGemini.checked;
  rerender();
});

els.inpWorkerUrl.addEventListener("change", () => {
  state.settings.workerUrl = els.inpWorkerUrl.value.trim();
  rerender();
});

els.btnRun.addEventListener("click", async () => {
  // collect schedules
  const schedulesByCharId = {};
  state.characters.forEach(c => {
    const sel = els.scheduleBox.querySelector(`select[data-sel="${c.id}"]`);
    schedulesByCharId[c.id] = sel?.value ?? "rest";
  });

  const result = runOneMonth(state, schedulesByCharId);
  state = result.state;

  const cards = result.cards;

  showScriptModal({
    rootEl: els.modalRoot,
    cards,
    state,
    onNeedHighlight: async () => {
      if (!state.settings.useGemini) return null;
      const url = (state.settings.workerUrl ?? "").trim();
      if (!url) return null;
      try {
        return await fetchHighlightCard(url, state, schedulesByCharId);
      } catch {
        return null;
      }
    },
    onDone: () => rerender(),
  });
});

rerender();

// ------------------- Gemini highlight fetch -------------------
async function fetchHighlightCard(workerUrl, state, schedulesByCharId) {
  // state summary only (keep token use low)
  const payload = {
    monthIndex: state.monthIndex,
    money: state.money,
    characters: state.characters.map(c => ({
      id: c.id, name: c.name, mbti: c.mbti, zodiac: c.zodiac,
      stats: c.stats,
      schedule: schedulesByCharId[c.id] ?? "rest",
    })),
    relations: Object.entries(state.relations).map(([k,v]) => ({ key:k, stage:v.stage, affinity:v.affinity, trust:v.trust, tension:v.tension, romance:v.romance, meta:v.meta })),
  };

  const res = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Worker error");
  const card = await res.json();
  // expected to already match card format
  return card;
}

// ------------------- local save -------------------
const LS_KEY = "raising_sim_save_v1";
function saveToLocal(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
function loadFromLocal() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
