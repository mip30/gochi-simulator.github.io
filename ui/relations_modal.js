const PRESETS = ["초면", "라이벌", "가족", "짝사랑"];

export function showRelationsModal({ rootEl, state, fromId, setupUnlocked, onChangePreset }) {
  const from = state.characters.find(c => c.id === fromId);
  if (!from) return;

  const back = document.createElement("div");
  back.className = "modalBack";

  const modal = document.createElement("div");
  modal.className = "modal";
  back.appendChild(modal);

  rootEl.innerHTML = "";
  rootEl.appendChild(back);

  const rows = state.characters
    .filter(c => c.id !== fromId)
    .map(to => {
      const key = `${fromId}->${to.id}`;
      const rel = state.relations[key];
      return { to, key, rel };
    });

  modal.innerHTML = `
    <div class="modalTop">
      <h3 class="modalTitle">관계 설정/확인 — ${escapeHtml(from.name)} → (대상)</h3>
      <button id="btnClose">닫기</button>
    </div>
    <div class="modalBody">
      <div class="muted small">${setupUnlocked ? "첫 진행 전까지만 프리셋 변경 가능" : "진행 중에는 변경 불가"}</div>
      <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
        ${rows.map(r => `
          <div class="card">
            <div class="row" style="justify-content:space-between;">
              <div><b>${escapeHtml(r.to.name)}</b> <span class="badge">${escapeHtml(r.rel.stage)}</span></div>
              <div class="row">
                <select data-key="${r.key}" ${setupUnlocked ? "" : "disabled"}>
                  ${PRESETS.map(p => `<option value="${p}" ${p===r.rel.preset ? "selected":""}>${p}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="muted small">
              호감 ${r.rel.affinity} · 신뢰 ${r.rel.trust} · 긴장 ${r.rel.tension} · 연정 ${r.rel.romance}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  modal.querySelector("#btnClose").addEventListener("click", () => {
    rootEl.innerHTML = "";
  });

  if (setupUnlocked) {
    modal.querySelectorAll("select[data-key]").forEach(sel => {
      sel.addEventListener("change", () => {
        const key = sel.getAttribute("data-key");
        const val = sel.value;
        onChangePreset(key.split("->")[1], val);
      });
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
