export function clearLogs(state) {
  state.log.entries = [];
}

export function appendLogs(logBox, state, handlers) {
  // 전체 재렌더(단순)
  const entries = state.log.entries;

  let html = "";
  let lastYM = "";

  for (const e of entries) {
    const ymKey = `${e.ym.year}-${e.ym.month}`;
    if (ymKey !== lastYM) {
      lastYM = ymKey;
      html += `<div class="logMonth">제 ${e.ym.year}년 ${e.ym.month}월</div>`;
    }

    html += `
      <div class="logEntry" data-eid="${e.id}">
        <div class="title">${escapeHtml(e.title)}</div>
        <div class="meta">${escapeHtml(e.type)} · ${escapeHtml(metaLine(e))}</div>
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

  // choice handlers
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
  const s = [];
  if (e.meta?.source) s.push(`source=${e.meta.source}`);
  if (e.meta?.event) s.push(`event=${e.meta.event}`);
  return s.join(" · ");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
