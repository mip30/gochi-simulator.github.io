import { MAX_CHARS, MBTI_LIST, SCHEDULE_IDS, periodFromMonthIndex, ageFromMonthIndex } from "../sim/state.js";
import { SCHEDULES } from "../sim/rules.js";

export function renderAll(state, els, handlers) {
  renderTime(state, els);
  renderChars(state, els, handlers);
  renderSchedules(state, els);
}

function renderTime(state, els) {
  const age = ageFromMonthIndex(state.monthIndex);
  const p = periodFromMonthIndex(state.monthIndex, 2);

  const periodText =
    (p.start.year === p.end.year)
      ? `제 ${p.start.year}년 ${p.start.month}~${p.end.month}월`
      : `제 ${p.start.year}년 ${p.start.month}월 ~ 제 ${p.end.year}년 ${p.end.month}월`;

  els.timeBox.innerHTML = `<div class="kv">
    <div class="muted">나이</div><div>${age}살 (10→20)</div>
    <div class="muted">기간</div><div>${periodText}</div>
  </div>`;

  els.moneyBox.innerHTML = `<div class="kv">
    <div class="muted">소지금</div><div>${state.money}</div>
    <div class="muted">상태</div><div>${state.setupUnlocked ? "설정 가능" : "진행 중(잠김)"}</div>
  </div>`;
}

function statBar(label, val, isStress=false) {
  const v = Math.max(0, Math.min(100, Number(val) || 0));
  const barCls = isStress ? "bar stress" : "bar";
  const badge = isStress ? `<span class="stressBadge">스트레스 ${v}/100</span>` : `<span class="badge">${v}/100</span>`;
  return `
    <div class="statLine">
      <div class="statTop">
        <span>${label}</span>
        ${badge}
      </div>
      <div class="${barCls}">
        <div style="width:${v}%;"></div>
      </div>
    </div>
  `;
}

function renderChars(state, els, handlers) {
  const canAdd = state.setupUnlocked && state.characters.length < MAX_CHARS;
  els.btnAddChar.disabled = !canAdd;

  els.charList.innerHTML = state.characters.map(c => {
    const locked = !state.setupUnlocked;
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between;">
          <div class="row">
            <input data-name="${c.id}" value="${escapeHtml(c.name)}" ${locked ? "disabled":""} style="width:140px;" />
            <select data-mbti="${c.id}" ${locked ? "disabled":""}>
              ${MBTI_LIST.map(m => `<option value="${m}" ${m===c.mbti ? "selected":""}>${m}</option>`).join("")}
            </select>
            <span class="badge">${escapeHtml(c.zodiac)}</span>
          </div>

          <div class="row">
            <button data-rel="${c.id}" ${state.characters.length < 2 ? "disabled":""}>관계</button>
            <button data-del="${c.id}" ${locked || state.characters.length===1 ? "disabled":""}>삭제</button>
          </div>
        </div>

        <div class="row small">
          <span class="muted">생일</span>
          <select data-bm="${c.id}" ${locked ? "disabled":""}>
            ${Array.from({length:12},(_,i)=>i+1).map(m => `<option value="${m}" ${m===c.birthday.m ? "selected":""}>${m}월</option>`).join("")}
          </select>
          <select data-bd="${c.id}" ${locked ? "disabled":""}>
            ${Array.from({length:31},(_,i)=>i+1).map(d => `<option value="${d}" ${d===c.birthday.d ? "selected":""}>${d}일</option>`).join("")}
          </select>
          ${locked ? `<span class="muted">※ 진행 중에는 수정 불가</span>` : `<span class="muted">※ 첫 진행 전까지만 수정 가능</span>`}
        </div>

        <div class="statsGrid">
          ${statBar("스트레스", c.stats.stress, true)}
          ${statBar("지능", c.stats.intellect)}
          ${statBar("매력", c.stats.charm)}
          ${statBar("체력", c.stats.strength)}
          ${statBar("예술", c.stats.art)}
          ${statBar("도덕", c.stats.morality)}
        </div>
      </div>
    `;
  }).join("");

  if (state.setupUnlocked) {
    els.charList.querySelectorAll("input[data-name]").forEach(inp => {
      inp.addEventListener("change", () => handlers.onUpdateCharSetup(inp.getAttribute("data-name"), { name: inp.value }));
    });
    els.charList.querySelectorAll("select[data-mbti]").forEach(sel => {
      sel.addEventListener("change", () => handlers.onUpdateCharSetup(sel.getAttribute("data-mbti"), { mbti: sel.value }));
    });
    els.charList.querySelectorAll("select[data-bm]").forEach(sel => {
      sel.addEventListener("change", () => handlers.onUpdateCharSetup(sel.getAttribute("data-bm"), { birthM: Number(sel.value) }));
    });
    els.charList.querySelectorAll("select[data-bd]").forEach(sel => {
      sel.addEventListener("change", () => handlers.onUpdateCharSetup(sel.getAttribute("data-bd"), { birthD: Number(sel.value) }));
    });
  }

  els.charList.querySelectorAll("button[data-rel]").forEach(btn => {
    btn.addEventListener("click", () => handlers.onOpenRelations(btn.getAttribute("data-rel")));
  });
  els.charList.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => handlers.onRemoveChar(btn.getAttribute("data-del")));
  });
}

function renderSchedules(state, els) {
  els.scheduleBox.innerHTML = state.characters.map(c => `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div><b>${escapeHtml(c.name)}</b> <span class="badge">${c.mbti}</span> <span class="badge">${escapeHtml(c.zodiac)}</span></div>
        <div class="row">
          <select data-sel="${c.id}">
            ${SCHEDULE_IDS.map(id => `<option value="${id}">${SCHEDULES[id].label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="muted small">
        숙련도 — 공부:${c.skills.study.level}, 노동:${c.skills.work.level}, 휴식:${c.skills.rest.level}, 예술:${c.skills.art.level}, 훈련:${c.skills.train.level}
      </div>
    </div>
  `).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
