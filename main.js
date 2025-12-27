import {
  newGameState, newCharacter, MAX_CHARS,
  periodFromMonthIndex,
  getZodiacFromBirthday
} from "./sim/state.js";
import { runOnePeriod, applyChoice } from "./sim/engine.js";
import { renderAll } from "./ui/render.js";
import { showRelationsModal } from "./ui/relations_modal.js";
import { appendLogs, clearLogs } from "./ui/log.js";
import { renderChat } from "./ui/chat.js";

const WORKER_URL = "https://gochi-simulator.madeinpain30.workers.dev/";

const LS_KEY = "raising_sim_save_v5";
const saveToLocal = (s) => localStorage.setItem(LS_KEY, JSON.stringify(s));
const loadFromLocal = () => {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const els = {
  btnNew: document.getElementById("btnNew"),
  btnSave: document.getElementById("btnSave"),
  btnLoad: document.getElementById("btnLoad"),
  btnExport: document.getElementById("btnExport"),
  btnAddChar: document.getElementById("btnAddChar"),
  btnRun: document.getElementById("btnRun"),
  btnClearLog: document.getElementById("btnClearLog"),
  chkGemini: document.getElementById("chkGemini"),
  setupHint: document.getElementById("setupHint"),

  charList: document.getElementById("charList"),
  scheduleBox: document.getElementById("scheduleBox"),
  timeBox: document.getElementById("timeBox"),
  moneyBox: document.getElementById("moneyBox"),

  logBox: document.getElementById("logBox"),
  chatControls: document.getElementById("chatControls"),
  chatBox: document.getElementById("chatBox"),

  modalRoot: document.getElementById("modalRoot"),
};

let state = loadFromLocal() ?? newGameState();
state.settings.workerUrl = WORKER_URL;

const handlers = {
  onAddChar: () => {
    if (!state.setupUnlocked) return;
    if (state.characters.length >= MAX_CHARS) return;

    const nc = newCharacter({
      name: `캐릭터${state.characters.length + 1}`,
      mbti: "INFP",
      birthM: 1,
      birthD: 1,
    });
    nc.zodiac = getZodiacFromBirthday(nc.birthday.m, nc.birthday.d);

    state.characters.push(nc);
    ensureRelations();
    rerender();
  },

  onOpenRelations: (fromId) => {
    ensureRelations();
    showRelationsModal({
      rootEl: els.modalRoot,
      state,
      fromId,
      setupUnlocked: state.setupUnlocked,
      // ✅ key로 직접 저장
      onChangePresetByKey: (key, presetId) => {
        if (!state.setupUnlocked) return;
        if (!state.relations[key]) return;
        state.relations[key].preset = presetId;
        saveToLocal(state);
        rerender();
      },
    });
  },

  onUpdateCharSetup: (id, patch) => {
    if (!state.setupUnlocked) return;
    const c = state.characters.find(x => x.id === id);
    if (!c) return;

    if (patch.name != null) c.name = String(patch.name).slice(0, 20) || c.name;
    if (patch.mbti != null) c.mbti = patch.mbti;

    if (patch.birthM != null) c.birthday.m = Number(patch.birthM);
    if (patch.birthD != null) c.birthday.d = Number(patch.birthD);

    c.zodiac = getZodiacFromBirthday(c.birthday.m, c.birthday.d);

    rerender();
  },

  onRemoveChar: (id) => {
    if (!state.setupUnlocked) return;
    if (state.characters.length === 1) return;

    state.characters = state.characters.filter(c => c.id !== id);

    const nextRel = {};
    for (const k of Object.keys(state.relations)) {
      const [from, to] = k.split("->");
      if (from !== id && to !== id) nextRel[k] = state.relations[k];
    }
    state.relations = nextRel;
    ensureRelations();
    rerender();
  },

  onApplyChoice: (entryId, choiceTag) => {
    const entry = state.log.entries.find(e => e.id === entryId);
    if (!entry || entry.choiceMade) return;

    entry.choiceMade = choiceTag;
    const followUps = applyChoice(state, entry, choiceTag) || [];
    if (followUps.length) state.log.entries.push(...followUps);

    saveToLocal(state);
    rerender();
    els.logBox.scrollTop = els.logBox.scrollHeight;
    els.chatBox.scrollTop = els.chatBox.scrollHeight;
  },

  onSetChatPair: (aId, bId) => {
    state.ui.chatPair = { aId, bId };
    saveToLocal(state);
    rerender();
  },
};

function ensureRelations() {
  for (const a of state.characters) {
    for (const b of state.characters) {
      if (a.id === b.id) continue;
      const key = `${a.id}->${b.id}`;
      if (!state.relations[key]) {
        state.relations[key] = {
          preset: "초면",
          stage: "초면",
          affinity: 0,
          trust: 10,
          tension: 10,
          romance: 0,
        };
      }
    }
  }
}

function rerender() {
  ensureRelations();

  els.chkGemini.checked = !!state.settings.useGemini;

  els.setupHint.textContent = state.setupUnlocked
    ? "초기 설정 단계: 캐릭터/관계를 정한 뒤 ‘이번 기간 진행’을 누르면 잠깁니다."
    : "진행 중: 캐릭터/관계 설정은 잠겨 있습니다.";

  renderAll(state, els, handlers);
  appendLogs(els.logBox, state, handlers);

  renderChat(state, els.chatControls, els.chatBox, (aId, bId) => handlers.onSetChatPair(aId, bId));
}

els.btnAddChar.addEventListener("click", handlers.onAddChar);

els.btnNew.addEventListener("click", () => {
  if (!confirm("새 게임을 시작할까요?")) return;
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

  // 저장 호환: 별자리 재계산 + 관계 보정
  for (const c of state.characters) {
    const m = c.birthday?.m ?? 1;
    const d = c.birthday?.d ?? 1;
    c.zodiac = getZodiacFromBirthday(m, d);
  }
  ensureRelations();

  rerender();
});

els.btnExport.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "raising-sim-save.json";
  a.click();
});

els.btnClearLog.addEventListener("click", () => {
  if (!confirm("로그를 비울까요?")) return;
  clearLogs(state);
  saveToLocal(state);
  rerender();
});

els.chkGemini.addEventListener("change", () => {
  state.settings.useGemini = els.chkGemini.checked;
  saveToLocal(state);
  rerender();
});

els.btnRun.addEventListener("click", async () => {
  const schedules = {};
  for (const c of state.characters) {
    const sel = els.scheduleBox.querySelector(`select[data-sel="${c.id}"]`);
    schedules[c.id] = sel?.value ?? "rest";
  }

  if (state.setupUnlocked) state.setupUnlocked = false;

  const result = runOnePeriod(state, schedules);

  // AI 이벤트 (선택): 2개월 기간에 맞춰 조금 늘리되 과도하지 않게
  if (state.settings.useGemini) {
    const extraN = 2 + Math.min(2, state.characters.length);
    const aiEntries = await fetchAiEventsBatch(state, schedules, extraN).catch(() => []);
    result.newLogEntries.push(...aiEntries);
  }

  state.log.entries.push(...result.newLogEntries);
  state.monthIndex = result.nextMonthIndex;
  state.money = result.nextMoney;

  saveToLocal(state);
  rerender();
  els.logBox.scrollTop = els.logBox.scrollHeight;
  els.chatBox.scrollTop = els.chatBox.scrollHeight;
});

async function fetchAiEventsBatch(state, schedules, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = await fetchAiEvent(state, schedules);
    if (e) out.push(e);
  }
  return out;
}

async function fetchAiEvent(state, schedules) {
  const period = periodFromMonthIndex(state.monthIndex, 2);

  const payload = {
    kind: "event",
    period,
    money: state.money,
    characters: state.characters.map(c => ({
      id: c.id,
      name: c.name,
      mbti: c.mbti,
      zodiac: c.zodiac,
      stats: c.stats,
      schedule: schedules[c.id] ?? "rest",
    })),
    relations: Object.entries(state.relations).slice(0, 12).map(([k, v]) => ({ key: k, ...v })),
  };

  const res = await fetch(state.settings.workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;

  const card = await res.json();

  return {
    id: card.id || `ai_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title: card.title || "상황",
    text: card.narration || "",
    dialogues: card.dialogues || [],
    choices: card.choices || [],
    meta: { source: "ai", ...card.meta, kind: "event" },
    choiceMade: null,
    period,
  };
}

rerender();
