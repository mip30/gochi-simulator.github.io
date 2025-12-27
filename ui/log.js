export function clearLogs(state) {
  state.log.entries = [];
}

export function appendLogs(logBox, state, handlers) {
  const entries = state.log.entries;

  let html = "";
  let lastP = "";

  for (const e of entries) {
    const pKey = periodKey(e.period);
    if (pKey !== lastP) {
      lastP = pKey;
      html += `<div class="logMonth">${escapeHtml(periodLabel(e.period))}</div>`;
    }

    html += `
      <div class="logEntry" data-eid="${e.id}">
        <div class="title">${escapeHtml(e.title)}</div>
        <div class="meta">${escapeHtml(metaLine(e))}</div>
        <div class="text">${escapeHtml(e.text || "")}</div>

        ${(e.dialogues || []).length ? `<div class="sep"></div>` : ""}

        ${(e.dialogues || []).map(d => `
          <div class="dlg"><b>${escapeHtml(d.speaker)}:</b> ${escapeHtml(d.line)}</div>
        `).join("")}

        ${(e.choices || []).length ? `
          <div class="choiceRow">
            ${(e.choices || []).map(ch => `
              <button data-choice="${ch.tag}" ${e.choiceMade ? "disabled":""}>
                [${ch.tag}] ${escapeHtml(ch.label)}
              </button>
            `).join("")}
          </div>
          <div class="muted small">${e.choiceMade ? `선택 완료: ${e.choiceMade}` : "선택지를 고르세요."}</div>
        ` : ""}
      </div>
    `;
  }

  logBox.innerHTML = html;

  logBox.querySelectorAll(".logEntry button[data-choice]").forEach(btn => {
    btn.addEventListener("click", () => {
      const entryEl = btn.closest(".logEntry");
      const entryId = entryEl.getAttribute("data-eid");
      const tag = btn.getAttribute("data-choice");
      handlers.onApplyChoice(entryId, tag);
    });
  });
}

function metaLine(e) {
  // ✅ 종류(type) 숨김. 필요한 최소 정보만.
  const s = [];
  if (e.meta?.source) s.push(`source=${e.meta.source}`);
  if (e.meta?.event) s.push(`event=${e.meta.event}`);
  return s.join(" · ");
}

function periodKey(p) {
  if (!p) return "na";
  return `${p.start.year}-${p.start.month}-${p.end.year}-${p.end.month}`;
}

function periodLabel(p) {
  if (!p) return "";
  if (p.start.year === p.end.year) return `제 ${p.start.year}년 ${p.start.month}~${p.end.month}월`;
  return `제 ${p.start.year}년 ${p.start.month}월 ~ 제 ${p.end.year}년 ${p.end.month}월`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
