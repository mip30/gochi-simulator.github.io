// main.js
import { newGameState, newCharacter, MAX_CHARS, newRelation, relationKey, getZodiac } from "./sim/state.js";
import { runOneMonth } from "./sim/engine.js";
import { renderAll } from "./ui/render.js";
import { showScriptModal } from "./ui/modal.js";

// --- BOOT INDICATOR (콘솔 없이 실행 여부 확인용) ---
const boot = document.createElement("div");
boot.style.position = "fixed";
boot.style.right = "12px";
boot.style.bottom = "12px";
boot.style.padding = "6px 10px";
boot.style.border = "1px solid #2a2f45";
boot.style.borderRadius = "10px";
boot.style.background = "#151823";
boot.style.color = "#e7e7e7";
boot.style.fontSize = "12px";
boot.style.zIndex = "999999";
boot.textContent = "JS 로딩됨";
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(boot));

window.addEventListener("error", (e) => {
  boot.textContent = "JS 에러: " + (e.message || "unknown");
  boot.style.background = "#3a1420";
});
window.addEventListener("unhandledrejection", (e) => {
  boot.textContent = "Promise 에러: " + (e.reason?.message || String(e.reason));
  boot.style.background = "#3a1420";
});


/**
 * 1) Worker URL 내장
 * 아래 값을 본인 Worker URL로 바꿔서 커밋하면 됩니다.
 * 예: https://raising-sim-gemini.abcde.workers.dev
 */
const WORKER_URL = "https://gochi-simulator.madeinpain30.workers.dev";

const els = {
  btnNew: document.getElementById("btnNew"),
  btnSave: document.getElementById("btnSave"),
  btnLoad: document.getElementById("btnLoad"),
  btnExport: document.getElementById("btnExport"),
  btnAddChar: document.getElementById("btnAddChar"),
  btnRun: document.getElementById("btnRun"),
  chkGemini: document.getElementById("chkGemini"),
  charList: document.getElementById("charList"),
  relBox: document.getElementById("relBox"),
  scheduleBox: document.getElementById("scheduleBox"),
  statsBox: document.getElementById("statsBox"),
  timeBox: document.getElementById("timeBox"),
  moneyBox: document.getElementById("moneyBox"),
  modalRoot: document.getElementById("modalRoot"),
};

let state = loadFromLocal() ?? newGameState();
state.settings.workerUrl = WORKER_URL; // 내장 적용

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
  renderAll(state, els, handlers);
}

const handlers = {
  onEditChar: (id) => {
    const c = state.characters.find(x => x.id === id);
    if (!c) return;

    const name = prompt("이름", c.name) ?? c.name;
    const mbti = (prompt("MBTI (예: INFP)", c.mbti) ?? c.mbti).toUpperCase();
    const m = Number(prompt("생일 월 (1-12)", String(c.birthday.m)) ?? c.birthday.m);
    const d = Number(prompt("생일 일 (1-31)", String(c.birthday.d)) ?? c.birthday.d);

    c.name = name.trim() || c.name;
    c.mbti = mbti.trim() || c.mbti;
    c.birthday.m = Number.isFinite(m) ? m : c.birthday.m;
    c.birthday.d = Number.isFinite(d) ? d : c.birthday.d;
    c.zodiac = getZodiac(c.birthday.m, c.birthday.d);

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
  if (!confirm("새 게임을 시작할까요? (현재 진행은 사라집니다)")) return;
  state = newGameState();
  state.settings.workerUrl = WORKER_URL;
  rerender();
});

els.btnSave.addEventListener("click", () => {
  saveToLocal(state);
  alert("저장했습니다.");
});

els.btnLoad.addEventListener("click", () => {
  const loaded = loadFromLocal();
  if (!loaded) { alert("저장 데이터가 없습니다."); return; }
  state = loaded;
  state.settings.workerUrl = WORKER_URL;
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

  const name = prompt("이름", `캐릭터${state.characters.length+1}`) ?? "";
  const mbti = (prompt("MBTI (예: INFP)", "INFP") ?? "INFP").toUpperCase();
  const m = Number(prompt("생일 월 (1-12)", "1") ?? "1");
  const d = Number(prompt("생일 일 (1-31)", "1") ?? "1");

  state.characters.push(newCharacter({
    name: name.trim() || `캐릭터${state.characters.length+1}`,
    mbti,
    birthM: m,
    birthD: d
  }));
  ensureRelationsExist();
  rerender();
});

els.chkGemini.addEventListener("change", () => {
  state.settings.useGemini = els.chkGemini.checked;
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
      if (!url || url.includes("YOUR_WORKER")) return null;
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
  const payload = {
    monthIndex: state.monthIndex,
    money: state.money,
    characters: state.characters.map(c => ({
      id: c.id, name: c.name, mbti: c.mbti, zodiac: c.zodiac,
      stats: c.stats,
      schedule: schedulesByCharId[c.id] ?? "rest",
    })),
    relations: Object.entries(state.relations).map(([k,v]) => ({
      key:k, stage:v.stage, affinity:v.affinity, trust:v.trust, tension:v.tension, romance:v.romance, meta:v.meta
    })),
  };

  const res = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Worker error");
  return await res.json();
}

// ------------------- local save -------------------
const LS_KEY = "raising_sim_save_v2_kr";
function saveToLocal(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
function loadFromLocal() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
