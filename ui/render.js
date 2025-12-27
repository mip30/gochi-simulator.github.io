// ui/render.js
import { MAX_CHARS, REL_PRESETS, relationKey, SCHEDULE_IDS } from "../sim/state.js";
import { SCHEDULES } from "../sim/rules.js";

export function renderAll(state, els, handlers) {
  renderTime(state, els);
  renderChars(state, els, handlers);
  renderRelations(state, els, handlers);
  renderSchedules(state, els);
  renderStats(state, els);
}

function renderTime(state, els) {
  const year = Math.floor(state.monthIndex / 12) + 1;
  const month = (state.monthIndex % 12) + 1;
  els.timeBox.innerHTML = `<div class="kv">
    <div class="muted">연도</div><div>${year} / 10</div>
    <div class="muted">월</div><div>${month} / 12</div>
    <div class="muted">턴</div><div>${state.monthIndex+1} / 120</div>
  </div>`;
  els.moneyBox.innerHTML = `<div class="kv">
    <div class="muted">소지금</div><div>${state.money}</div>
  </div>`;
}

function renderChars(state, els, handlers) {
  const canAdd = state.characters.length < MAX_CHARS;
  els.btnAddChar.disabled = !canAdd;

  els.charList.innerHTML = state.characters.map(c => `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <b>${c.name}</b>
          <span class="badge">${c.mbti}</span>
          <span class="badge">${c.zodiac}</span>
        </div>
        <div class="row">
          <button data-edit="${c.id}">수정</button>
          <button data-del="${c.id}" ${state.characters.length===1 ? "disabled":""}>삭제</button>
        </div>
      </div>
      <div class="kv">
        <div class="muted">생일</div><div>${c.birthday.m}/${c.birthday.d}</div>
      </div>
    </div>
  `).join("");

  els.charList.querySelectorAll("button[data-edit]").forEach(b => {
    b.addEventListener("click", () => handlers.onEditChar(b.getAttribute("data-edit")));
  });
  els.charList.querySelectorAll("button[data-del]").forEach(b => {
    b.addEventListener("click", () => handlers.onRemoveChar(b.getAttribute("data-del")));
  });
}

function renderRelations(state, els, handlers) {
  if (state.characters.length < 2) {
    els.relBox.innerHTML = `<div class="muted">캐릭터를 한 명 더 추가하면 관계 설정이 활성화됩니다.</div>`;
    return;
  }

  const chars = state.characters;
  const rows = [];
  for (let i=0;i<chars.length;i++) {
    for (let j=i+1;j<chars.length;j++) {
      const a = chars[i], b = chars[j];
      const key = relationKey(a.id,b.id);
      const rel = state.relations[key] ?? { affinity:0, trust:10, tension:10, romance:0, stage:"strangers", meta:{} };
      rows.push({ a,b,key,rel });
    }
  }

  const stageLabel = (s) => ({
    strangers:"초면", friends:"친구", close:"친밀",
    rivals:"라이벌", family:"가족", crush:"짝사랑",
    dating:"연인", partners:"파트너", broken:"파국"
  }[s] ?? s);

  els.relBox.innerHTML = rows.map(r => `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div><b>${r.a.name}</b> ↔ <b>${r.b.name}</b> <span class="badge">${stageLabel(r.rel.stage)}</span></div>
        <div class="row">
          <select data-preset="${r.key}">
            ${REL_PRESETS.map(p => `<option value="${p.id}">${p.label}</option>`).join("")}
          </select>
          <select data-crushfrom="${r.key}" style="display:none;">
            <option value="${r.a.id}">짝사랑 주체: ${r.a.name}</option>
            <option value="${r.b.id}">짝사랑 주체: ${r.b.name}</option>
          </select>
          <button data-apply="${r.key}">프리셋 적용</button>
        </div>
      </div>
      <div class="kv">
        <div class="muted">호감</div><div>${r.rel.affinity}</div>
        <div class="muted">신뢰</div><div>${r.rel.trust}</div>
        <div class="muted">긴장</div><div>${r.rel.tension}</div>
        <div class="muted">연정</div><div>${r.rel.romance}</div>
      </div>
      <div class="muted small">짝사랑은 단방향입니다(주체를 선택).</div>
    </div>
  `).join("");

  rows.forEach(r => {
    const sel = els.relBox.querySelector(`select[data-preset="${r.key}"]`);
    if (sel) sel.value = (r.rel.stage === "rivals") ? "rivals"
                 : (r.rel.stage === "family") ? "family"
                 : (r.rel.stage === "crush") ? "crush"
                 : "strangers";

    const crushSel = els.relBox.querySelector(`select[data-crushfrom="${r.key}"]`);
    const refreshCrush = () => {
      crushSel.style.display = (sel.value === "crush") ? "" : "none";
    };
    sel.addEventListener("change", refreshCrush);
    refreshCrush();

    els.relBox.querySelector(`button[data-apply="${r.key}"]`)
      .addEventListener("click", () => {
        handlers.onApplyPreset(r.key, sel.value, crushSel.value);
      });
  });
}

function renderSchedules(state, els) {
  els.scheduleBox.innerHTML = state.characters.map(c => `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div><b>${c.name}</b></div>
        <div class="row">
          <select data-sel="${c.id}">
            ${SCHEDULE_IDS.map(id => `<option value="${id}">${SCHEDULES[id].label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="muted small">
        숙련도 —
        공부:${c.skills.study.level},
        노동:${c.skills.work.level},
        휴식:${c.skills.rest.level},
        예술:${c.skills.art.level},
        훈련:${c.skills.train.level}
      </div>
    </div>
  `).join("");
}

function renderStats(state, els) {
  els.statsBox.innerHTML = state.characters.map(c => `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div><b>${c.name}</b></div>
        <div class="muted small">스트레스: ${c.stats.stress}/100</div>
      </div>
      <div class="kv">
        <div class="muted">지능</div><div>${c.stats.intellect}</div>
        <div class="muted">매력</div><div>${c.stats.charm}</div>
        <div class="muted">체력</div><div>${c.stats.strength}</div>
        <div class="muted">예술</div><div>${c.stats.art}</div>
        <div class="muted">도덕</div><div>${c.stats.morality}</div>
      </div>
    </div>
  `).join("");
}
