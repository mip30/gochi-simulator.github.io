export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }), req);
    if (req.method !== "POST") {
      return cors(new Response(JSON.stringify({ error: "POST만 허용" }), {
        status: 405, headers: { "Content-Type":"application/json" }
      }), req);
    }

    const input = await req.json();
    const prompt = buildPromptKR(input);

    const responseSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        narration: { type: "string" },
        dialogues: {
          type: "array",
          items: {
            type: "object",
            properties: { speaker:{type:"string"}, line:{type:"string"} },
            required: ["speaker","line"]
          },
          minItems: 0, maxItems: 6
        },
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: { tag:{type:"string"}, label:{type:"string"} },
            required: ["tag","label"]
          },
          minItems: 3, maxItems: 3
        },
        meta: { type: "object" }
      },
      required: ["title","narration","dialogues","choices","meta"]
    };

    const body = {
      contents: [{ role:"user", parts:[{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.95,
        maxOutputTokens: 520
      }
    };

    const model = env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_KEY}`;

    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      const detail = await r.text();
      return cors(new Response(JSON.stringify({ error:"Gemini 오류", detail }), {
        status: 502, headers:{ "Content-Type":"application/json" }
      }), req);
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return cors(new Response(JSON.stringify({ error:"응답 텍스트 없음", data }), {
        status: 502, headers:{ "Content-Type":"application/json" }
      }), req);
    }

    let card;
    try { card = JSON.parse(text); }
    catch {
      return cors(new Response(JSON.stringify({ error:"JSON 파싱 실패", raw:text }), {
        status: 502, headers:{ "Content-Type":"application/json" }
      }), req);
    }

    card.id = card.id || `ai_${Date.now()}`;
    card.meta = card.meta || {};
    card.meta.source = "ai";

    return cors(new Response(JSON.stringify(card), {
      status: 200, headers:{ "Content-Type":"application/json" }
    }), req);
  }
};

function buildPromptKR(input) {
  const year = input.year;
  const month = input.month;

  const chars = (input.characters ?? []).map(c =>
    `- ${c.name} (${c.mbti}, ${c.zodiac}), 이번달:${c.schedule}, 스트레스:${c.stats?.stress}`
  ).join("\n");

  const rels = (input.relations ?? []).slice(0,10).map(r =>
    `- ${r.key}: preset ${r.preset}, stage ${r.stage}, 호감 ${r.affinity}, 신뢰 ${r.trust}, 긴장 ${r.tension}, 연정 ${r.romance}`
  ).join("\n");

return `
프린세스 메이커 느낌의 키우기 시뮬레이션 이벤트 1개를 만든다. (선택지 A/B/C)

문장 스타일 요구:
- 번역체/직역체/문어체 금지. 한국인이 자연스럽게 쓰는 짧은 문장.
- 과장된 문학 표현 금지. 게임 로그처럼 간단하게.
- "수치가 오른다/내린다" 같은 설명 금지. (변화는 클라이언트가 처리)
- 캐릭터 대사는 MBTI 말투/결정 성향이 드러나게.

이벤트 소재 예시:
- 길에서 적을 마주침 / 누군가 도움 요청 / 오해 발생 / 상점 유혹 / 수상한 소문

출력은 JSON만:
title, narration, dialogues[{speaker,line}], choices[{tag,label}] (3개), meta
`.trim();


캐릭터:
${chars || "- (없음)"}

관계:
${rels || "- (없음)"}

JSON 필드:
title, narration, dialogues[], choices[{tag,label}] 3개, meta
  `.trim();
}

function cors(res, req) {
  const origin = req.headers.get("Origin") || "*";
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}
