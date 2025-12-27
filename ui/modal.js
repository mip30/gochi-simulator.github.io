import { applyCardChoice } from "../sim/engine.js";

export function showScriptModal({ rootEl, cards, state, onDone, onNeedHighlight }) {
  let idx = 0;
  const choicesMade = {}; // cardId -> tag

  const back = document.createElement("div");
  back.className = "modalBack";

  const modal = document.createElement("div");
  modal.className = "modal";

  back.appendChild(modal);
  rootEl.innerHTML = "";
  rootEl.appendChild(back);

  back.addEventListener("click", (e) => {
    if (e.target === back) {/* block close by backdrop to guarantee read */}
  });

  async function ensureHighlightIfNeeded(card) {
    if (card.type !== "HIGHLIGHT_PLACEHOLDER") return card;
    const generated = await onNeedHighlight?.();
    return generated ?? templateHighlight(state);
  }

  function templateHighlight(state) {
    return {
      id: `highlight_tpl_${Date.now()}`,
      type: "HIGHLIGHT",
      title: "A quiet stitch in the month",
      narration: "Not every month has fireworks. Sometimes the highlight is simply enduring—together or alone.",
      dialogues: [
        { speaker: "Narration", line: "A small decision settles into the future." }
      ],
      choices: [],
      meta: {}
    };
  }

  async function renderCard() {
    let card = cards[idx];
    card = await ensureHighlightIfNeeded(card);

    // replace placeholder in-place so choices persist correctly
    cards[idx] = card;

    const scriptN = `<div class="scriptN">Script ${idx+1} / ${cards.length}</div>`;
    const title = `<h3 class="modalTitle">${escapeHtml(card.title ?? "")}</h3>`;

    const narr = card.narration ? `<div class="narr">${escapeHtml(card.narration)}</div>` : "";
    const dlg = (card.dialogues ?? []).map(d => (
      `<div class="dialog"><b>${escapeHtml(d.speaker)}:</b> ${escapeHtml(d.line)}</div>`
    )).join("");

    const chosen = choicesMade[card.id];
    const hasChoices = (card.choices ?? []).length === 3;

    const choiceRow = hasChoices ? `
      <div class="choiceRow">
        ${(card.choices ?? []).map(ch => `
          <button data-choice="${ch.tag}" ${chosen ? "disabled" : ""}>
            [${ch.tag}] ${escapeHtml(ch.label)}
          </button>
        `).join("")}
      </div>
      <div class="muted small">${chosen ? `Choice locked: ${chosen}` : "Choose one."}</div>
    ` : "";

    modal.innerHTML = `
      <div class="modalTop">
        <div>${scriptN}${title}</div>
        <div class="badge">${escapeHtml(card.type)}</div>
      </div>
      <div class="modalBody">
        ${narr}
        ${dlg}
        ${choiceRow}
        <div class="footerRow">
          <button id="btnPrev" ${idx===0 ? "disabled":""}>Prev</button>
          <div class="muted">${hasChoices ? "Choices affect numbers (code-fixed)." : ""}</div>
          <button id="btnNext">${idx === cards.length-1 ? "Finish" : "Next"}</button>
        </div>
      </div>
    `;

    modal.querySelectorAll("button[data-choice]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tag = btn.getAttribute("data-choice");
        choicesMade[card.id] = tag;
        applyCardChoice(state, card, tag);
        renderCard();
      });
    });

    modal.querySelector("#btnPrev").addEventListener("click", () => {
      idx = Math.max(0, idx-1);
      renderCard();
    });

    modal.querySelector("#btnNext").addEventListener("click", () => {
      if (idx < cards.length-1) {
        idx += 1;
        renderCard();
      } else {
        rootEl.innerHTML = "";
        onDone?.(choicesMade);
      }
    });
  }

  renderCard();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
