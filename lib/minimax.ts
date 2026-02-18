export async function minimaxJson(promptObj: any) {
  const url = `${process.env.MINIMAX_BASE_URL}/v1/text/chatcompletion_v2`;

  const payload = {
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.5",
    messages: [
      {
        role: "system",
        name: "system",
        content:
          "You are a strict JSON generator. Return JSON only. No markdown. No extra text.",
      },
      {
        role: "user",
        name: "user",
        content: JSON.stringify(promptObj),
      },
    ],
    temperature: 0.2,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`MiniMax error ${res.status}: ${raw}`);

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`MiniMax returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const content =
    data?.choices?.[0]?.message?.content ??
    data?.reply ??
    data?.result ??
    null;

  if (!content) throw new Error("MiniMax: missing content");

  try {
    return typeof content === "string" ? JSON.parse(content) : content;
  } catch {
    throw new Error(`MiniMax content not valid JSON: ${String(content).slice(0, 200)}`);
  }
}
