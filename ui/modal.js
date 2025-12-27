// ui/modal.js
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

  async function ensureHighlightIfNeeded(card) {
    if (card.type !== "하이라이트_대기") return card;
    const generated = await onNeedHighlight?.();
    return generated ?? templateHighlight(state);
  }

  function templateHighlight(state) {
    return {
      id: `highlight_tpl_${Date.now()}`,
      type: "하이라이트",
      title: "이달의 정리",
      narration: "폭풍 같은 달도, 아무 일 없는 달도 없다.\n조용한 선택 하나가 다음 달의 분위기를 바꾼다.",
      dialogues: [
        { speaker: "내레이션", line: "작은 결정은 언젠가 큰 장면이 된다." }
      ],
      choices: [],
      meta: { source: "template" }
    };
  }

  async function renderCard() {
    let card = cards[idx];
    card = await ensureHighlightIfNeeded(card);
    cards[idx] = card;

    const scriptN = `<div class="scriptN">스크립트 ${idx+1} / ${cards.length}</div>`;
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
      <div class="muted small">${chosen ? `선택 완료: ${chosen}` : "선택지를 고르세요."}</div>
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
          <button id="btnPrev" ${idx===0 ? "disabled":""}>이전</button>
          <div class="muted">${hasChoices ? "선택 결과는 수치에 영향을 줍니다." : ""}</div>
          <button id="btnNext">${idx === cards.length-1 ? "닫기" : "다음"}</button>
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
