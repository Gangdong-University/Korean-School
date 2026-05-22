// api/gemini.js — Vercel Serverless Function (Gemini API proxy)
// ════════════════════════════════════════════════════════════════
// Энэ файлыг таны төслийн ROOT-д "api/gemini.js" гэж хадгална
// Vercel автомат detect хийгээд serverless endpoint болгоно.
// Гадны хандалт: POST /api/gemini  (body: { prompt, system?, json? })
// ════════════════════════════════════════════════════════════════

const GEMINI_MODEL = "gemini-2.0-flash"; // Хурдан, хямд, чанартай
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY environment variable байхгүй" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { prompt, system, json } = body;

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "prompt шаардлагатай" });
      return;
    }

    // Хүсэлтийг бэлдэх
    const reqBody = {
      contents: [
        { parts: [{ text: prompt }] }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 4096,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    };
    if (system) {
      reqBody.systemInstruction = { parts: [{ text: system }] };
    }

    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("Gemini API error:", r.status, errText);
      res.status(r.status).json({ error: "Gemini API алдаа", detail: errText.slice(0, 500) });
      return;
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.status(200).json({
      text,
      raw: data,
    });
  } catch (e) {
    console.error("Handler error:", e);
    res.status(500).json({ error: "Server error", detail: e.message });
  }
}
