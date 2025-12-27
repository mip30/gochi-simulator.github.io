import {
  newGameState, newCharacter, MAX_CHARS,
  monthToYearMonth, MBTI_LIST, zodiacOptions,
} from "./sim/state.js";
import { runOneMonth, applyChoice } from "./sim/engine.js";
import { renderAll } from "./ui/render.js";
import { showRelationsModal } from "./ui/relations_modal.js";
import { appendLogs, clearLogs } from "./ui/log.js";

const WORKER_URL = "https://YOUR_WORKER.your-subdomain.workers.dev"; // 내장

const LS_KEY = "raising_sim_save_v3";
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
  modalRoot: document.getElementById("modalRoot"),
};

let state = loadFromLocal() ?? newGameState();
state.settings.workerUrl = WORKER_URL;

const handlers = {
  onAddChar: () => {
    if (!state.setupUnlocked) return;
    if (state.characters.length >= MAX_CHARS) return;

    state.characters.push(newCharacter({
      name: `캐릭터${state.characters.length + 1}`,
      mbti: "INFP",
      zodiacBlessing: null,
      birthM: 1,
      birthD: 1,
    }));
    rerender();
  },

  onOpenRelations: (fromId) => {
    showRelationsModal({
      rootEl: els.modalRoot,
      state,
      fromId,
      setupUnlocked: state.setupUnlocked,
      onChangePreset: (toId, presetId) => {
        if (!state.setupUnlocked) return;
        state.relations[`${fromId}->${toId}`].preset = presetId;
        rerender();
      },
    });
  },

  onUpdateCharSetup: (id, patch) => {
    if (!state.setupUnlocked) return;
    const c = state.characters.find(x => x.id === id);
    if (!c) return;

    // setup only
    if (patch.name != null) c.name = String(patch.name).slice(0, 20) || c.name;
    if (patch.mbti != null) c.mbti = patch.mbti;
    if (patch.birthM != null) c.birthday.m = Number(patch.birthM);
    if (patch.birthD != null) c.birthday.d = Number(patch.birthD);

    // 별자리 축복은 “고정 선택”도 가능하게(원하면)
    if (patch.zodiac != null) c.zodiac = patch.zodiac;

    rerender();
  },

  onRemoveChar: (id) => {
    if (!state.setupUnlocked) return;
    if (state.characters.length === 1) return;
    state.characters = state.characters.filter(c => c.id !== id);

    // 관계도 정리
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
    // 로그 엔트리에 붙어있는 버튼 처리
    const entry = state.log.entries.find(e => e.id === entryId);
    if (!entry || entry.choiceMade) return;
    entry.choiceMade = choiceTag;
    applyChoice(state, entry, choiceTag);
    saveToLocal(state);
    rerender();
  },
};

function ensureRelations() {
  // 단방향: A->B, B->A 각각 보장
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

  // setup hint
  if (state.setupUnlocked) {
    els.setupHint.textContent = "초기 설정 단계: 캐릭터/관계를 정한 뒤 ‘이번 달 진행’을 누르면 잠깁니다.";
  } else {
    els.setupHint.textContent = "진행 중: 캐릭터/관계 설정은 잠겨 있습니다.";
  }

  renderAll(state, els, handlers);

  // 로그 렌더
  appendLogs(els.logBox, state, handlers);
}

els.btnAddChar.addEventListener("click", handlers.onAddChar);

els.btnNew.addEventListener("click", () => {
  if (!confirm("새 게임을 시작할까요? (저장되지 않은 진행은 사라집니다)")) return;
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
  // 스케줄 수집
  const schedules = {};
  for (const c of state.characters) {
    const sel = els.scheduleBox.querySelector(`select[data-sel="${c.id}"]`);
    schedules[c.id] = sel?.value ?? "rest";
  }

  // 첫 진행 시 setup 잠금
  if (state.setupUnlocked) {
    state.setupUnlocked = false;
  }

  // 엔진 진행(템플릿 이벤트 + 관계 이벤트 + 생일 + 별자리 + 12월 대회)
  const result = runOneMonth(state, schedules);

  // AI 이벤트를 “추가로” 많이 붙임(월당 N개)
  if (state.settings.useGemini && state.settings.workerUrl && !state.settings.workerUrl.includes("YOUR_WORKER")) {
    const extraN = 3 + Math.min(3, state.characters.length); // 빈도 증가
    const aiEntries = await fetchAiEventsBatch(state, schedules, extraN).catch(() => []);
    result.newLogEntries.push(...aiEntries);
  }

  // 로그 누적
  state.log.entries.push(...result.newLogEntries);
  state.monthIndex = result.nextMonthIndex;
  state.money = result.nextMoney;

  saveToLocal(state);
  rerender();

  // 로그 맨 아래로
  els.logBox.scrollTop = els.logBox.scrollHeight;
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
  const { year, month } = monthToYearMonth(state.monthIndex);
  const payload = {
    kind: "event",
    year, month,
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

  // log entry 형태로 맞춤
  return {
    id: card.id || `ai_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: "이벤트",
    ym: { year, month },
    title: card.title || "이벤트",
    text: card.narration || "",
    dialogues: card.dialogues || [],
    choices: card.choices || [],
    meta: { source: "ai", ...card.meta },
    choiceMade: null,
  };
}

rerender();
