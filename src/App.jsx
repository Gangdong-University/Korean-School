// ═══════════════════════════════════════════════════════════════════
// 🌸 КАНДУН UNIVERSITY KOREAN SCHOOL — v5.0 FIREBASE
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, writeBatch,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";

// ── FIREBASE CONFIG ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBywV41xPjIAys_GKyzFIRsAf997v5ZBzk",
  authDomain: "gangdong-university1.firebaseapp.com",
  projectId: "gangdong-university1",
  storageBucket: "gangdong-university1.firebasestorage.app",
  messagingSenderId: "948147246623",
  appId: "1:948147246623:web:52fe6b5c7b4a43a76a272a",
};

const fbApp = initializeApp(firebaseConfig);
// ✨ Offline persistence идэвхжүүлэх — интернетгүй ажиллана
// + multi-tab support (хэдэн tab нээсэн ч ажиллана)
let db;
try {
  db = initializeFirestore(fbApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  // Хэрэв aль хэдийн initialize хийгдсэн бол энгийн getFirestore
  db = getFirestore(fbApp);
}

// ── FIREBASE HELPERS ─────────────────────────────────────────────
async function fbSelect(coll, queryParams = {}) {
  try {
    let q = collection(db, coll);
    const constraints = [];
    if (queryParams.where) {
      for (const [field, op, value] of queryParams.where) {
        constraints.push(where(field, op, value));
      }
    }
    if (queryParams.orderBy) {
      constraints.push(orderBy(queryParams.orderBy, queryParams.orderDir || "asc"));
    }
    if (queryParams.limit) constraints.push(limit(queryParams.limit));
    if (constraints.length > 0) q = query(q, ...constraints);
    const snapshot = await getDocs(q);
    const docs = [];
    snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
    return docs;
  } catch (e) {
    console.warn(`Firebase ${coll} read error:`, e.message);
    return [];
  }
}

// ── ДАВХАР ҮЙЛДЛЭЭС ХАМГААЛАХ (бүх хэрэглэгч, бүх товч) ──────────────
// Апп гацсан үед нэг товч олон дарагдвал → ижил үйлдэл 1 удаа л биелнэ.
// Жишээ: сурагч "Дуусгах" 5 удаа дарвал → 1 submission л үүснэ.
const _recentWrites = {};
function _isDuplicateWrite(signature, windowMs = 1500) {
  const now = Date.now();
  const last = _recentWrites[signature];
  // Хуучин бичлэгүүдийг цэвэрлэх (санах ой хуримтлахаас сэргийлнэ)
  if (Object.keys(_recentWrites).length > 200) {
    for (const k in _recentWrites) {
      if (now - _recentWrites[k] > 10000) delete _recentWrites[k];
    }
  }
  if (last && (now - last) < windowMs) return true; // давхардал
  _recentWrites[signature] = now;
  return false;
}

async function fbInsert(coll, data) {
  const { id, ...rest } = data;
  const docId = id || `${coll.slice(0, 2)}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  // Давхар insert хамгаалалт — ижил агуулга богино хугацаанд давтагдвал алгасна
  // (id заасан бол id-аар, үгүй бол агуулгаар таних)
  const sig = `INS:${coll}:${id || JSON.stringify(rest).slice(0, 200)}`;
  if (_isDuplicateWrite(sig)) {
    console.warn("Давхар insert алгаслаа:", coll);
    return { id: docId, ...rest, _skipped: true };
  }
  const ref = doc(db, coll, String(docId));
  const cleaned = {};
  Object.keys(rest).forEach(k => {
    if (rest[k] !== null && rest[k] !== undefined) cleaned[k] = rest[k];
  });
  cleaned.created_at = cleaned.created_at || new Date().toISOString();
  await setDoc(ref, cleaned);
  return { id: docId, ...cleaned };
}

async function fbUpdate(coll, id, data) {
  const ref = doc(db, coll, String(id));
  const cleaned = {};
  Object.keys(data).forEach(k => {
    if (data[k] !== undefined) {
      cleaned[k] = data[k];
    }
  });
  try {
    await updateDoc(ref, cleaned);
  } catch (e) {
    await setDoc(ref, cleaned, { merge: true });
  }
  return true;
}

async function fbDelete(coll, id) {
  // Давхар delete хамгаалалт
  const sig = `DEL:${coll}:${id}`;
  if (_isDuplicateWrite(sig)) {
    console.warn("Давхар delete алгаслаа:", coll, id);
    return true;
  }
  const ref = doc(db, coll, String(id));
  await deleteDoc(ref);
  return true;
}

async function fbWhere(coll, field, op, value) {
  return fbSelect(coll, { where: [[field, op, value]] });
}

// ── BACKWARD COMPATIBILITY: Supabase нэрээр дуудах ──────
// Хуучин код өөрчлөхгүйгээр шилжүүлэх
const supaSelect = async (table, queryStr) => {
  // queryStr-аас select= хэсгийг арилгах (Firebase-д хэрэггүй)
  // ба email=eq.xxx эсвэл name=eq.yyy зэргийг parse хийх
  if (!queryStr) return fbSelect(table);
  // Параметрууд салгах
  const conditions = [];
  const parts = queryStr.split("&");
  for (const p of parts) {
    if (p.includes("=eq.")) {
      const [field, valEnc] = p.split("=eq.");
      const val = decodeURIComponent(valEnc);
      conditions.push([field, "==", val]);
    }
  }
  if (conditions.length > 0) {
    return fbSelect(table, { where: conditions });
  }
  return fbSelect(table);
};

const supaInsert = (table, body) => fbInsert(table, body);
const supaUpdate = (table, id, body) => fbUpdate(table, id, body);
const supaDelete = (table, id) => fbDelete(table, id);

// ── UNIVERSAL ДАВХАР ДАРАХ ХАМГААЛАЛТ ───────────────────────────────
// Апп гацсан үед нэг товч олон дарагдвал → зөвхөн НЭГ удаа ажиллана.
// Хэрэглээ: onClick={() => runOnce("unique-key", async () => { ... })}
const _runningActions = {};
async function runOnce(key, fn) {
  if (_runningActions[key]) return; // аль хэдийн ажиллаж байна → алгасна
  _runningActions[key] = true;
  try {
    return await fn();
  } finally {
    // 600ms-ийн дараа дахин зөвшөөрнө (гацалт намжсаны дараа)
    setTimeout(() => { delete _runningActions[key]; }, 600);
  }
}


// ── СУУРЬ HELPERS ────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);
const NOW_MONTH = new Date().toISOString().slice(0, 7);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("mn-MN", { month: "long", day: "numeric" }) : "—";
const fmt = (n) => new Intl.NumberFormat("mn-MN").format(n || 0);
const DLABELS = { 1: "Да", 2: "Мя", 3: "Лх", 4: "Пү", 5: "Ба", 6: "Бя", 7: "Ня" };
const TOPIK = ["Pre-TOPIK", "TOPIK I-1", "TOPIK I-2", "TOPIK II-3", "TOPIK II-4", "TOPIK II-5", "TOPIK II-6"];

// Тухайн сард хичээл-ийн оролтууд
function getSessions(days, ym) {
  if (!days || !days.length || !ym) return [];
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m - 1, d);
    let dow = date.getDay(); dow = dow === 0 ? 7 : dow;
    if (days.includes(dow)) {
      out.push({ date: date.toISOString().slice(0, 10), dow });
    }
  }
  return out;
}

// Solongos audio (Web Speech API)
// Voice кэш — нэг удаа л voice list ачаалж сонгоно
let _krVoice = null;
let _voicesReady = false;

function pickBestKrVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  // Эрэмбэлэх — Google, Apple премиум хоолойнуудыг урьтал
  const kr = voices.filter(v => v.lang === "ko-KR" || v.lang.startsWith("ko"));
  if (kr.length === 0) return null;
  // 1. Google Korean (хамгийн чанартай)
  let best = kr.find(v => /Google/i.test(v.name) && /Korean|한국/i.test(v.name));
  if (best) return best;
  // 2. Apple Premium / Enhanced
  best = kr.find(v => /Premium|Enhanced|Yuna|Sora/i.test(v.name));
  if (best) return best;
  // 3. Microsoft Natural (Edge)
  best = kr.find(v => /Natural|Neural|InJoon|SunHi/i.test(v.name));
  if (best) return best;
  // 4. Эмэгтэй хоолой давуу
  best = kr.find(v => /female|Yuna|Sora|Heami|Sun-Hi/i.test(v.name));
  if (best) return best;
  // 5. Default
  return kr[0];
}

function speakKr(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  if (!text || !text.trim()) return;
  try {
    // iOS Safari дээр заримдаа speaking үед cancel хийхгүй бол гацдаг
    window.speechSynthesis.cancel();

    // Voice list бэлэн эсэхийг шалгах — iOS дээр заримдаа хоцордог
    let voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) {
      // Voice ачаалагдаагүй байна — дахин ачаалуулаад түр хүлээгээд speak хийнэ
      window.speechSynthesis.getVoices();
      setTimeout(() => speakKrNow(text), 250);
      return;
    }
    speakKrNow(text);
  } catch (e) {
    console.warn("TTS error:", e);
  }
}

function speakKrNow(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 0.85;     // Арай удаан — тод дуудлага
    u.pitch = 1.0;     // Байгалийн өндөр
    u.volume = 1.0;
    if (!_krVoice) _krVoice = pickBestKrVoice();
    if (_krVoice) u.voice = _krVoice;

    // iOS Safari fix — resume() дуудах
    u.onstart = () => {
      try { window.speechSynthesis.resume(); } catch (e) {}
    };
    window.speechSynthesis.speak(u);

    // iOS Safari заримдаа "paused" төлөвт ордог — resume хийнэ
    setTimeout(() => {
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch (e) {}
    }, 100);
  } catch (e) {
    console.warn("TTS error:", e);
  }
}

// Voice list бэлэн болоход дахин сонгоно
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const setVoice = () => { _krVoice = pickBestKrVoice(); _voicesReady = true; };
  window.speechSynthesis.onvoiceschanged = setVoice;
  setTimeout(setVoice, 100);
  setTimeout(setVoice, 1000);
}

// ── GEMINI AI ─────────────────────────────────────────────────────────
// ⚠️ API key-ийг доорх мөрөнд тавьна уу (https://aistudio.google.com)
const GEMINI_API_KEY = ""; // ← ЭНД ӨӨРИЙН KEY-Г ТАВЬ
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

async function geminiCall(prompt, opts = {}) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key тавиагүй байна");
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7, topP: 0.95, maxOutputTokens: 4096,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  const r = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("AI алдаа: " + r.status);
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function translateKrToMn(word) {
  word = (word || "").trim();
  if (!word) return "";
  const text = await geminiCall(
    `Солонгос үг "${word}"-ийн монгол утгыг ЗӨВХӨН утгыг буцаа. Жишээ: "학교"→"сургууль". Одоо: "${word}"→`,
    { system: "Зөвхөн утгыг буцаана, тайлбар бичихгүй." }
  );
  return text.replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0].slice(0, 100);
}

async function generateExamQuestions({ vocabs, grammars, count = 10, level = 0, recent = [] }) {
  if ((!vocabs?.length) && (!grammars?.length)) return [];
  const vStr = (vocabs || []).map((v, i) => `${i + 1}. ${v.word} = ${v.meaning}`).join("\n");
  const gStr = (grammars || []).map((v, i) => `${i + 1}. ${v.word}: ${v.meaning}`).join("\n");
  const rStr = (recent || []).slice(0, 8).map(v => `${v.word}=${v.meaning}`).join(", ");
  const lvlName = TOPIK[level] || "TOPIK I-1";
  const prompt = `Солонгос хэлний ${count} асуулт үүсгэ. Сурагчийн түвшин: ${lvlName}.

ГОЛ ҮГС:
${vStr || "(байхгүй)"}

ДҮРМҮҮД:
${gStr || "(байхгүй)"}

ӨМНӨХ ҮГС (20% оруулна): ${rStr || "(байхгүй)"}

ДҮРЭМ:
- 4 төрөл: multiple_choice (4 сонголт), translate_kr_mn, translate_mn_kr, fill_blank
- 80% нь голд, 20% нь өмнөх
- multiple_choice: 1 зөв 3 буруу үнэмшилтэй
- fill_blank: солонгос өгүүлбэрт ___ + 4 сонголт

JSON формат (өөр текст бичихгүй):
{
  "questions": [
    {"type":"multiple_choice","question":"학교-ийн утга?","options":["сургууль","найз","ном","ус"],"correct":"сургууль","audio":"학교"},
    {"type":"translate_kr_mn","question":"Утгыг бичнэ үү:","audio":"친구","correct":"найз","alternatives":["анд"]},
    {"type":"translate_mn_kr","question":"Солонгосоор бичнэ үү:","prompt_text":"сургууль","correct":"학교"},
    {"type":"fill_blank","question":"Хоосон зайг гүйцээ:","sentence":"나는 ___에 갑니다","audio":"나는 학교에 갑니다","options":["학교","ном","ус","найз"],"correct":"학교","translation":"Би сургуульд явж байна"}
  ]
}`;
  try {
    const text = await geminiCall(prompt, { system: "JSON форматтай асуулт үүсгэх. Зөвхөн JSON буцаа.", json: true });
    return JSON.parse(text).questions || [];
  } catch (e) { return []; }
}

function generateFallbackQuestions(vocabs, count) {
  if (!vocabs || vocabs.length < 2) return [];
  const list = [...vocabs].sort(() => Math.random() - 0.5).slice(0, count);
  return list.map(target => {
    const others = vocabs.filter(v => v.word !== target.word).sort(() => Math.random() - 0.5).slice(0, 3);
    return {
      type: "multiple_choice",
      question: `${target.word}-ийн утга?`,
      audio: target.word,
      options: [...others.map(o => o.meaning), target.meaning].sort(() => Math.random() - 0.5),
      correct: target.meaning,
    };
  });
}

// ── Үгэнд тохирох emoji автомат сонгох (offline keyword-based) ──────
const EMOJI_MAP = {
  // Хүн, гэр бүл
  "найз": "👫", "анд": "👫", "эх": "👩", "эцэг": "👨", "аав": "👨", "ээж": "👩",
  "хүүхэд": "👶", "хүү": "👦", "охин": "👧", "ах": "👦", "эгч": "👧", "дүү": "👶",
  "багш": "👩‍🏫", "оюутан": "🧑‍🎓", "сурагч": "🧑‍🎓", "эмч": "👨‍⚕️", "хүн": "🧑",
  // Хоол
  "хоол": "🍽️", "будаа": "🍚", "талх": "🍞", "ус": "💧", "сүү": "🥛", "цай": "🍵",
  "кофе": "☕", "жимс": "🍎", "алим": "🍎", "банан": "🍌", "лимон": "🍋", "өндөг": "🥚",
  "мах": "🥩", "загас": "🐟", "хүнс": "🍱", "амтат": "🍰", "чихэр": "🍬",
  // Газар
  "сургууль": "🏫", "гэр": "🏠", "байшин": "🏠", "эмнэлэг": "🏥", "дэлгүүр": "🏪",
  "хот": "🏙️", "хөдөө": "🌾", "уул": "⛰️", "гол": "🌊", "тэнгис": "🌊", "далай": "🌊",
  "ой": "🌲", "цэцэрлэг": "🌷", "талбай": "🏞️", "зам": "🛣️", "гудамж": "🛣️",
  // Цаг
  "өдөр": "☀️", "шөнө": "🌙", "өглөө": "🌅", "орой": "🌆", "цаг": "🕐",
  "өчигдөр": "📅", "өнөөдөр": "📅", "маргааш": "📅", "долоо хоног": "📅",
  "сар": "📅", "жил": "📅", "хавар": "🌸", "зун": "☀️", "намар": "🍂", "өвөл": "❄️",
  // Юм
  "ном": "📚", "дэвтэр": "📓", "үзэг": "✏️", "харандаа": "✏️", "сонин": "📰",
  "утас": "📱", "компьютер": "💻", "машин": "🚗", "автобус": "🚌", "галт тэрэг": "🚆",
  "онгоц": "✈️", "усан онгоц": "🚢", "дугуй": "🚲",
  // Амьтан
  "нохой": "🐕", "муур": "🐈", "морь": "🐎", "үхэр": "🐄", "хонь": "🐑", "гахай": "🐖",
  "тахиа": "🐔", "шувуу": "🐦", "мэнгэ": "🐭",
  // Үйл
  "явах": "🚶", "ирэх": "🚶", "идэх": "🍴", "ууx": "🥤", "унтах": "😴", "босох": "🌅",
  "хичээх": "💪", "сурах": "📖", "уншиx": "📖", "бичих": "✏️", "ярих": "💬", "сонсох": "👂",
  "харах": "👀", "хийх": "👷", "ажил": "💼", "ажиллах": "💼", "тоглох": "🎮", "дуулах": "🎤",
  "хайрлах": "❤️", "баярлах": "😊", "уйлах": "😢", "инээх": "😄", "уурлах": "😠",
  // Шинж тэмдэг
  "том": "📏", "жижиг": "📏", "сайн": "👍", "муу": "👎", "хурдан": "⚡", "удаан": "🐢",
  "халуун": "🔥", "хүйтэн": "❄️", "шинэ": "✨", "хуучин": "📜", "хол": "🌐", "ойр": "📍",
  // Өнгө
  "улаан": "🔴", "цэнхэр": "🔵", "ногоон": "🟢", "шар": "🟡", "хар": "⚫", "цагаан": "⚪",
  "ягаан": "🌸", "нил": "🟣", "хүрэн": "🟤",
  // Бусад
  "мөнгө": "💰", "цэцэг": "🌸", "мод": "🌳", "од": "⭐", "наран": "☀️",
  "тэнгэр": "🌌", "үүл": "☁️", "бороо": "🌧️", "цас": "❄️", "салхи": "💨",
  // Грамматика
  "болохгүй": "🚫", "болно": "✅", "хэрэгтэй": "❗", "хэрэггүй": "🚫",
};

function getEmojiForWord(word, meaning) {
  if (!word && !meaning) return "📝";
  const text = (meaning || "").toLowerCase().trim();
  // Хайх — шууд таарах
  if (EMOJI_MAP[text]) return EMOJI_MAP[text];
  // Хэсэгчилэн таарах (хоёр үг хайх)
  for (const [key, emoji] of Object.entries(EMOJI_MAP)) {
    if (text.includes(key)) return emoji;
  }
  return "📝";
}

// AI-аар тохирох emoji олох (cache хийнэ)
const _emojiCache = {};
async function getEmojiByAI(word, meaning) {
  // Эхлээд offline хайя
  const offlineEmoji = getEmojiForWord(word, meaning);
  if (offlineEmoji !== "📝") return offlineEmoji;
  // Cache шалгах
  const key = `${word}|${meaning}`;
  if (_emojiCache[key]) return _emojiCache[key];
  if (!GEMINI_API_KEY) return "📝";
  try {
    const text = await geminiCall(
      `"${word}" (${meaning}) гэдэг үгэнд хамгийн ойролцоо EMOJI 1 ширхэгийг буцаа. ЗӨВХӨН emoji буцаа, өөр текст бичихгүй. Жишээ: "сургууль" → 🏫`,
      { system: "Та зөвхөн нэг emoji буцаана. Текст бичихгүй." }
    );
    const emoji = (text || "").trim().match(/\p{Emoji}/u)?.[0] || "📝";
    _emojiCache[key] = emoji;
    return emoji;
  } catch (e) { return "📝"; }
}

// AI-аар өгүүлбэр үүсгэх (cache)
const _sentenceCache = {};
async function generateSentence(word, meaning, level = 0) {
  const key = `${word}|${meaning}|${level}`;
  if (_sentenceCache[key]) return _sentenceCache[key];
  if (!GEMINI_API_KEY) return null;
  try {
    const lvlName = TOPIK[level] || "TOPIK I-1";
    const text = await geminiCall(
      `${lvlName} түвшний сурагчдад зориулсан, "${word}" (${meaning}) үг орсон ОЙЛГОМЖТОЙ нэг солонгос өгүүлбэр + монгол орчуулга буцаа.
Формат (өөр текст бичихгүй, заавал JSON):
{"kr": "Энэ нь ${word} юм.", "mn": "Энэ нь ${meaning} юм."}`,
      { system: "Зөвхөн JSON формат буцаана.", json: true }
    );
    const data = JSON.parse(text);
    _sentenceCache[key] = data;
    return data;
  } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// 🏗️ TEMPLATE-BASED ӨГҮҮЛБЭР ЗОХИОГЧ (AI-гүй, вэбсайт дотроо)
// ═══════════════════════════════════════════════════════════════════
// Өгүүлбэрийн бүтэц: parts = [{ t: "текст", word?: "шинэ үг", mean?: "утга" }]
// word талбартай хэсэг = шинэ үг (тодруулж, доор нь монгол утга харагдана)

const GRAMMAR_PATTERNS = [
  {
    keys: ["이에요", "예요", "입니다", "이다"],
    name: "~이다 (юм/байх)",
    build: (w, m) => ({ parts: [{ t: "이것은 " }, { t: w, word: w, mean: m }, { t: "이에요." }], mn: `Энэ бол ${m}.` }),
  },
  {
    keys: ["을", "를", "목적어"],
    name: "~을/를 (-ийг)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "을/를 좋아해요." }], mn: `Би ${m}-д дуртай.` }),
  },
  {
    keys: ["이", "가", "주어"],
    name: "~이/가 (-нь)",
    build: (w, m) => ({ parts: [{ t: w, word: w, mean: m }, { t: "이/가 있어요." }], mn: `${m} байна.` }),
  },
  {
    keys: ["에", "장소", "위치"],
    name: "~에 (-д/т)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "에 가요." }], mn: `Би ${m} руу явна.` }),
  },
  {
    keys: ["에서", "출발"],
    name: "~에서 (-аас/оос)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "에서 왔어요." }], mn: `Би ${m}-аас ирсэн.` }),
  },
  {
    keys: ["와", "과", "하고", "그리고"],
    name: "~와/과 (-тай хамт)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "와/과 같이 가요." }], mn: `Би ${m}-тай хамт явна.` }),
  },
  {
    keys: ["고 싶", "want", "хүсэх"],
    name: "~고 싶다 (-хийхийг хүсэх)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "을/를 보고 싶어요." }], mn: `Би ${m}-ийг харахыг хүсэж байна.` }),
  },
  {
    keys: ["있", "보유", "байгаа"],
    name: "~이 있다 (байх)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "이/가 있어요." }], mn: `Надад ${m} байгаа.` }),
  },
  {
    keys: ["없", "хомс"],
    name: "~이 없다 (байхгүй)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "이/가 없어요." }], mn: `Надад ${m} байхгүй.` }),
  },
  {
    keys: ["아요", "어요", "현재"],
    name: "~аё/어요 (одоо цаг)",
    build: (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "을/를 봐요." }], mn: `Би ${m}-ийг харж байна.` }),
  },
  {
    keys: ["았", "었", "과거"],
    name: "~았/었어요 (өнгөрсөн цаг)",
    build: (w, m) => ({ parts: [{ t: "어제 " }, { t: w, word: w, mean: m }, { t: "을/를 봤어요." }], mn: `Өчигдөр ${m}-ийг харсан.` }),
  },
  {
    keys: ["겠", "ㄹ 거", "미래"],
    name: "~겠어요 (ирээдүй)",
    build: (w, m) => ({ parts: [{ t: "내일 " }, { t: w, word: w, mean: m }, { t: "을/를 살 거예요." }], mn: `Маргааш ${m} худалдаж авна.` }),
  },
];

const SIMPLE_TEMPLATES = [
  (w, m) => ({ parts: [{ t: "이것은 " }, { t: w, word: w, mean: m }, { t: "이에요." }], mn: `Энэ бол ${m}.` }),
  (w, m) => ({ parts: [{ t: "저는 " }, { t: w, word: w, mean: m }, { t: "을/를 좋아해요." }], mn: `Би ${m}-д дуртай.` }),
  (w, m) => ({ parts: [{ t: w, word: w, mean: m }, { t: "이/가 있어요." }], mn: `${m} байна.` }),
  (w, m) => ({ parts: [{ t: "이것은 " }, { t: w, word: w, mean: m }, { t: "입니다." }], mn: `Энэ бол ${m} юм.` }),
  (w, m) => ({ parts: [{ t: w, word: w, mean: m }, { t: "을/를 주세요." }], mn: `${m}-ийг өгөөч.` }),
];

function buildSentenceFromTemplate(word, meaning, grammar = null) {
  if (grammar && grammar.word) {
    const gWord = grammar.word.toLowerCase();
    for (const p of GRAMMAR_PATTERNS) {
      if (p.keys.some(k => gWord.includes(k.toLowerCase()))) {
        const sentence = p.build(word, meaning);
        return { ...sentence, grammarName: grammar.word, grammarMeaning: grammar.meaning };
      }
    }
    const idx = Math.abs(hashCode(word)) % SIMPLE_TEMPLATES.length;
    const s = SIMPLE_TEMPLATES[idx](word, meaning);
    return { ...s, grammarName: grammar.word, grammarMeaning: grammar.meaning };
  }
  const idx = Math.abs(hashCode(word)) % SIMPLE_TEMPLATES.length;
  return SIMPLE_TEMPLATES[idx](word, meaning);
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}



const THEMES = [
  { id: "sakura", name: "🌸 Sakura", bg: "#fff0f5", card: "#ffe4ef", accent: "#e91e8c", text: "#4a0028", soft: "#ffd6e8", border: "#f48cb1", emoji: "🌸" },
  { id: "sky", name: "☁️ Sky", bg: "#e8f4fd", card: "#d0eaff", accent: "#2196f3", text: "#0d2137", soft: "#b3d9ff", border: "#64b5f6", emoji: "☁️" },
  { id: "mint", name: "🌿 Mint", bg: "#e8faf4", card: "#c8f5e4", accent: "#00897b", text: "#003330", soft: "#a5e9d4", border: "#4db6ac", emoji: "🌿" },
  { id: "lavender", name: "💜 Lavender", bg: "#f3e8ff", card: "#e5d0ff", accent: "#7c3aed", text: "#2d0066", soft: "#d4b8ff", border: "#a78bfa", emoji: "💜" },
  { id: "peach", name: "🍑 Peach", bg: "#fff3e0", card: "#ffe0c0", accent: "#f57c00", text: "#4a1a00", soft: "#ffd099", border: "#ffb74d", emoji: "🍑" },
  { id: "sunny", name: "☀️ Sunny", bg: "#fffde7", card: "#fff9c4", accent: "#f9a825", text: "#4a3500", soft: "#fff59d", border: "#ffd54f", emoji: "☀️" },
];
const getTheme = (id) => THEMES.find(t => t.id === id) || THEMES[0];

// ── СТИЛЬ HELPERS ────────────────────────────────────────────────────
const INP = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e0e0e0", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" };
const btn = (bg, color, border) => ({ background: bg, color, border: border ? `2px solid ${border}` : "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 });

// ── ANIMATION CSS ────────────────────────────────────────────────────
const ANIMATIONS = `
@keyframes kFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes kSlide { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
@keyframes kSlideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
@keyframes kPop { 0% { transform: scale(.85); opacity: 0 } 60% { transform: scale(1.05); opacity: 1 } 100% { transform: scale(1) } }
@keyframes kBounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes kFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes kPulse { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.05); opacity: .9 } }
@keyframes kSpin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
@keyframes kWalk { 0%, 100% { transform: translateX(0) rotate(-2deg) } 50% { transform: translateX(2px) rotate(2deg) } }
@keyframes kShake { 0%, 100% { transform: translateX(0) } 25% { transform: translateX(-3px) } 75% { transform: translateX(3px) } }
@keyframes kGradient { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
@keyframes kWiggle { 0%, 100% { transform: rotate(0deg) } 25% { transform: rotate(-8deg) } 75% { transform: rotate(8deg) } }
@keyframes kGlow { 0%, 100% { filter: drop-shadow(0 0 8px rgba(255,167,38,0.6)) } 50% { filter: drop-shadow(0 0 20px rgba(255,167,38,0.9)) } }
@keyframes kRise { 0% { opacity: 0; transform: translateY(40px) scale(0.9) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
@keyframes kSpinSlow { from { transform: rotate(0) } to { transform: rotate(360deg) } }
.k-fade { animation: kFade .4s ease both }
.k-slide { animation: kSlide .4s ease both }
.k-slideup { animation: kSlideUp .4s ease both }
.k-pop { animation: kPop .35s cubic-bezier(0.34, 1.56, 0.64, 1) both }
.k-bounce { animation: kBounce 1.5s ease-in-out infinite }
.k-float { animation: kFloat 3s ease-in-out infinite }
.k-pulse { animation: kPulse 2s ease-in-out infinite }
.k-walk { animation: kWalk .6s ease-in-out infinite }
.k-wiggle { animation: kWiggle 2.5s ease-in-out infinite }
.k-glow { animation: kGlow 2.5s ease-in-out infinite }
.k-rise { animation: kRise .6s cubic-bezier(0.34, 1.56, 0.64, 1) both }
.k-gradient { background-size: 200% 200%; animation: kGradient 5s ease infinite }
.k-press:active { transform: scale(0.96); transition: transform .1s }
.k-hover:hover { transform: translateY(-2px); transition: transform .15s }
button { font-family: inherit }
* { box-sizing: border-box }
input, textarea, select { font-family: inherit }
`;

// ── SESSION хадгалах (Gmail шиг) ─────────────────────────────────────
const SESSION_KEY = "kandun_user_v4";
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.savedAt && (Date.now() - d.savedAt) > 90 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY); return null;
    }
    return d.user;
  } catch (e) { return null; }
}
function saveSession(user) {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify({ user, savedAt: Date.now() }));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

// ════════════════════════════════════════════════════════════════════
// КОМПОНЕНТУУД — дараагийн хэсэгт үргэлжилнэ
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// PART 2 — Жижиг компонентууд
// ════════════════════════════════════════════════════════════════════

// ── Overlay (popup container) ────────────────────────────────────────
function Overlay({ children, onClose, maxW = 420 }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 14,
      animation: "kFade .2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 18, padding: 18, width: "100%", maxWidth: maxW,
        maxHeight: "90vh", overflowY: "auto", animation: "kPop .3s ease",
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Toast мэдэгдэл ─────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  const colors = { success: "#43a047", error: "#e53935", warning: "#f57c00", info: "#1976d2" };
  return (
    <div className="k-pop" style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: colors[type] || colors.success, color: "#fff",
      padding: "10px 18px", borderRadius: 14, fontSize: 13, fontWeight: 700,
      zIndex: 2000, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxWidth: "90vw",
    }}>{msg}</div>
  );
}

// ── PullIndicator (доош чирэхэд refresh) ──────────────────────────
function PullIndicator({ pullY, refreshing, color = "#7c3aed" }) {
  if (pullY === 0 && !refreshing) return null;
  const progress = Math.min(pullY / 70, 1);
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      height: Math.max(pullY, refreshing ? 70 : 0),
      background: `linear-gradient(180deg,${color}${Math.round(0.05 * 255 + progress * 0.1 * 255).toString(16).padStart(2, "0")} 0%,transparent 100%)`,
      zIndex: 200, pointerEvents: "none",
      transition: refreshing ? "height .3s" : "none",
    }}>
      <div style={{
        background: "#fff", borderRadius: "50%", width: 44, height: 44,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
        transform: refreshing ? "none" : `rotate(${progress * 360}deg) scale(${0.6 + progress * 0.4})`,
      }}>
        {refreshing ? (
          <div style={{ width: 22, height: 22, border: "3px solid #e9e3ff", borderTopColor: color, borderRadius: "50%", animation: "kSpin 0.6s linear infinite" }} />
        ) : (
          <span style={{ fontSize: 22 }}>{progress >= 1 ? "🔄" : "⬇️"}</span>
        )}
      </div>
    </div>
  );
}

// ── Hook: PullToRefresh ────────────────────────────────────────────
function usePullToRefresh(onRefresh) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartRef = useRef(0);
  const pullingRef = useRef(false);

  useEffect(() => {
    const onStart = (e) => {
      if (window.scrollY > 0) { pullingRef.current = false; return; }
      pullStartRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };
    const onMove = (e) => {
      if (!pullingRef.current || refreshing) return;
      const delta = e.touches[0].clientY - pullStartRef.current;
      if (delta > 0 && window.scrollY === 0) {
        setPullY(Math.min(delta * 0.5, 120));
        if (delta > 10) e.preventDefault();
      }
    };
    const onEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullY >= 70 && !refreshing) {
        setRefreshing(true); setPullY(70);
        try { await onRefresh(); } catch (e) {}
        try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
        setTimeout(() => { setRefreshing(false); setPullY(0); }, 400);
      } else setPullY(0);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [pullY, refreshing, onRefresh]);

  return { pullY, refreshing };
}
// ════════════════════════════════════════════════════════════════════
// PART 3 — AuthScreen (нэвтрэх дэлгэц)
// ════════════════════════════════════════════════════════════════════

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("teacher"); // teacher | student | register | forgot
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Register fields
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regRd, setRegRd] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [classes, setClasses] = useState([]);
  const [regClassId, setRegClassId] = useState("");
  // Forgot password fields
  const [forgotRd, setForgotRd] = useState("");
  const [forgotFoundUser, setForgotFoundUser] = useState(null); // {id, name, role}
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [forgotNewPass2, setForgotNewPass2] = useState("");

  useEffect(() => {
    if (mode === "register" && classes.length === 0) {
      supaSelect("classes").then(setClasses);
    }
  }, [mode]);

  const doLoginTeacher = async () => {
    setBusy(true); setErr("");
    try {
      // Зөвхөн email-ээр хайж, password-ийг JS дотор шалгана (найдвартай)
      const emailLower = email.trim().toLowerCase();
      const allTeachers = await fbSelect("teachers");
      const t = allTeachers.find(x =>
        (x.email || "").toLowerCase().trim() === emailLower &&
        String(x.password || "") === String(pass)
      );
      if (t) {
        onAuth({
          id: t.id, role: "teacher", isSuperAdmin: t.role === "superadmin" || t.is_super_admin === true,
          displayName: t.name, class_ids: t.class_ids || null,
        });
      } else {
        // Email олдсон ч password буруу эсэхийг ялгаж мэдэгдэх
        const emailExists = allTeachers.some(x => (x.email || "").toLowerCase().trim() === emailLower);
        setErr(emailExists ? "Нууц үг буруу байна" : "И-мэйл олдсонгүй");
      }
    } catch (e) {
      console.error("Login error:", e);
      setErr("Сервертэй холбогдож чадахгүй байна: " + e.message);
    }
    setBusy(false);
  };

  const doLoginStudent = async () => {
    setBusy(true); setErr("");
    try {
      const emailLower = email.trim().toLowerCase();
      const allStudents = await fbSelect("students");
      const st = allStudents.find(x =>
        (x.email || "").toLowerCase().trim() === emailLower &&
        String(x.password || "") === String(pass)
      );
      if (st) {
        onAuth({ id: st.id, role: "student", displayName: st.name });
      } else {
        const emailExists = allStudents.some(x => (x.email || "").toLowerCase().trim() === emailLower);
        setErr(emailExists ? "Нууц үг буруу байна" : "И-мэйл олдсонгүй");
      }
    } catch (e) {
      console.error("Login error:", e);
      setErr("Сервертэй холбогдож чадахгүй байна: " + e.message);
    }
    setBusy(false);
  };

  const doRegister = async () => {
    if (!regName.trim() || !regEmail.trim() || !regClassId || regPass.length < 6) {
      setErr("Бүх талбарыг бөглөнө үү (нууц үг 6+ тэмдэгт)");
      return;
    }
    // И-мэйл format шалгах
    const emailTrim = regEmail.trim().toLowerCase();
    if (!emailTrim.includes("@") || !emailTrim.includes(".")) {
      setErr("И-мэйл хаяг буруу байна");
      return;
    }
    setBusy(true); setErr("");
    try {
      // Давхар email шалгах (students + pending)
      const [existingSts, existingPends] = await Promise.all([
        supaSelect("students", `select=id&email=eq.${encodeURIComponent(emailTrim)}`),
        supaSelect("pending_students", `select=id&email=eq.${encodeURIComponent(emailTrim)}`),
      ]);
      if (existingSts && existingSts.length > 0) {
        setErr("⚠️ Энэ и-мэйлээр аль хэдийн бүртгэлтэй байна");
        setBusy(false); return;
      }
      if (existingPends && existingPends.length > 0) {
        setErr("⚠️ Хүсэлт өмнө илгээсэн байна. Багш зөвшөөрөхийг хүлээ.");
        setBusy(false); return;
      }
      // Хүсэлт оруулах
      await supaInsert("pending_students", {
        id: `p${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
        name: regName.trim(),
        email: emailTrim,
        phone: regPhone.trim() || null,
        rd: regRd.trim() || null,
        password: regPass,
        class_id: regClassId,
        created_at: new Date().toISOString(),
      });
      setMode("student");
      setEmail(emailTrim); setPass("");
      setRegName(""); setRegEmail(""); setRegPhone(""); setRegRd(""); setRegPass("");
      setErr("✅ Хүсэлт илгээсэн! Багш зөвшөөрсний дараа нэвтэрнэ.");
    } catch (e) { setErr("Алдаа гарлаа: " + e.message); }
    setBusy(false);
  };

  // ── НУУЦ ҮГ СЭРГЭЭХ — РД оруулаад хайх ──
  const doForgotSearch = async () => {
    if (!forgotRd.trim() || forgotRd.trim().length < 4) {
      setErr("РД дугаараа зөв оруулна уу");
      return;
    }
    setBusy(true); setErr("");
    try {
      const rd = forgotRd.trim();
      // Сурагч + Багш хоёулангаас хайх
      const [sts, ts] = await Promise.all([
        supaSelect("students", `select=id,name,rd&rd=eq.${encodeURIComponent(rd)}`),
        supaSelect("teachers", `select=id,name,rd&rd=eq.${encodeURIComponent(rd)}`),
      ]);
      if (sts && sts.length > 0) {
        setForgotFoundUser({ ...sts[0], role: "student" });
        setErr("");
      } else if (ts && ts.length > 0) {
        setForgotFoundUser({ ...ts[0], role: "teacher" });
        setErr("");
      } else {
        setErr("⚠️ Энэ РД-тэй хэрэглэгч олдсонгүй. РД-ээ зөв оруулсан эсэхээ шалгана уу.");
      }
    } catch (e) { setErr("Алдаа: " + e.message); }
    setBusy(false);
  };

  const doForgotReset = async () => {
    if (!forgotNewPass || forgotNewPass.length < 6) {
      setErr("Шинэ нууц үг 6+ тэмдэгт байх ёстой");
      return;
    }
    if (forgotNewPass !== forgotNewPass2) {
      setErr("Нууц үг таарахгүй байна");
      return;
    }
    setBusy(true); setErr("");
    try {
      const table = forgotFoundUser.role === "student" ? "students" : "teachers";
      await supaUpdate(table, forgotFoundUser.id, { password: forgotNewPass });
      setErr("✅ Нууц үг шинэчлэгдлээ! Шинэ нууц үгээрээ нэвтрэнэ үү.");
      // Auto-switch to login mode
      setTimeout(() => {
        setMode(forgotFoundUser.role === "student" ? "student" : "teacher");
        setForgotRd(""); setForgotFoundUser(null);
        setForgotNewPass(""); setForgotNewPass2("");
        setErr("");
      }, 2000);
    } catch (e) { setErr("Алдаа: " + e.message); }
    setBusy(false);
  };

  const theme = mode === "teacher"
    ? { bg1: "#ffb74d", bg2: "#f57c00", emoji: "👩‍🏫", title: "Багш нэвтрэх", sub: "Ангиа удирдах" }
    : mode === "student"
      ? { bg1: "#ffa726", bg2: "#ef6c00", emoji: "🌸", title: "Сурагч нэвтрэх", sub: "Өнөөдрийн хичээлээ үзье!" }
      : mode === "forgot"
        ? { bg1: "#ff8a65", bg2: "#e64a19", emoji: "🔑", title: "Нууц үг сэргээх", sub: "РД-ээрээ сэргээх" }
        : { bg1: "#ffd54f", bg2: "#ffa000", emoji: "✏️", title: "Бүртгүүлэх", sub: "Шинэ сурагч" };

  return (
    <div className="k-gradient" style={{
      minHeight: "100vh",
      background: `linear-gradient(135deg,${theme.bg1} 0%,${theme.bg2} 50%,${theme.bg1} 100%)`,
      backgroundSize: "200% 200%",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, fontFamily: "system-ui", position: "relative", overflow: "hidden",
    }}>
      <style>{ANIMATIONS}</style>

      {/* Animated background */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {/* Том гэрэлтэх blobs */}
        <div className="k-float" style={{
          position: "absolute", top: "-12%", left: "-12%",
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)",
          animationDuration: "9s",
        }} />
        <div className="k-float" style={{
          position: "absolute", bottom: "-18%", right: "-12%",
          width: 380, height: 380, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.25), transparent 70%)",
          animationDuration: "11s", animationDelay: "1s",
        }} />
        {/* Хөвөгч emoji-ууд (солонгос+сургуулийн сэдэв) */}
        {["🌸", "📚", "✏️", "🎓", "⭐", "🇰🇷", "💛", "🍊"].map((e, i) => (
          <div key={i} className="k-float" style={{
            position: "absolute", left: `${4 + i * 12}%`, top: `${8 + (i % 4) * 23}%`,
            fontSize: 26 + (i % 3) * 10, opacity: 0.3, animationDelay: `${i * 0.6}s`,
            animationDuration: `${5 + (i % 3) * 2}s`,
          }}>{e}</div>
        ))}
      </div>

      <div className="k-rise" style={{
        background: "rgba(255,255,255,0.97)", borderRadius: 32, padding: "32px 26px 26px",
        width: "100%", maxWidth: 400, position: "relative", zIndex: 1,
        boxShadow: "0 25px 70px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.6)",
        backdropFilter: "blur(20px)",
      }}>
        {/* Header — том emoji дугуйтай */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          {/* Emoji circle with glow */}
          <div className="k-glow" style={{
            width: 92, height: 92, borderRadius: "50%", margin: "0 auto 14px",
            background: `linear-gradient(135deg,${theme.bg1},${theme.bg2})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 10px 30px ${theme.bg2}55`,
            position: "relative",
          }}>
            <div className="k-wiggle" style={{ fontSize: 50, lineHeight: 1 }}>{theme.emoji}</div>
            {/* Орбитлох жижиг од */}
            <div className="k-spin-slow" style={{
              position: "absolute", inset: -6, borderRadius: "50%",
              border: "2px dashed rgba(255,255,255,0.5)",
              animation: "kSpinSlow 12s linear infinite",
            }} />
          </div>
          <div style={{
            fontWeight: 900, fontSize: 26, color: "#1a1a2e",
            letterSpacing: "-0.5px", marginBottom: 4,
          }}>한국어 학원</div>
          <div className="k-gradient" style={{
            display: "inline-block",
            fontSize: 14, fontWeight: 800,
            background: `linear-gradient(135deg,${theme.bg1},${theme.bg2},${theme.bg1})`,
            backgroundSize: "200% 200%",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>🌸 Кандун University</div>
        </div>

        {/* Mode tabs — forgot үед нуух */}
        {mode !== "forgot" && (
          <div style={{ display: "flex", background: "#fff5e6", borderRadius: 16, padding: 5, marginBottom: 18, gap: 3 }}>
            {[["teacher", "👩‍🏫 Багш"], ["student", "🎓 Сурагч"], ["register", "✏️ Бүртгэл"]].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }}
                style={{
                  flex: 1, padding: "10px 4px", borderRadius: 12, border: "none",
                  background: mode === m ? `linear-gradient(135deg,${theme.bg1},${theme.bg2})` : "transparent",
                  color: mode === m ? "#fff" : "#bf8f3f",
                  fontWeight: mode === m ? 800 : 600, fontSize: 11, cursor: "pointer",
                  transition: "all .2s",
                  boxShadow: mode === m ? `0 4px 12px ${theme.bg2}66` : "none",
                }}>{label}</button>
            ))}
          </div>
        )}

        <div style={{
          textAlign: "center", marginBottom: 16, fontSize: 13,
          color: "#666", fontWeight: 600,
          padding: "8px 12px", background: `${theme.bg1}15`, borderRadius: 10,
        }}>
          ✨ {theme.sub}
        </div>

        {/* Form */}
        {(mode === "teacher" || mode === "student") ? (
          <>
            <input type="email" placeholder="И-мэйл" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...INP, marginBottom: 10 }} autoComplete="username" />
            <input type="password" placeholder="Нууц үг" value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (mode === "teacher" ? doLoginTeacher() : doLoginStudent())}
              style={{ ...INP, marginBottom: 6 }} autoComplete="current-password" />
            {/* Нууц үг мартсан уу? */}
            <div style={{ textAlign: "right", marginBottom: 10 }}>
              <button onClick={() => { setMode("forgot"); setErr(""); }}
                style={{ background: "transparent", border: "none", color: theme.bg2, fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                🔑 Нууц үг мартсан уу?
              </button>
            </div>
            <button onClick={mode === "teacher" ? doLoginTeacher : doLoginStudent} disabled={busy || !email || !pass}
              className="k-press"
              style={{
                width: "100%", padding: 15, borderRadius: 16, border: "none",
                background: `linear-gradient(135deg,${theme.bg1},${theme.bg2})`,
                color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
                boxShadow: `0 6px 20px ${theme.bg2}66`,
                opacity: (busy || !email || !pass) ? 0.6 : 1,
                transition: "all .2s",
              }}>
              {busy ? "⏳ Уншиж байна..." : `${theme.emoji} Нэвтрэх`}
            </button>
          </>
        ) : mode === "register" ? (
          <>
            <input placeholder="Овог нэр" value={regName} onChange={e => setRegName(e.target.value)} style={{ ...INP, marginBottom: 8 }} />
            <input type="email" placeholder="И-мэйл хаяг (нэвтрэхэд хэрэглэнэ)" value={regEmail} onChange={e => setRegEmail(e.target.value)} style={{ ...INP, marginBottom: 8 }} autoComplete="email" />
            <input placeholder="Утас" value={regPhone} onChange={e => setRegPhone(e.target.value)} style={{ ...INP, marginBottom: 8 }} />
            <input placeholder="Регистр" value={regRd} onChange={e => setRegRd(e.target.value)} style={{ ...INP, marginBottom: 8 }} />
            <select value={regClassId} onChange={e => setRegClassId(e.target.value)} style={{ ...INP, marginBottom: 8, cursor: "pointer" }}>
              <option value="">Сурах анги сонгох...</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="password" placeholder="Шинэ нууц үг (6+)" value={regPass} onChange={e => setRegPass(e.target.value)} style={{ ...INP, marginBottom: 14 }} />
            <button onClick={doRegister} disabled={busy}
              style={{
                width: "100%", padding: 13, borderRadius: 12, border: "none",
                background: `linear-gradient(135deg,${theme.bg1},${theme.bg2})`,
                color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                boxShadow: `0 4px 14px ${theme.bg2}55`,
                opacity: busy ? 0.6 : 1,
              }}>
              {busy ? "⏳..." : "✏️ Бүртгүүлэх"}
            </button>
          </>
        ) : (
          // ── FORGOT PASSWORD ──
          <>
            {!forgotFoundUser ? (
              <>
                <div style={{ background: "#fff3e0", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 11, color: "#e65100", lineHeight: 1.4 }}>
                  💡 РД дугаараа оруулна уу. Систем таныг олж, шинэ нууц үг үүсгэх боломж өгнө.
                </div>
                <input placeholder="🆔 РД дугаар"
                  value={forgotRd} onChange={e => setForgotRd(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doForgotSearch()}
                  style={{ ...INP, marginBottom: 14 }} />
                <button onClick={doForgotSearch} disabled={busy || !forgotRd.trim()}
                  style={{
                    width: "100%", padding: 13, borderRadius: 12, border: "none",
                    background: `linear-gradient(135deg,${theme.bg1},${theme.bg2})`,
                    color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                    boxShadow: `0 4px 14px ${theme.bg2}55`,
                    opacity: (busy || !forgotRd.trim()) ? 0.6 : 1, marginBottom: 8,
                  }}>
                  {busy ? "⏳ Хайж байна..." : "🔍 РД-аар хайх"}
                </button>
              </>
            ) : (
              // Хэрэглэгч олдсон — шинэ нууц үг
              <>
                <div style={{ background: "#e8f5e9", borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1b5e20", marginBottom: 4 }}>
                    ✅ Хэрэглэгч олдлоо!
                  </div>
                  <div style={{ fontSize: 13, color: "#2e7d32" }}>
                    {forgotFoundUser.role === "student" ? "🎓" : "👩‍🏫"} <b>{forgotFoundUser.name}</b>
                  </div>
                </div>
                <input type="password" placeholder="Шинэ нууц үг (6+ тэмдэгт)"
                  value={forgotNewPass} onChange={e => setForgotNewPass(e.target.value)}
                  style={{ ...INP, marginBottom: 8 }} />
                <input type="password" placeholder="Шинэ нууц үг (давтан)"
                  value={forgotNewPass2} onChange={e => setForgotNewPass2(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doForgotReset()}
                  style={{ ...INP, marginBottom: 14 }} />
                <button onClick={doForgotReset} disabled={busy || !forgotNewPass || !forgotNewPass2}
                  style={{
                    width: "100%", padding: 13, borderRadius: 12, border: "none",
                    background: `linear-gradient(135deg,${theme.bg1},${theme.bg2})`,
                    color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                    boxShadow: `0 4px 14px ${theme.bg2}55`,
                    opacity: (busy || !forgotNewPass || !forgotNewPass2) ? 0.6 : 1, marginBottom: 8,
                  }}>
                  {busy ? "⏳..." : "💾 Нууц үг шинэчлэх"}
                </button>
                <button onClick={() => { setForgotFoundUser(null); setForgotNewPass(""); setForgotNewPass2(""); setErr(""); }}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e0e0e0", background: "#fff", color: "#666", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  ← Өөр РД оруулах
                </button>
              </>
            )}
            <button onClick={() => { setMode("student"); setErr(""); setForgotRd(""); setForgotFoundUser(null); setForgotNewPass(""); setForgotNewPass2(""); }}
              style={{ width: "100%", padding: 8, borderRadius: 10, border: "none", background: "transparent", color: "#666", fontSize: 12, cursor: "pointer", marginTop: 8, textDecoration: "underline" }}>
              ← Нэвтрэх рүү буцах
            </button>
          </>
        )}

        {err && (
          <div className="k-pop" style={{
            marginTop: 14, padding: "10px 14px",
            background: err.startsWith("✅") ? "#e8f5e9" : "#fff5f5",
            color: err.startsWith("✅") ? "#1b5e20" : "#c62828",
            border: `1.5px solid ${err.startsWith("✅") ? "#a5d6a7" : "#ffcdd2"}`,
            borderRadius: 12, fontSize: 12, textAlign: "center", fontWeight: 700,
            boxShadow: err.startsWith("✅") ? "0 4px 12px rgba(67,160,71,0.15)" : "0 4px 12px rgba(229,57,53,0.1)",
          }}>{err}</div>
        )}
      </div>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 4 — VocabTab, DailyCalendarTab, Leaderboard, AttendanceStats
// ════════════════════════════════════════════════════════════════════

// ── VocabTab (Үгсийн жагсаалт, дуудлага сонсох) ──────────────────
// ════════════════════════════════════════════════════════════════════
// VocabListView — Бүх үгсийг он сартай харах + Хэвлэх
// ════════════════════════════════════════════════════════════════════

function VocabListView({ vocabEntries, t, className, onClose, weakWords = [] }) {
  const [filter, setFilter] = useState("all"); // all | vocab | grammar
  const [sortBy, setSortBy] = useState("date_desc"); // date_desc | date_asc
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState("date"); // "date" | "category"

  // Бүх категориуд байгаа эсэх
  const hasCategories = useMemo(() =>
    vocabEntries.some(v => v.category && v.category.trim()), [vocabEntries]);

  // Бүх үгсийг өдөр ЭСВЭЛ сэдвээр group хийх
  const grouped = useMemo(() => {
    let filtered = vocabEntries.filter(v => {
      if (filter === "vocab") return v.type !== "grammar";
      if (filter === "grammar") return v.type === "grammar";
      return true;
    });
    // Хайлт — солонгос ба монгол хоёуланд
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(v =>
        (v.word || "").toLowerCase().includes(q) ||
        (v.meaning || "").toLowerCase().includes(q)
      );
    }
    const map = {};
    if (groupMode === "category") {
      // Сэдвээр group
      filtered.forEach(v => {
        const cat = (v.category && v.category.trim()) || "🏷️ Ангилаагүй";
        if (!map[cat]) map[cat] = [];
        map[cat].push(v);
      });
      const cats = Object.keys(map).sort((a, b) => {
        // "Ангилаагүй" хамгийн доор
        if (a.includes("Ангилаагүй")) return 1;
        if (b.includes("Ангилаагүй")) return -1;
        return a.localeCompare(b);
      });
      return cats.map(cat => ({ date: cat, items: map[cat], isCategory: true }));
    } else {
      // Огноогоор group
      filtered.forEach(v => {
        const d = v.date || "Огноогүй";
        if (!map[d]) map[d] = [];
        map[d].push(v);
      });
      const dates = Object.keys(map).sort();
      if (sortBy === "date_desc") dates.reverse();
      return dates.map(d => ({ date: d, items: map[d] }));
    }
  }, [vocabEntries, filter, sortBy, search, groupMode]);

  const totalVocab = vocabEntries.filter(v => v.type !== "grammar").length;
  const totalGrammar = vocabEntries.filter(v => v.type === "grammar").length;
  const searchResultCount = grouped.reduce((sum, g) => sum + g.items.length, 0);

  const wordStatus = (word) => {
    const wk = weakWords.find(w => (typeof w === "string" ? w : w.word) === word);
    if (!wk) return null;
    if (typeof wk === "string") return { color: "#f57c00", label: "1 удаа алдсан" };
    const cnt = wk.miss_count || 0;
    if (cnt >= 2) return { color: "#e53935", label: `${cnt} удаа алдсан` };
    if (cnt === 1) return { color: "#f57c00", label: "1 удаа алдсан" };
    return null;
  };

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Pop-up хаагдсан байна. Browser-ийн pop-up зөвшөөрөл өгнө үү");
      return;
    }
    let html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${className || "Үгсийн жагсаалт"}</title>
<style>
  @page { size: A4; margin: 1.5cm }
  body { font-family: 'Arial', sans-serif; color: #1a1a2e; padding: 0; margin: 0 }
  h1 { color: #7c3aed; text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 8px; margin-top: 0; font-size: 22px }
  .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px }
  .date-section { margin-bottom: 18px; page-break-inside: avoid }
  .date-title { background: #f5f0ff; color: #7c3aed; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; margin-bottom: 8px; display: inline-block }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px }
  th { background: #e3f2fd; padding: 6px 10px; text-align: left; font-size: 12px; border: 1px solid #b3d9ff }
  td { padding: 6px 10px; border: 1px solid #e0e0e0; font-size: 13px }
  td.kr { font-weight: bold; color: #1a1a2e; width: 30% }
  td.mn { color: #555 }
  td.type { width: 60px; text-align: center; font-size: 11px }
  .type.g { color: #7c3aed; background: #f5f0ff; font-weight: bold }
  .type.v { color: #b8860b; background: #fff8e1; font-weight: bold }
  .footer { text-align: center; color: #999; font-size: 10px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px }
  @media print { .no-print { display: none } }
</style>
</head><body>
<h1>📚 ${className || "Үгсийн жагсаалт"}</h1>
<div class="meta">Нийт: ${totalVocab} үг · ${totalGrammar} дүрэм · ${new Date().toLocaleDateString("mn-MN")} хэвлэв</div>
`;
    grouped.forEach(g => {
      html += `<div class="date-section">
<div class="date-title">📅 ${g.date}</div>
<table>
<thead><tr><th class="type">Төрөл</th><th>Солонгос</th><th>Монгол</th></tr></thead>
<tbody>`;
      g.items.forEach(v => {
        const isGr = v.type === "grammar";
        html += `<tr>
<td class="type ${isGr ? 'g' : 'v'}">${isGr ? '📖' : '📚'}</td>
<td class="kr">${v.word || ""}</td>
<td class="mn">${v.meaning || ""}</td>
</tr>`;
      });
      html += `</tbody></table></div>`;
    });
    html += `<div class="footer">🌸 Кандун University Korean School</div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`;
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="k-fade" style={{ background: t.card, borderRadius: 18, padding: 14, border: `2px solid ${t.border}` }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>📚 Шинэ үгсийн жагсаалт</div>
          <div style={{ fontSize: 11, color: t.text, opacity: .6, marginTop: 2 }}>
            {totalVocab} үг · {totalGrammar} дүрэм
          </div>
        </div>
        <button onClick={handlePrint} className="k-press"
          style={{ background: "#1976d2", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer", boxShadow: "0 3px 0 #0d47a1", display: "flex", alignItems: "center", gap: 5 }}>
          🖨️ Хэвлэх
        </button>
      </div>

      {/* Хайлт */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Үг хайх (солонгос эсвэл монгол)..."
          style={{ ...INP, paddingLeft: 14, fontSize: 13 }} />
        {search && (
          <button onClick={() => setSearch("")}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "#eee", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, color: "#666" }}>✕</button>
        )}
      </div>
      {search && (
        <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 8 }}>
          🔍 {searchResultCount} илэрц олдлоо
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 5, marginBottom: 10, background: t.soft, borderRadius: 10, padding: 3 }}>
        {[["all", `📋 Бүгд (${vocabEntries.length})`], ["vocab", `📚 Үг (${totalVocab})`], ["grammar", `📖 Дүрэм (${totalGrammar})`]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            flex: 1, padding: "6px 4px", borderRadius: 8, border: "none",
            background: filter === id ? "#fff" : "transparent",
            color: filter === id ? t.accent : t.text,
            fontWeight: filter === id ? 800 : 600, fontSize: 11, cursor: "pointer",
            boxShadow: filter === id ? `0 1px 4px ${t.accent}33` : "none",
          }}>{label}</button>
        ))}
      </div>

      {/* Групп горим + Sort */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        {/* Өдөр / Сэдэв солих */}
        {hasCategories && (
          <div style={{ display: "flex", gap: 3, background: t.soft, borderRadius: 8, padding: 3 }}>
            <button onClick={() => setGroupMode("date")} style={{
              padding: "5px 10px", borderRadius: 6, border: "none",
              background: groupMode === "date" ? "#fff" : "transparent",
              color: groupMode === "date" ? t.accent : t.text,
              fontWeight: groupMode === "date" ? 800 : 600, fontSize: 11, cursor: "pointer",
            }}>📅 Өдрөөр</button>
            <button onClick={() => setGroupMode("category")} style={{
              padding: "5px 10px", borderRadius: 6, border: "none",
              background: groupMode === "category" ? "#fff" : "transparent",
              color: groupMode === "category" ? t.accent : t.text,
              fontWeight: groupMode === "category" ? 800 : 600, fontSize: 11, cursor: "pointer",
            }}>🏷️ Сэдвээр</button>
          </div>
        )}
        {groupMode === "date" && (
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 11, background: "#fff", cursor: "pointer", marginLeft: "auto" }}>
            <option value="date_desc">📅 Шинэ нь эхэнд</option>
            <option value="date_asc">📅 Хуучин нь эхэнд</option>
          </select>
        )}
      </div>

      {/* Color legend (зөвхөн weakWords байвал) */}
      {weakWords.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, padding: 8, background: "#fff", borderRadius: 10, fontSize: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: "#66bb6a" }} />
            <span>Сайн цээжилсэн</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: "#f57c00" }} />
            <span>1 удаа алдсан</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: "#e53935" }} />
            <span>Олон алдсан</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: "#bbb" }} />
            <span>Бэлдээгүй</span>
          </div>
        </div>
      )}

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: t.text, opacity: .5 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Үг байхгүй байна</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {grouped.map(g => (
            <div key={g.date} style={{ background: "#fff", borderRadius: 12, padding: 10, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: t.accent, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${t.soft}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{g.isCategory ? g.date : `📅 ${g.date}`}</span>
                <span style={{ fontSize: 10, color: t.text, opacity: .6, fontWeight: 600 }}>{g.items.length} зүйл</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {g.items.map(v => {
                  const status = wordStatus(v.word);
                  const isGr = v.type === "grammar";
                  // 4 өнгөтэй харагдах:
                  // - status.color (улаан/шар) — алдсан бол
                  // - ногоон — сайн цээжилсэн (status байхгүй ч weakWords-д бусад үг байгаа бол)
                  // - саарал — огт бэлдээгүй (weakWords нь бараг хоосон)
                  const hasAnyPractice = weakWords.length > 0;
                  const wordColor = status ? status.color : (hasAnyPractice ? "#66bb6a" : "#bbb");
                  return (
                    <div key={v.id} onClick={() => speakKr(v.word)} className="k-press"
                      style={{
                        padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                        background: isGr ? "#f5f0ff" : "#fffdf5",
                        border: `1px solid ${isGr ? "#d4b8ff" : "#ffe082"}`,
                        borderLeft: `4px solid ${wordColor}`,
                        display: "flex", alignItems: "center", gap: 8,
                      }} title="🔊 Дуудлага сонсох">
                      <div style={{ flexShrink: 0, width: 22, textAlign: "center" }}>
                        {isGr ? "📖" : "📚"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: isGr ? "#7c3aed" : "#b8860b" }}>{v.word}</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{v.meaning}</div>
                      </div>
                      {status && (
                        <div style={{ fontSize: 9, color: status.color, fontWeight: 700, background: "#fff", padding: "2px 6px", borderRadius: 6 }}>
                          {status.label}
                        </div>
                      )}
                      <span style={{ fontSize: 12, opacity: .4 }}>🔊</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function VocabTab({ vocabEntries, t }) {
  const vocabs = vocabEntries.filter(v => v.type !== "grammar");
  const grammars = vocabEntries.filter(v => v.type === "grammar");

  if (vocabs.length === 0 && grammars.length === 0) {
    return (
      <div className="k-fade" style={{ background: t.card, borderRadius: 18, padding: 30, textAlign: "center", border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 48, opacity: .4, marginBottom: 10 }}>📭</div>
        <div style={{ fontSize: 14, color: t.text, fontWeight: 700 }}>Үг байхгүй байна</div>
        <div style={{ fontSize: 11, color: t.text, opacity: .6, marginTop: 4 }}>Багш үг нэмсний дараа харагдана</div>
      </div>
    );
  }

  return (
    <div className="k-fade" style={{ background: t.card, borderRadius: 18, padding: 14, border: `2px solid ${t.border}` }}>
      {vocabs.length > 0 && (
        <div style={{ marginBottom: grammars.length > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.accent, marginBottom: 8 }}>📚 Үгс ({vocabs.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {vocabs.map(v => (
              <div key={v.id} onClick={() => speakKr(v.word)} className="k-press"
                style={{
                  background: t.soft, borderRadius: 10, padding: "8px 10px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: "pointer", borderLeft: `3px solid ${t.accent}`,
                }} title="🔊 Дуудлага сонсох">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: t.text }}>{v.word}</div>
                  <div style={{ fontSize: 10, color: t.text, opacity: .65, marginTop: 1 }}>{v.meaning}</div>
                </div>
                <span style={{ fontSize: 12, opacity: .5, marginLeft: 4 }}>🔊</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {grammars.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", marginBottom: 8 }}>📖 Дүрэм ({grammars.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {grammars.map(v => (
              <div key={v.id} onClick={() => speakKr(v.word)} className="k-press"
                style={{
                  background: "#f5f0ff", borderRadius: 10, padding: "8px 12px",
                  border: "1px solid #c5b8ff", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                }} title="🔊 Дуудлага сонсох">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#7c3aed" }}>{v.word}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{v.meaning}</div>
                </div>
                <span style={{ fontSize: 12, opacity: .5 }}>🔊</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DailyCalendarTab (Өдөр өдрөөр харах) ─────────────────────────
function DailyCalendarTab({ vocabEntries, t, classDays, classStartDate, classColor }) {
  const [viewMonth, setViewMonth] = useState(NOW_MONTH);
  const [selDate, setSelDate] = useState(TODAY);

  const monthDays = useMemo(() => {
    const [y, m] = viewMonth.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sun
    const adjFirstDow = firstDow === 0 ? 6 : firstDow - 1; // Make Mon=0
    const days = [];
    for (let i = 0; i < adjFirstDow; i++) days.push(null);
    const startD = classStartDate ? new Date(classStartDate) : null;
    for (let d = 1; d <= last; d++) {
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dt = new Date(y, m - 1, d);
      let dow = dt.getDay(); dow = dow === 0 ? 7 : dow;
      const isLessonDay = (classDays || []).includes(dow);
      // Анги эхэлсэн өдрөөс хойшхи хичээлийн өдөр л зөвхөн "идэвхтэй"
      const isActiveLessonDay = isLessonDay && (!startD || dt >= startD);
      const isBeforeStart = startD && dt < startD;
      const vocabCount = vocabEntries.filter(v => v.date === dateStr && v.type !== "grammar").length;
      const grammarCount = vocabEntries.filter(v => v.date === dateStr && v.type === "grammar").length;
      days.push({ day: d, dateStr, isLessonDay, isActiveLessonDay, isBeforeStart, vocabCount, grammarCount, total: vocabCount + grammarCount });
    }
    return days;
  }, [viewMonth, vocabEntries, classDays, classStartDate]);

  const selDayVocabs = vocabEntries.filter(v => v.date === selDate && v.type !== "grammar");
  const selDayGrammars = vocabEntries.filter(v => v.date === selDate && v.type === "grammar");
  const lessonColor = classColor || t.accent;

  return (
    <div className="k-fade" style={{ background: t.card, borderRadius: 18, padding: 14, border: `2px solid ${t.border}` }}>
      {/* Month picker */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => {
          const [y, m] = viewMonth.split("-").map(Number);
          const nd = new Date(y, m - 2, 1);
          setViewMonth(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`);
        }} style={btn(t.soft, t.text)}>←</button>
        <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{viewMonth}</div>
        <button onClick={() => {
          const [y, m] = viewMonth.split("-").map(Number);
          const nd = new Date(y, m, 1);
          setViewMonth(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`);
        }} style={btn(t.soft, t.text)}>→</button>
      </div>

      {/* Day labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
        {["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: t.text, opacity: .6 }}>{d}</div>
        ))}
      </div>

      {/* Тайлбар */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: lessonColor + "55", border: `1px solid ${lessonColor}` }} />
          <span style={{ color: t.text, opacity: .7 }}>Хичээлийн өдөр</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: "transparent", border: `2px solid ${lessonColor}` }} />
          <span style={{ color: t.text, opacity: .7 }}>Өнөөдөр</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 14 }}>
        {monthDays.map((d, i) => {
          if (!d) return <div key={i} />;
          const isSel = d.dateStr === selDate;
          const isToday = d.dateStr === TODAY;
          // Өнгөний логик
          let bg = "transparent", borderC = "transparent", color = t.text;
          if (isSel) {
            bg = lessonColor; color = "#fff"; borderC = lessonColor;
          } else if (d.isActiveLessonDay) {
            bg = lessonColor + "33"; borderC = lessonColor + "88";
          } else if (d.isBeforeStart) {
            bg = "transparent"; color = "#ccc"; borderC = "transparent";
          }
          return (
            <div key={i} onClick={() => setSelDate(d.dateStr)} className="k-press"
              style={{
                aspectRatio: "1", borderRadius: 8, position: "relative",
                background: bg,
                border: isToday ? `2px solid ${lessonColor}` : `1px solid ${borderC}`,
                color,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 11, fontWeight: isToday ? 800 : 600,
                opacity: d.isBeforeStart ? .4 : 1,
              }}>
              {d.day}
              {d.total > 0 && (
                <div style={{
                  position: "absolute", bottom: 1, right: 2,
                  width: 14, height: 14, borderRadius: "50%",
                  background: isSel ? "#fff" : t.accent,
                  color: isSel ? t.accent : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 800,
                }}>{d.total}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected day content */}
      <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: t.accent, marginBottom: 8 }}>
          📅 {fmtDate(selDate)}
        </div>
        {selDayVocabs.length === 0 && selDayGrammars.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: t.text, opacity: .5, fontSize: 12 }}>
            Энэ өдөр үг нэмэгдээгүй
          </div>
        ) : (
          <>
            {selDayVocabs.length > 0 && (
              <div style={{ marginBottom: selDayGrammars.length > 0 ? 10 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.accent, marginBottom: 6 }}>📚 Үгс</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selDayVocabs.map(v => (
                    <div key={v.id} onClick={() => speakKr(v.word)} className="k-press"
                      style={{ background: t.soft, borderRadius: 8, padding: "7px 10px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 13, color: t.text }}>{v.word}</span>
                        <span style={{ fontSize: 11, color: t.text, opacity: .6, marginLeft: 8 }}>{v.meaning}</span>
                      </div>
                      <span style={{ fontSize: 11, opacity: .5 }}>🔊</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selDayGrammars.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 6 }}>📖 Дүрэм</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selDayGrammars.map(v => (
                    <div key={v.id} onClick={() => speakKr(v.word)} className="k-press"
                      style={{ background: "#f5f0ff", borderRadius: 8, padding: "7px 10px", cursor: "pointer", border: "1px solid #c5b8ff" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#7c3aed" }}>{v.word}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{v.meaning}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Leaderboard (Ангийн топ) ────────────────────────────────────
function Leaderboard({ students, myId, classColor = "#7c3aed" }) {
  const sorted = [...students].sort((a, b) => (b.xp || 0) - (a.xp || 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map((s, i) => {
        const t2 = getTheme(s.theme_id);
        const isMe = s.id === myId;
        const medals = ["🥇", "🥈", "🥉"];
        return (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: 12,
            background: isMe ? `${classColor}22` : "#fff",
            border: isMe ? `2px solid ${classColor}` : "1px solid #f0f0f0",
            animation: `kSlideUp .3s ease ${i * 0.04}s both`,
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: i < 3 ? "#b8860b" : "#999", width: 32, textAlign: "center" }}>
              {i < 3 ? medals[i] : `#${i + 1}`}
            </div>
            <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: t2.soft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: `2px solid ${t2.accent}` }}>
              {s.photo_url ? <img src={s.photo_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : t2.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name} {isMe && <span style={{ fontSize: 10, color: classColor, fontWeight: 800 }}>(Та)</span>}
              </div>
              <div style={{ fontSize: 10, color: "#888" }}>{TOPIK[s.level || 0]}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: classColor }}>⚡{s.xp || 0}</div>
              <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>XP</div>
            </div>
          </div>
        );
      })}
      {students.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#aaa", fontSize: 13 }}>Сурагч байхгүй байна</div>
      )}
    </div>
  );
}

// ── AttendanceStats (3-баганатай) ────────────────────────────────
function AttendanceStats({ present, total, card }) {
  const pct = total > 0 ? Math.round(present / total * 100) : 0;
  const color = pct >= 80 ? "#2e7d32" : pct >= 60 ? "#e65100" : "#c62828";
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
      <div style={{ flex: 1, background: card, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color }}>{pct}%</div>
        <div style={{ fontSize: 9, color: "#888", fontWeight: 600 }}>Энэ сарын ирц</div>
      </div>
      <div style={{ flex: 1, background: card, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#2e7d32" }}>{present}</div>
        <div style={{ fontSize: 9, color: "#888", fontWeight: 600 }}>Ирсэн</div>
      </div>
      <div style={{ flex: 1, background: card, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e" }}>{total}</div>
        <div style={{ fontSize: 9, color: "#888", fontWeight: 600 }}>Нийт</div>
      </div>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 5 — BulkAttendance, ChangePasswordModal, AdminPanel
// ════════════════════════════════════════════════════════════════════

// ── BulkAttendance (Нэг дороос бүх сурагчийн ирц авах) ──────────
function BulkAttendance({ students, classDays, setStudents, onClose, onToast }) {
  const [date, setDate] = useState(TODAY);
  const [present, setPresent] = useState(() => {
    const s = new Set();
    students.forEach(st => { if ((st.attendance || {})[TODAY]) s.add(st.id); });
    return s;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = new Set();
    students.forEach(st => { if ((st.attendance || {})[date]) s.add(st.id); });
    setPresent(s);
  }, [date, students]);

  const isLessonDay = (() => {
    if (!classDays || !classDays.length) return true;
    const dt = new Date(date); let dow = dt.getDay(); dow = dow === 0 ? 7 : dow;
    return classDays.includes(dow);
  })();

  const toggleAll = () => {
    if (present.size === students.length) setPresent(new Set());
    else setPresent(new Set(students.map(s => s.id)));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Бүх сурагчийн ирцийг шинэчлэх
      const updates = students.map(st => {
        const att = { ...(st.attendance || {}) };
        if (present.has(st.id)) att[date] = true; else delete att[date];
        return { id: st.id, attendance: att };
      });
      // Database-д бүгдийг parallel хадгалах
      await Promise.all(updates.map(u => supaUpdate("students", u.id, { attendance: u.attendance })));
      // State-ийг нэг удаа шинэчлэх (бүх сурагчдыг нэг дор)
      setStudents(prev => prev.map(s => {
        const u = updates.find(x => x.id === s.id);
        return u ? { ...s, attendance: u.attendance } : s;
      }));
      onToast && onToast(`✅ ${students.length} сурагчийн ирц хадгалагдлаа`, "success");
      onClose();
    } catch (e) { onToast && onToast("❌ Алдаа: " + e.message, "error"); }
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose} maxW={420}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>📋 Хурдан ирц</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Нэг дороос ирц тэмдэглэх</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 5 }}>📅 ОГНОО</div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INP} />
        {!isLessonDay && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#e65100", background: "#fff3e0", padding: "5px 8px", borderRadius: 6 }}>
            ⚠️ Энэ өдөр хичээлийн өдөр биш
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "#555", fontWeight: 700 }}>{present.size}/{students.length} сонгогдсон</div>
        <button onClick={toggleAll} style={btn("#f0f0ff", "#7c3aed")}>
          {present.size === students.length ? "✕ Цэвэрлэх" : "✓ Бүгдийг"}
        </button>
      </div>

      <div style={{ maxHeight: "50vh", overflowY: "auto", marginBottom: 12 }}>
        {students.map(st => {
          const isPres = present.has(st.id);
          const t2 = getTheme(st.theme_id);
          return (
            <div key={st.id} onClick={() => {
              const ns = new Set(present);
              if (isPres) ns.delete(st.id); else ns.add(st.id);
              setPresent(ns);
            }} className="k-press" style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", marginBottom: 4, borderRadius: 12,
              background: isPres ? "#e8f5e9" : "#fafafa",
              border: `2px solid ${isPres ? "#66bb6a" : "#eee"}`,
              cursor: "pointer", transition: "all .15s",
            }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: t2.soft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                {st.photo_url ? <img src={st.photo_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : t2.emoji}
              </div>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#1a1a2e" }}>{st.name}</div>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: isPres ? "#43a047" : "#fff", border: `2px solid ${isPres ? "#43a047" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800 }}>
                {isPres ? "✓" : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={save} disabled={saving} style={{ ...btn("#43a047", "#fff"), flex: 2, justifyContent: "center", boxShadow: "0 3px 0 #2e7d32" }}>
          {saving ? "⏳ Хадгалж байна..." : `✅ Хадгалах (${present.size})`}
        </button>
      </div>
    </Overlay>
  );
}

// ── ChangePasswordModal ────────────────────────────────────────
function ChangePasswordModal({ onClose, teacherId, studentId, onToast }) {
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (newP.length < 6) { setErr("Шинэ нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой"); return; }
    setBusy(true); setErr("");
    try {
      const table = teacherId ? "teachers" : "students";
      const id = teacherId || studentId;
      const list = await supaSelect(table, `select=*&id=eq.${id}`);
      if (!list.length) { setErr("Хэрэглэгч олдсонгүй"); setBusy(false); return; }
      if (list[0].password !== oldP) { setErr("Хуучин нууц үг буруу"); setBusy(false); return; }
      await supaUpdate(table, id, { password: newP });
      onToast && onToast("✅ Нууц үг солигдлоо", "success");
      onClose();
    } catch (e) { setErr("Алдаа: " + e.message); }
    setBusy(false);
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>🔑 Нууц үг солих</div>
      <input type="password" placeholder="Хуучин нууц үг" value={oldP} onChange={e => setOldP(e.target.value)} style={{ ...INP, marginBottom: 8 }} />
      <input type="password" placeholder="Шинэ нууц үг (6+)" value={newP} onChange={e => setNewP(e.target.value)} style={{ ...INP, marginBottom: 12 }} />
      {err && <div style={{ background: "#ffebee", color: "#c62828", padding: "6px 10px", borderRadius: 8, fontSize: 11, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={submit} disabled={busy || !oldP || !newP} style={{ ...btn("#7c3aed", "#fff"), flex: 2, justifyContent: "center" }}>
          {busy ? "..." : "Солих"}
        </button>
      </div>
    </Overlay>
  );
}

// ── AdminPanel (Сүпэр админд — pending students, teachers) ──────
function AdminPanel({ students, setStudents, currentTeacherId, onClose, onToast, onRefresh, classes = [] }) {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [teachers, setTeachers] = useState([]);

  useEffect(() => {
    supaSelect("pending_students").then(setPending);
    supaSelect("teachers").then(setTeachers);
  }, []);

  const approvePending = async (p) => {
    try {
      await supaInsert("students", {
        id: `s${Date.now()}`,
        name: p.name, phone: p.phone, rd: p.rd, password: p.password,
        class_id: p.class_id, email: p.email || `${p.name.toLowerCase().replace(/\s/g, '')}@kandun.mn`,
        enroll_date: TODAY, level: 0, theme_id: "sakura", xp: 0,
        attendance: {}, badges: [], weak_words: [],
      });
      await supaDelete("pending_students", p.id);
      setPending(prev => prev.filter(x => x.id !== p.id));
      onToast && onToast("✅ Сурагч баталгаажлаа", "success");
      onRefresh && onRefresh();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  const rejectPending = async (p) => {
    if (!window.confirm("Хүсэлт татгалзах уу?")) return;
    await supaDelete("pending_students", p.id);
    setPending(prev => prev.filter(x => x.id !== p.id));
    onToast && onToast("Татгалзлаа", "info");
  };

  return (
    <Overlay onClose={onClose} maxW={500}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>🔑 Бүртгэл удирдах</div>

      <div style={{ display: "flex", gap: 5, marginBottom: 14, background: "#f0f0f5", borderRadius: 10, padding: 3 }}>
        {[["pending", `⏳ Хүлээгдэж буй (${pending.length})`], ["teachers", `👩‍🏫 Багш (${teachers.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "8px", borderRadius: 8, border: "none",
            background: tab === id ? "#fff" : "transparent",
            color: tab === id ? "#7c3aed" : "#888",
            fontWeight: tab === id ? 800 : 600, fontSize: 11, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
        {tab === "pending" && (
          pending.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#aaa" }}>
              <div style={{ fontSize: 40, opacity: .4, marginBottom: 8 }}>📭</div>
              Хүлээгдэж буй хүсэлт байхгүй
            </div>
          ) : pending.map(p => {
            const cls = (typeof classes !== "undefined" && classes.find) ? classes.find(c => c.id === p.class_id) : null;
            return (
              <div key={p.id} style={{ background: "#fff8e1", borderRadius: 12, padding: 12, marginBottom: 8, border: "1px solid #ffe082" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#b8860b", marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
                  📧 {p.email || "—"}<br />
                  📞 {p.phone || "—"} · 🆔 {p.rd || "—"}<br />
                  📚 Анги: {cls?.name || p.class_id}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => approvePending(p)} style={{ ...btn("#43a047", "#fff"), flex: 1, justifyContent: "center" }}>✅ Зөвшөөрөх</button>
                  <button onClick={() => rejectPending(p)} style={btn("#fff", "#c62828", "#ffcdd2")}>✕</button>
                </div>
              </div>
            );
          })
        )}
        {tab === "teachers" && teachers.map(t => (
          <div key={t.id} style={{ background: "#f5f0ff", borderRadius: 12, padding: 12, marginBottom: 8, border: "1px solid #d4b8ff" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#7c3aed" }}>{t.name}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              📧 {t.email} · {t.role === "superadmin" ? "👑 Super Admin" : "Багш"}
            </div>
          </div>
        ))}
      </div>
    </Overlay>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 6 — HomeworkPanel (Гэрийн даалгавар систем)
// ════════════════════════════════════════════════════════════════════

// Format datetime
const fmtDT = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
};

// ── CreateHomeworkModal — Багш даалгавар үүсгэх ───────────────
function CreateHomeworkModal({ cls, vocabEntries, teacherId, onClose, onCreated, onToast }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [scopeDate, setScopeDate] = useState(TODAY);
  const [xpReward, setXpReward] = useState(30);
  const [saving, setSaving] = useState(false);

  const scopeVocabs = vocabEntries.filter(v => v.date === scopeDate);
  const availableDates = useMemo(() => {
    return [...new Set(vocabEntries.filter(v => v.date).map(v => v.date))].sort().reverse();
  }, [vocabEntries]);

  const submit = async () => {
    if (!title.trim()) { onToast && onToast("❌ Гарчиг шаардлагатай", "error"); return; }
    if (scopeVocabs.length === 0) { onToast && onToast("❌ Үг сонгох хэрэгтэй", "error"); return; }
    setSaving(true);
    try {
      const hw = {
        id: `hw${Date.now()}`,
        class_id: cls.id, teacher_id: teacherId,
        title: title.trim(), description: description.trim() || null,
        file_url: fileUrl.trim() || null, file_name: fileName.trim() || null,
        vocab_ids: scopeVocabs.map(v => v.id),
        due_date: dueDate, xp_reward: xpReward,
      };
      await supaInsert("homeworks", hw);
      onCreated && onCreated(hw);
      onToast && onToast("✅ Даалгавар илгээгдлээ", "success");
      onClose();
    } catch (e) { onToast && onToast("❌ Алдаа: " + e.message, "error"); }
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose} maxW={440}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 28 }}>📝</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>Гэрийн даалгавар өгөх</div>
          <div style={{ fontSize: 11, color: "#888" }}>{cls.name}</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📌 ГАРЧИГ</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Жишээ нь: Сарын 16-ны үгсээ цээжлэх" style={INP} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📅 ҮГИЙН ХАМРАХ ӨДӨР</div>
        {availableDates.length === 0 ? (
          <div style={{ background: "#fff3cd", border: "1px solid #ffe082", borderRadius: 10, padding: 10, fontSize: 12, color: "#b8860b" }}>
            ⚠️ Үг нэмээгүй байна
          </div>
        ) : (
          <select value={scopeDate} onChange={e => setScopeDate(e.target.value)} style={{ ...INP, cursor: "pointer" }}>
            {availableDates.map(d => {
              const cnt = vocabEntries.filter(v => v.date === d).length;
              return <option key={d} value={d}>{d} — {cnt} үг</option>;
            })}
          </select>
        )}
        {scopeVocabs.length > 0 && (
          <div style={{ marginTop: 6, background: "#f5f0ff", borderRadius: 10, padding: 8, fontSize: 11, color: "#7c3aed" }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>🎯 {scopeVocabs.length} үг/дүрэм:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {scopeVocabs.slice(0, 8).map(v => (
                <span key={v.id} style={{ background: "#fff", borderRadius: 6, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>{v.word}</span>
              ))}
              {scopeVocabs.length > 8 && <span style={{ opacity: .6 }}>+{scopeVocabs.length - 8}</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>⏰ ДУУСАХ ХУГАЦАА</div>
        <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} min={new Date().toISOString().slice(0, 16)} style={INP} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📋 ЗААВАРЧИЛГАА (заавал биш)</div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Тайлбар..." rows={3} style={{ ...INP, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📎 ЗУРАГ ХАВСРАЛТ (заавал биш)</div>
        {fileUrl && fileUrl.startsWith("data:image") ? (
          <div style={{ position: "relative", marginBottom: 6 }}>
            <img src={fileUrl} style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10, border: "1px solid #e0e0e0" }} alt="" />
            <button onClick={() => { setFileUrl(""); setFileName(""); }}
              style={{ position: "absolute", top: 6, right: 6, background: "#e53935", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
          </div>
        ) : (
          <label style={{
            display: "block", padding: 12, borderRadius: 12, border: "2px dashed #d4b8ff",
            textAlign: "center", cursor: "pointer", background: "#faf5ff", color: "#7c3aed", fontWeight: 700, fontSize: 13,
          }}>
            📷 Зураг сонгох (даалгаврын зураг)
            <input type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 3 * 1024 * 1024) { onToast && onToast("❌ Зураг 3MB-аас бага байх ёстой", "error"); return; }
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const maxSize = 800;
                    let { width, height } = img;
                    if (width > height) { if (width > maxSize) { height = height * maxSize / width; width = maxSize; } }
                    else { if (height > maxSize) { width = width * maxSize / height; height = maxSize; } }
                    canvas.width = width; canvas.height = height;
                    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                    setFileUrl(canvas.toDataURL("image/jpeg", 0.75));
                    setFileName(file.name);
                  };
                  img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
              }} />
          </label>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>🔗 ЭСВЭЛ ФАЙЛЫН ХОЛБООС</div>
        <input value={fileUrl && fileUrl.startsWith("data:") ? "" : fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..." style={INP} disabled={fileUrl.startsWith("data:")} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>⚡ XP ШАГНАЛ</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[20, 30, 50, 80, 100].map(x => (
            <button key={x} onClick={() => setXpReward(x)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 10,
              border: xpReward === x ? "2px solid #7c3aed" : "2px solid #e0e0e0",
              background: xpReward === x ? "#f5f0ff" : "#fff",
              color: xpReward === x ? "#7c3aed" : "#666",
              fontWeight: 800, fontSize: 12, cursor: "pointer",
            }}>+{x}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={submit} disabled={saving || !title.trim() || scopeVocabs.length === 0}
          style={{ ...btn("#7c3aed", "#fff"), flex: 2, justifyContent: "center", boxShadow: "0 3px 0 #5b21b6", opacity: (saving || !title.trim() || scopeVocabs.length === 0) ? .5 : 1 }}>
          {saving ? "⏳..." : "📤 Илгээх"}
        </button>
      </div>
    </Overlay>
  );
}

// ── HomeworkListModal — Багш бүх даалгаврыг харах ──────────────
function HomeworkListModal({ cls, students, homeworks, submissions, isSuperAdmin, currentTeacherId, onClose, onRefresh, onToast, teachers = [] }) {
  const [selHw, setSelHw] = useState(null);
  const classHws = homeworks.filter(hw => hw.class_id === cls.id).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  if (selHw) {
    const subs = submissions.filter(s => s.homework_id === selHw.id);
    const completedIds = new Set(subs.map(s => s.student_id));
    const completed = students.filter(s => completedIds.has(s.id));
    const pending = students.filter(s => !completedIds.has(s.id));
    const pct = students.length > 0 ? Math.round((completed.length / students.length) * 100) : 0;
    const isOverdue = new Date(selHw.due_date) < new Date();
    const isOwner = selHw.teacher_id === currentTeacherId || isSuperAdmin;

    const deleteHw = async () => {
      if (!window.confirm("Энэ даалгаврыг устгах уу?")) return;
      try {
        // Холбоотой submissions устгах
        const subs = await fbWhere("homework_submissions", "homework_id", "==", selHw.id);
        for (const sub of subs) await fbDelete("homework_submissions", sub.id);
        await fbDelete("homeworks", selHw.id);
        onRefresh && onRefresh();
        onToast && onToast("✅ Устгагдлаа", "success");
        setSelHw(null);
      } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    };

    return (
      <Overlay onClose={onClose} maxW={460}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setSelHw(null)} style={btn("#f0f0f0", "#555")}>← Буцах</button>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selHw.title}</div>
          {isOwner && <button onClick={deleteHw} style={btn("#fff0f0", "#e53935", "#ffcdd2")}>🗑️</button>}
        </div>

        <div style={{ background: "#f5f0ff", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 4 }}>⏰ ДУУСАХ: {fmtDT(selHw.due_date)}</div>
          <div style={{ fontSize: 11, color: "#7c3aed", marginBottom: 2 }}>⚡ +{selHw.xp_reward || 30} XP</div>
          <div style={{ fontSize: 11, color: "#7c3aed" }}>📚 {(selHw.vocab_ids || []).length} үг</div>
          {selHw.description && <div style={{ marginTop: 8, padding: 8, background: "#fff", borderRadius: 8, fontSize: 12, color: "#555", lineHeight: 1.5 }}>{selHw.description}</div>}
          {selHw.file_url && (
            selHw.file_url.startsWith("data:image") ? (
              <img src={selHw.file_url} style={{ width: "100%", maxHeight: 250, objectFit: "contain", borderRadius: 10, marginTop: 8, border: "1px solid #d4b8ff" }} alt="" />
            ) : (
              <a href={selHw.file_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, padding: "5px 10px", background: "#fff", borderRadius: 8, fontSize: 11, color: "#7c3aed", fontWeight: 700, textDecoration: "none", border: "1px solid #d4b8ff" }}>
                📎 {selHw.file_name || "Файл татах"}
              </a>
            )
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 12, marginBottom: 12, border: "2px solid #e0e0e0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>📊 Гүйцэтгэл</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#43a047" }}>{completed.length}/{students.length} ({pct}%)</div>
          </div>
          <div style={{ height: 10, background: "#f0f0f0", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#66bb6a,#43a047)", transition: "width .6s" }} />
          </div>
        </div>

        <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
          {completed.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#43a047", marginBottom: 6 }}>✅ ХИЙСЭН ({completed.length})</div>
              {completed.map(s => {
                const sub = subs.find(x => x.student_id === s.id);
                return (
                  <div key={s.id} style={{ padding: 8, background: "#e8f5e9", borderRadius: 10, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#1b5e20" }}>{s.name}</div>
                      {sub?.photo_url && <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700 }}>📷 Зурагтай</span>}
                      {sub?.score != null && <div style={{ fontSize: 12, fontWeight: 800, color: "#1b5e20" }}>{sub.score}%</div>}
                    </div>
                    {/* Сурагчийн илгээсэн зураг */}
                    {sub?.photo_url && (
                      <div style={{ marginTop: 8 }}>
                        <img src={sub.photo_url} style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 8, border: "1px solid #a5d6a7" }} alt="" />
                        <button onClick={async () => {
                          if (!window.confirm(`${s.name}-ийн зургийг шалгаж дууссан уу?\n\nЗураг устгагдана (ачаалал хэмнэхийн тулд). Даалгавар хийсэн нь хэвээр үлдэнэ.`)) return;
                          try {
                            await supaUpdate("homework_submissions", sub.id, { photo_url: null, photo_reviewed: true });
                            onToast && onToast("✅ Зураг шалгагдаж устлаа", "success");
                            onRefresh && onRefresh();
                          } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
                        }} style={{ marginTop: 6, width: "100%", padding: 8, borderRadius: 8, border: "none", background: "#43a047", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          ✅ Шалгаж дууссан (зураг устгах)
                        </button>
                      </div>
                    )}
                    {sub?.photo_reviewed && !sub?.photo_url && (
                      <div style={{ marginTop: 4, fontSize: 10, color: "#888", fontStyle: "italic" }}>✓ Зураг шалгагдсан</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {pending.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: isOverdue ? "#c62828" : "#888", marginBottom: 6 }}>
                {isOverdue ? "❌ ХОЦОРСОН" : "⏳ ХҮЛЭЭГДЭЖ БУЙ"} ({pending.length})
              </div>
              {pending.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", padding: 8, background: isOverdue ? "#fff0f0" : "#fafafa", borderRadius: 10, marginBottom: 4 }}>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "#555" }}>{s.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose} maxW={440}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>📝 Бүх даалгаврууд ({classHws.length})</div>
      {classHws.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#aaa" }}>
          <div style={{ fontSize: 40, opacity: .4, marginBottom: 8 }}>📭</div>
          Даалгавар байхгүй
        </div>
      ) : (
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {classHws.map(hw => {
            const subs = submissions.filter(s => s.homework_id === hw.id);
            const pct = students.length > 0 ? Math.round((subs.length / students.length) * 100) : 0;
            const isOverdue = new Date(hw.due_date) < new Date();
            return (
              <div key={hw.id} onClick={() => setSelHw(hw)} className="k-press"
                style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 6, border: `2px solid ${isOverdue ? "#ffcdd2" : "#e0e0e0"}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hw.title}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: pct >= 70 ? "#43a047" : pct >= 40 ? "#f57c00" : "#c62828" }}>{pct}%</div>
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>⏰ {fmtDT(hw.due_date)} {isOverdue && <span style={{ color: "#c62828", fontWeight: 700 }}>(Дууссан)</span>}</div>
                {/* Админд багшийн нэр харуулах */}
                {isSuperAdmin && hw.teacher_id && hw.teacher_id !== currentTeacherId && (
                  <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginTop: 2 }}>
                    👩‍🏫 {teachers.find(t => t.id === hw.teacher_id)?.name || "Багш"}-ийн өгсөн
                  </div>
                )}
                <div style={{ marginTop: 4, height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? "#66bb6a" : pct >= 40 ? "#ffa726" : "#ef5350" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Overlay>
  );
}

// ── StudentHomeworkCard — Сурагч даалгавар харах ─────────────
function StudentHomeworkCard({ hw, vocabEntries, isCompleted, submission, t, onStart }) {
  const isOverdue = new Date(hw.due_date) < new Date();
  const hwVocabs = vocabEntries.filter(v => (hw.vocab_ids || []).includes(v.id));

  let bg = "#fff", borderC = t.border, status = null;
  if (isCompleted) { bg = "#e8f5e9"; borderC = "#66bb6a"; status = { text: "✅ Хийсэн", color: "#1b5e20" }; }
  else if (isOverdue) { bg = "#ffebee"; borderC = "#ef9a9a"; status = { text: "⏰ Хоцорсон", color: "#c62828" }; }
  else status = { text: "🎯 Хийх", color: t.accent };

  return (
    <div onClick={() => !isCompleted && !isOverdue && onStart(hw, hwVocabs)} className="k-press"
      style={{ background: bg, borderRadius: 14, padding: 12, marginBottom: 8, border: `2px solid ${borderC}`, cursor: (isCompleted || isOverdue) ? "default" : "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 14, color: t.text }}>{hw.title}</div>
        {status && <div style={{ fontSize: 11, fontWeight: 800, color: status.color, background: "#fff", borderRadius: 8, padding: "2px 8px" }}>{status.text}</div>}
      </div>
      {hw.description && (
        <div style={{ fontSize: 11, color: t.text, opacity: .75, marginBottom: 6, lineHeight: 1.4 }}>
          {hw.description.length > 100 ? hw.description.slice(0, 100) + "..." : hw.description}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, color: t.text, opacity: .7 }}>
        <span>⏰ {fmtDT(hw.due_date)}</span>
        <span>📚 {hwVocabs.length} үг</span>
        <span style={{ color: t.accent, fontWeight: 700 }}>⚡ +{hw.xp_reward || 30} XP</span>
      </div>
      {hw.file_url && (
        hw.file_url.startsWith("data:image") ? (
          <img src={hw.file_url} onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10, marginTop: 8, border: `1px solid ${t.border}` }} alt="" />
        ) : (
          <a href={hw.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ display: "inline-block", marginTop: 8, padding: "5px 10px", background: "#fff", borderRadius: 8, fontSize: 11, color: t.accent, fontWeight: 700, textDecoration: "none", border: `1px solid ${t.border}` }}>
            📎 {hw.file_name || "Файл харах"}
          </a>
        )
      )}
      {isCompleted && submission && (
        <div style={{ marginTop: 6, padding: 6, background: "#fff", borderRadius: 8, fontSize: 11, color: "#1b5e20" }}>
          Оноо: <b>{submission.score}%</b> · +{hw.xp_reward || 30} XP авсан
        </div>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 7 — Exam систем (CreateExam, ExamRoom, StudentExamScreen)
// ════════════════════════════════════════════════════════════════════

// ── CreateExamModal — Багш шалгалт үүсгэх ────────────────────
function CreateExamModal({ cls, vocabEntries, teacherId, onClose, onCreated, onToast }) {
  const [title, setTitle] = useState(`Шалгалт ${new Date().toLocaleDateString("mn-MN")}`);
  const [questionCount, setQuestionCount] = useState(10);
  const [duration, setDuration] = useState(10);
  const [selectedDates, setSelectedDates] = useState([TODAY]);
  const [creating, setCreating] = useState(false);

  const availableDates = useMemo(() => {
    return [...new Set(vocabEntries.filter(v => v.date).map(v => v.date))].sort().reverse();
  }, [vocabEntries]);

  const toggleDate = (d) => setSelectedDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const scopedVocabs = vocabEntries.filter(v => selectedDates.includes(v.date));

  const submit = async () => {
    if (scopedVocabs.length < 3) { onToast && onToast("❌ Дор хаяж 3 үг сонгоно уу", "error"); return; }
    setCreating(true);
    try {
      const exam = {
        id: `ex${Date.now()}`,
        class_id: cls.id, teacher_id: teacherId,
        title: title.trim() || "Шалгалт",
        question_count: questionCount, duration_minutes: duration,
        status: "pending", vocab_scope_dates: selectedDates, xp_per_correct: 5,
      };
      await supaInsert("exams", exam);
      onCreated && onCreated(exam);
      onToast && onToast("✅ Шалгалт бэлдэгдсэн. 'Эхлүүлэх' дарж асаана", "success");
      onClose();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setCreating(false);
  };

  return (
    <Overlay onClose={onClose} maxW={440}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 28 }}>🏆</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Шалгалт бэлдэх</div>
          <div style={{ fontSize: 11, color: "#888" }}>AI асуулт автомат үүсгэнэ</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📌 ГАРЧИГ</div>
        <input value={title} onChange={e => setTitle(e.target.value)} style={INP} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📅 ҮГИЙН ХАМРАХ ӨДРҮҮД</div>
        {availableDates.length === 0 ? (
          <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 14 }}>Үг байхгүй</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 120, overflowY: "auto", padding: 6, background: "#fafafa", borderRadius: 10 }}>
            {availableDates.map(d => {
              const isSel = selectedDates.includes(d);
              const cnt = vocabEntries.filter(v => v.date === d).length;
              return (
                <button key={d} onClick={() => toggleDate(d)} style={{
                  background: isSel ? "#7c3aed" : "#fff", color: isSel ? "#fff" : "#555",
                  border: isSel ? "2px solid #7c3aed" : "2px solid #e0e0e0",
                  borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{d.slice(5)} ({cnt})</button>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 11, color: scopedVocabs.length >= 3 ? "#43a047" : "#c62828", fontWeight: 700 }}>
          {scopedVocabs.length >= 3 ? `✓ ${scopedVocabs.length} үг сонгогдсон` : `⚠️ Дор хаяж 3 хэрэгтэй (${scopedVocabs.length})`}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>❓ АСУУЛТЫН ТОО ({questionCount})</div>
        <input type="range" min={5} max={30} value={questionCount} onChange={e => setQuestionCount(+e.target.value)} style={{ width: "100%", accentColor: "#7c3aed" }} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>⏱️ ХУГАЦАА (минут)</div>
        <div style={{ display: "flex", gap: 5 }}>
          {[5, 10, 15, 20, 30].map(m => (
            <button key={m} onClick={() => setDuration(m)} style={{
              flex: 1, padding: "8px", borderRadius: 10,
              border: duration === m ? "2px solid #7c3aed" : "2px solid #e0e0e0",
              background: duration === m ? "#f5f0ff" : "#fff",
              color: duration === m ? "#7c3aed" : "#666",
              fontWeight: 800, fontSize: 12, cursor: "pointer",
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={submit} disabled={creating || scopedVocabs.length < 3}
          style={{ ...btn("#7c3aed", "#fff"), flex: 2, justifyContent: "center", boxShadow: "0 3px 0 #5b21b6", opacity: (creating || scopedVocabs.length < 3) ? .5 : 1 }}>
          {creating ? "⏳..." : "✨ Үүсгэх"}
        </button>
      </div>
    </Overlay>
  );
}

// ── PodiumCard (Top-3 medal) ──────────────────────────────────
function PodiumCard({ rank, sub, students, color, emoji, big }) {
  const st = students.find(x => x.id === sub.student_id);
  return (
    <div className="k-pop" style={{
      flex: 1, maxWidth: big ? 130 : 100,
      background: `linear-gradient(180deg,${color}33,${color}11)`,
      border: `2px solid ${color}`,
      borderRadius: 14, padding: big ? 12 : 8,
      textAlign: "center", height: big ? 130 : 100,
      display: "flex", flexDirection: "column", justifyContent: "center",
    }}>
      <div style={{ fontSize: big ? 32 : 24, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontWeight: 800, fontSize: big ? 13 : 11, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st?.name || "—"}</div>
      <div style={{ fontSize: big ? 18 : 14, fontWeight: 900, color }}>{sub.score}%</div>
    </div>
  );
}

// ── ExamRoomModal (Багш шалгалтыг харах, эхлүүлэх) ────────────
function ExamRoomModal({ exam, cls, students, examSubmissions, isOwner, onClose, onRefresh, onToast }) {
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionRef = useRef(false);

  const startExam = async () => {
    if (actionRef.current) return;
    if (!window.confirm(`"${exam.title}" шалгалтыг ОДОО эхлүүлэх үү?\n${exam.duration_minutes} минут хүртэл өгнө.`)) return;
    actionRef.current = true;
    setStarting(true);
    try {
      await supaUpdate("exams", exam.id, { status: "active", started_at: new Date().toISOString() });
      onRefresh && onRefresh();
      onToast && onToast("🚀 Шалгалт эхэллээ! Сурагчдад автомат харагдана", "success");
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setStarting(false);
    actionRef.current = false;
  };

  const endExam = async () => {
    if (actionRef.current) return;
    if (!window.confirm("Шалгалтыг дуусгах уу?")) return;
    actionRef.current = true;
    setBusy(true);
    try {
      await supaUpdate("exams", exam.id, { status: "finished", ended_at: new Date().toISOString() });
      onRefresh && onRefresh();
      onToast && onToast("✅ Шалгалт дууслаа", "success");
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setBusy(false);
    actionRef.current = false;
  };

  const deleteExam = async () => {
    if (actionRef.current) return;
    if (!window.confirm("Шалгалтыг устгах уу?")) return;
    actionRef.current = true;
    setBusy(true);
    try {
      const subs = await fbWhere("exam_submissions", "exam_id", "==", exam.id);
      for (const sub of subs) await fbDelete("exam_submissions", sub.id);
      await fbDelete("exams", exam.id);
      onRefresh && onRefresh();
      onToast && onToast("✅ Устгагдлаа", "success");
      onClose();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setBusy(false);
    actionRef.current = false;
  };

  const submissions = examSubmissions.filter(s => s.exam_id === exam.id);
  const sortedSubs = [...submissions].sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <Overlay onClose={onClose} maxW={460}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 28 }}>🏆</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{exam.title}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{exam.question_count} асуулт · {exam.duration_minutes} мин</div>
        </div>
        {isOwner && exam.status !== "active" && <button onClick={deleteExam} disabled={busy} style={btn("#fff0f0", "#e53935", "#ffcdd2")}>🗑️</button>}
      </div>

      <div style={{ marginBottom: 12 }}>
        {exam.status === "pending" && (
          <div style={{ background: "#fff3cd", color: "#b8860b", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
            ⏳ Эхлүүлэхийг хүлээж байна
          </div>
        )}
        {exam.status === "active" && (
          <div className="k-pulse" style={{ background: "#e8f5e9", color: "#1b5e20", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
            🔥 ИДЭВХТЭЙ — {submissions.length}/{students.length} өгсөн
          </div>
        )}
        {/* Active үед — хэн өгсөн, хэн хүлээгдэж буйг нэрээр харуулах */}
        {exam.status === "active" && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#43a047", marginBottom: 3 }}>
                ✅ Өгсөн ({submissions.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {submissions.map(sub => {
                  const st = students.find(x => x.id === sub.student_id);
                  return (
                    <span key={sub.id} style={{ background: "#c8e6c9", color: "#1b5e20", padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                      {st?.name || "?"} ({sub.score})
                    </span>
                  );
                })}
                {submissions.length === 0 && <span style={{ fontSize: 11, color: "#aaa" }}>Хараахан байхгүй</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#f57c00", marginBottom: 3 }}>
                ⏳ Хүлээгдэж буй ({students.filter(s => !submissions.find(sub => sub.student_id === s.id)).length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {students.filter(s => !submissions.find(sub => sub.student_id === s.id)).map(s => (
                  <span key={s.id} style={{ background: "#fff3e0", color: "#e65100", padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        {exam.status === "finished" && (
          <div style={{ background: "#e3f2fd", color: "#1565c0", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: "center" }}>🏁 Дууссан</div>
        )}
      </div>

      {isOwner && exam.status === "pending" && (
        <button onClick={startExam} disabled={starting} style={{ ...btn("#43a047", "#fff"), width: "100%", justifyContent: "center", padding: 14, fontSize: 14, marginBottom: 12, boxShadow: "0 4px 0 #2e7d32" }}>
          {starting ? "⏳..." : "🚀 ШАЛГАЛТ ЭХЛҮҮЛЭХ"}
        </button>
      )}
      {isOwner && exam.status === "active" && (
        <button onClick={endExam} disabled={busy} style={{ ...btn("#e53935", "#fff"), width: "100%", justifyContent: "center", padding: 14, fontSize: 14, marginBottom: 12, boxShadow: "0 4px 0 #b71c1c", opacity: busy ? .5 : 1 }}>
          {busy ? "⏳..." : "🏁 ЭРТ ДУУСГАХ"}
        </button>
      )}

      {(exam.status === "active" || exam.status === "finished") && sortedSubs.length > 0 && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🏆 Тэргүүн жагсаалт</div>
          {exam.status === "finished" && sortedSubs.length >= 1 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-end", justifyContent: "center" }}>
              {sortedSubs[1] && <PodiumCard rank={2} sub={sortedSubs[1]} students={students} color="#9e9e9e" emoji="🥈" />}
              {sortedSubs[0] && <PodiumCard rank={1} sub={sortedSubs[0]} students={students} color="#ffc107" emoji="🥇" big />}
              {sortedSubs[2] && <PodiumCard rank={3} sub={sortedSubs[2]} students={students} color="#bf8957" emoji="🥉" />}
            </div>
          )}
          <div style={{ maxHeight: "35vh", overflowY: "auto" }}>
            {sortedSubs.map((s, i) => {
              const st = students.find(x => x.id === s.student_id);
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: i < 3 ? "#fff3cd" : "#fff", borderRadius: 10, marginBottom: 4, border: i < 3 ? "1px solid #ffe082" : "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? "#b8860b" : "#888", width: 22, textAlign: "center" }}>{i + 1}</div>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{st?.name || "—"}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#43a047" }}>{s.correct_count}/{s.total_count}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: s.score >= 80 ? "#43a047" : s.score >= 60 ? "#f57c00" : "#c62828" }}>{s.score}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {exam.status === "active" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: "#888", marginBottom: 6 }}>
            ⏳ Хүлээгдэж буй: {students.filter(s => !submissions.find(sub => sub.student_id === s.id)).length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {students.filter(s => !submissions.find(sub => sub.student_id === s.id)).map(s => (
              <span key={s.id} style={{ background: "#f0f0f0", padding: "3px 8px", borderRadius: 8, fontSize: 11 }}>{s.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* 📊 ШАЛГАЛТЫН СТАТИСТИК — finished статусанд */}
      {exam.status === "finished" && sortedSubs.length > 0 && (() => {
        // Average score
        const avgScore = Math.round(sortedSubs.reduce((sum, s) => sum + (s.score || 0), 0) / sortedSubs.length);
        // Хамгийн их алдаа хийсэн асуултууд + алдсан сурагчдын нэр
        const questionStats = {};
        sortedSubs.forEach(sub => {
          const st = students.find(x => x.id === sub.student_id);
          const studentName = st?.name || "?";
          (sub.detailed_results || []).forEach(r => {
            const key = r.idx;
            if (!questionStats[key]) {
              questionStats[key] = { idx: r.idx, question: r.question, correctAnswer: r.correctAnswer, wrong_count: 0, total: 0, wrongStudents: [] };
            }
            questionStats[key].total++;
            if (!r.isCorrect) {
              questionStats[key].wrong_count++;
              questionStats[key].wrongStudents.push(studentName);
            }
          });
        });
        const sortedStats = Object.values(questionStats).sort((a, b) => b.wrong_count - a.wrong_count).slice(0, 5);

        return (
          <div style={{ marginTop: 14, background: "#fff5f5", borderRadius: 12, padding: 12, border: "1px solid #ffcdd2" }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#c62828", marginBottom: 8 }}>📊 Статистик ({sortedSubs.length} сурагч)</div>

            {/* Дундаж оноо + хувь */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
              <div style={{ background: "#fff", borderRadius: 8, padding: 8, textAlign: "center", border: "1px solid #ffcdd2" }}>
                <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>ДУНДАЖ</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: avgScore >= 70 ? "#43a047" : avgScore >= 50 ? "#f57c00" : "#c62828" }}>{avgScore}%</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 8, padding: 8, textAlign: "center", border: "1px solid #ffcdd2" }}>
                <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>ХАМГИЙН ӨНДӨР</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#43a047" }}>{sortedSubs[0]?.score || 0}%</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 8, padding: 8, textAlign: "center", border: "1px solid #ffcdd2" }}>
                <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>ХАМГИЙН БАГА</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#c62828" }}>{sortedSubs[sortedSubs.length - 1]?.score || 0}%</div>
              </div>
            </div>

            {/* Хамгийн их алдаа хийсэн асуултууд — нэртэйгээр */}
            {sortedStats.length > 0 && sortedStats[0].wrong_count > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#c62828", marginBottom: 6 }}>❌ Хамгийн их алдаатай асуултууд</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {sortedStats.filter(s => s.wrong_count > 0).map(s => {
                    const wrongPercent = Math.round((s.wrong_count / s.total) * 100);
                    return (
                      <div key={s.idx} style={{ background: "#fff", borderRadius: 8, padding: 8, fontSize: 11, border: "1px solid #ffe0e0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, color: "#1a1a2e" }}>#{s.idx}. {(s.question || "").slice(0, 35)}{s.question?.length > 35 ? "..." : ""}</span>
                          <span style={{ fontWeight: 900, color: "#c62828" }}>{wrongPercent}%</span>
                        </div>
                        <div style={{ color: "#888", fontSize: 10, marginBottom: 3 }}>
                          {s.wrong_count}/{s.total} хүүхэд алдсан · Зөв хариу: <b style={{ color: "#43a047" }}>{s.correctAnswer}</b>
                        </div>
                        {/* Алдсан сурагчдын нэрс */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                          {s.wrongStudents.map((name, i) => (
                            <span key={i} style={{ background: "#ffebee", color: "#c62828", padding: "2px 6px", borderRadius: 6, fontSize: 9, fontWeight: 600 }}>
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </Overlay>
  );
}

// ── StudentExamScreen (Сурагч шалгалт өгөх) ──────────────────
function StudentExamScreen({ exam, vocabEntries, student, t, onComplete, onClose, previousSubmissions = [] }) {
  const [stage, setStage] = useState("loading");
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [remainingSec, setRemainingSec] = useState((exam.duration_minutes || 10) * 60);
  const [result, setResult] = useState(null);
  const [showTranslate, setShowTranslate] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const examVocabs = useMemo(() => {
    const dates = exam.vocab_scope_dates || [];
    return vocabEntries.filter(v => dates.includes(v.date));
  }, [exam, vocabEntries]);

  const recentVocabs = useMemo(() => {
    const dates = exam.vocab_scope_dates || [];
    return vocabEntries.filter(v => v.date && !dates.includes(v.date)).slice(0, 12);
  }, [exam, vocabEntries]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const vocabs = examVocabs.filter(v => v.type !== "grammar");
      const grammars = examVocabs.filter(v => v.type === "grammar");
      let qs = [];
      try {
        qs = await generateExamQuestions({ vocabs, grammars, count: exam.question_count || 10, level: student.level || 0, recent: recentVocabs });
      } catch (e) {}
      if (cancel) return;
      if (!qs || qs.length === 0) qs = generateFallbackQuestions(vocabs, exam.question_count || 10);
      setQuestions(qs);
      setStage("exam");
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (stage !== "exam") return;
    const interval = setInterval(() => {
      setRemainingSec(s => {
        if (s <= 1) { clearInterval(interval); submitExam(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const submittingRef = useRef(false);
  const submitExam = async (timeOut) => {
    // Давхар submit хамгаалалт — гацсан ч нэг л удаа ажиллана
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    let correct = 0;
    questions.forEach((q, i) => {
      const a = (answers[i] || "").toString().trim().toLowerCase();
      const c = (q.correct || "").toString().trim().toLowerCase();
      if (a === c) correct++;
      else if (Array.isArray(q.alternatives) && q.alternatives.map(x => x.toString().trim().toLowerCase()).includes(a)) correct++;
    });
    const total = questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    // XP ЛОГИК — оноонд шударгаар суурилсан:
    // 1) Зөв хариулт тутамд 2 XP (хичээсэн бүрд)
    // 2) Оноо 90+ → +10 bonus, 70-89 → +5 bonus (өндөр оноо илүү XP)
    // 3) Эхний удаа өгсөн бол → +5 XP
    // Ингэснээр өндөр оноотой нь үргэлж илүү XP авна
    let xpEarned = correct * 2;
    if (score >= 90) xpEarned += 10;
    else if (score >= 70) xpEarned += 5;
    xpEarned += 5; // эхний удаа bonus

    // Дэлгэрэнгүй үр дүн — алдсан асуултуудыг хадгалах
    const detailedResults = questions.map((q, i) => {
      const userAns = (answers[i] || "").toString().trim();
      const correctAns = (q.correct || "").toString().trim();
      const isCorrect = userAns.toLowerCase() === correctAns.toLowerCase() ||
        (Array.isArray(q.alternatives) && q.alternatives.map(x => x.toString().trim().toLowerCase()).includes(userAns.toLowerCase()));
      return {
        idx: i + 1,
        question: q.question || "",
        type: q.type || "",
        audio: q.audio || "",
        userAnswer: userAns,
        correctAnswer: correctAns,
        isCorrect,
      };
    });

    try {
      // Давхардсан submission байгаа эсэхийг шалгах (нэг сурагч нэг шалгалтанд 1 удаа)
      const existing = (previousSubmissions || []).find(
        es => es.exam_id === exam.id && es.student_id === student.id
      );
      if (!existing) {
        await supaInsert("exam_submissions", {
          id: `es${Date.now()}_${student.id}`, exam_id: exam.id, student_id: student.id,
          answers, correct_count: correct, total_count: total, score, xp_earned: xpEarned,
          detailed_results: detailedResults,
          submitted_at: new Date().toISOString(),
        });
        const newXp = (student.xp || 0) + xpEarned;
        await supaUpdate("students", student.id, { xp: newXp });
        if (onComplete) onComplete({ score, xpEarned });
      }
    } catch (e) { console.error("Exam submit err", e); }
    setResult({ correct, total, score, xpEarned, timeOut, detailedResults });
    setStage("done");
  };

  // ─── LOADING ───
  if (stage === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui" }}>
        <div className="k-bounce" style={{ fontSize: 80, marginBottom: 16 }}>📚</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: t.text, marginBottom: 6 }}>Асуултууд бэлдэж байна...</div>
        <div style={{ fontSize: 12, color: t.text, opacity: .6 }}>AI-аар асуулт үүсгэж байна</div>
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: t.accent, animation: `kBounce 1s ease-in-out ${i * 0.15}s infinite` }} />)}
        </div>
      </div>
    );
  }

  // ─── DONE ───
  if (stage === "done" && result) {
    const isGreat = result.score >= 80;
    const isGood = result.score >= 60;
    // Өмнөх submissions-аас энэ сурагчийнхыг олох (хамгийн сүүлийнхыг)
    const prevSubs = (previousSubmissions || []).filter(s => s.student_id === student.id).sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""));
    const lastSub = prevSubs[0]; // Хамгийн сүүлийн өмнөх submission
    const scoreChange = lastSub ? result.score - (lastSub.score || 0) : null;
    const wrongResults = (result.detailedResults || []).filter(r => !r.isCorrect);

    return (
      <div style={{ minHeight: "100vh", background: t.bg, padding: 16, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto", paddingBottom: 30 }}>
        <div className="k-pop" style={{ background: "#fff", borderRadius: 22, padding: 26, textAlign: "center", border: `2px solid ${t.border}`, marginTop: 20 }}>
          <div className="k-bounce" style={{ fontSize: 80, marginBottom: 12 }}>{isGreat ? "🏆" : isGood ? "🎉" : "💪"}</div>
          <div style={{ fontWeight: 900, fontSize: 24, color: t.accent, marginBottom: 6 }}>{isGreat ? "Гайхалтай!" : isGood ? "Сайн!" : "Хичээ!"}</div>
          {result.timeOut && <div style={{ background: "#fff3cd", color: "#b8860b", padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, display: "inline-block", marginBottom: 10 }}>⏰ Хугацаа дууссан</div>}
          <div style={{ background: `linear-gradient(135deg,${t.accent},${t.accent}cc)`, borderRadius: 16, padding: 20, marginBottom: 10 }}>
            <div style={{ color: "#fff", fontSize: 13, opacity: .9, fontWeight: 700 }}>ОНОО</div>
            <div style={{ color: "#fff", fontSize: 50, fontWeight: 900, lineHeight: 1, marginTop: 4 }}>{result.score}<span style={{ fontSize: 24 }}>/100</span></div>
            <div style={{ color: "#fff", fontSize: 13, opacity: .9, marginTop: 8 }}>{result.correct} зөв / {result.total} нийт</div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, marginTop: 10, background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 12px", display: "inline-block" }}>+{result.xpEarned} XP</div>
          </div>

          {/* 📊 Өмнөх оноотой харьцуулах */}
          {lastSub && (
            <div className="k-fade" style={{ background: "#f5f0ff", borderRadius: 12, padding: 10, marginBottom: 12, fontSize: 11, color: "#666" }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>📊 Өмнөх шалгалт</div>
              <div>Өмнөх оноо: <b style={{ color: "#7c3aed" }}>{lastSub.score}/100</b></div>
              {scoreChange !== null && scoreChange !== 0 && (
                <div style={{ marginTop: 3, fontWeight: 700, color: scoreChange > 0 ? "#43a047" : "#e53935" }}>
                  {scoreChange > 0 ? `📈 +${scoreChange} оноогоор сайжирлаа!` : `📉 ${scoreChange} оноогоор буурлаа`}
                </div>
              )}
              {scoreChange === 0 && <div style={{ marginTop: 3, color: "#999" }}>↔️ Адил оноо</div>}
            </div>
          )}
        </div>

        {/* ❌ АЛДСАН АСУУЛТУУД */}
        {wrongResults.length > 0 && (
          <div className="k-fade" style={{ background: "#fff", borderRadius: 16, padding: 16, marginTop: 12, border: "2px solid #ffcdd2" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#c62828", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              ❌ Алдсан асуултууд ({wrongResults.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {wrongResults.map((r, i) => (
                <div key={i} style={{ background: "#fff5f5", borderRadius: 10, padding: 10, fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Асуулт #{r.idx}</div>
                  <div style={{ fontWeight: 700, color: "#1a1a2e", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    {r.audio && (
                      <button onClick={() => speakKr(r.audio)} style={{ background: "#1976d2", color: "#fff", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                        🔊
                      </button>
                    )}
                    {r.question}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
                    <div style={{ background: "#ffcdd2", padding: "4px 8px", borderRadius: 6, fontSize: 11 }}>
                      <span style={{ color: "#c62828", fontWeight: 700 }}>❌ Таны хариу: </span>
                      <span style={{ color: "#1a1a2e" }}>{r.userAnswer || "(хариулаагүй)"}</span>
                    </div>
                    <div style={{ background: "#c8e6c9", padding: "4px 8px", borderRadius: 6, fontSize: 11 }}>
                      <span style={{ color: "#2e7d32", fontWeight: 700 }}>✅ Зөв хариу: </span>
                      <span style={{ color: "#1a1a2e", fontWeight: 700 }}>{r.correctAnswer}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 10, textAlign: "center", fontStyle: "italic" }}>
              💡 Эдгээр үгсийг сайн давтаарай!
            </div>
          </div>
        )}

        <button onClick={onClose} style={{ ...btn(t.accent, "#fff"), width: "100%", justifyContent: "center", padding: 12, fontSize: 14, boxShadow: `0 4px 0 ${t.border}`, marginTop: 12 }}>
          ✅ Дуусгах
        </button>
      </div>
    );
  }

  // ─── EXAM ───
  if (questions.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 8, textAlign: "center" }}>Асуулт үүсгэх боломжгүй</div>
        <div style={{ fontSize: 13, color: t.text, opacity: .7, textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
          Энэ шалгалтын сонгосон өдрүүдэд хангалттай үг алга байна.<br />
          (Хамгийн багадаа 2 үг хэрэгтэй)
        </div>
        <button onClick={onClose} style={{ ...btn(t.accent, "#fff"), padding: "12px 24px", fontSize: 14 }}>
          ← Буцах
        </button>
      </div>
    );
  }
  const q = questions[currentIdx];
  const userAns = answers[currentIdx] || "";
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const lowTime = remainingSec < 60;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto", padding: 14 }}>
      {/* Header with timer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>📚 {currentIdx + 1}/{questions.length}</div>
        <div className={lowTime ? "k-bounce" : ""} style={{ background: lowTime ? "#ffcdd2" : t.soft, color: lowTime ? "#c62828" : t.accent, padding: "5px 12px", borderRadius: 10, fontWeight: 800, fontSize: 14 }}>
          ⏱️ {mins}:{String(secs).padStart(2, "0")}
        </div>
      </div>

      {/* Walking penguin animation — Image 1 шиг */}
      <div style={{ position: "relative", height: 60, marginBottom: 14, background: `linear-gradient(180deg,${t.soft}55,${t.soft}11)`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: t.accent + "33", borderRadius: "0 0 12px 12px" }} />
        <div style={{ position: "absolute", left: `${(currentIdx / questions.length) * 80}%`, bottom: 6, transition: "left .5s ease", display: "flex", gap: 4 }}>
          <span className="k-walk" style={{ fontSize: 28 }}>🐧</span>
          <span className="k-walk" style={{ fontSize: 28, animationDelay: ".1s" }}>🐧</span>
        </div>
        <div style={{ position: "absolute", right: 8, bottom: 8, fontSize: 26 }}>🏠</div>
      </div>

      <div style={{ height: 6, background: t.soft, borderRadius: 3, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${(currentIdx / questions.length) * 100}%`, background: t.accent, transition: "width .4s" }} />
      </div>

      <div className="k-fade" key={currentIdx} style={{ background: "#fff", borderRadius: 18, padding: 18, marginBottom: 14, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, marginBottom: 8, letterSpacing: 1 }}>
          {({ multiple_choice: "🔘 СОНГОЛТ", translate_kr_mn: "🇰🇷→🇲🇳", translate_mn_kr: "🇲🇳→🇰🇷", fill_blank: "✏️ ГҮЙЦЭЭ" })[q.type] || "АСУУЛТ"}
        </div>
        <div style={{ fontSize: 14, color: t.text, marginBottom: 12, lineHeight: 1.5 }}>{q.question}</div>

        {q.audio && (
          <button onClick={() => speakKr(q.audio)} style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
            🔊 Сонсох
          </button>
        )}
        {q.sentence && (
          <div style={{ background: t.soft, borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 18, fontWeight: 800, textAlign: "center" }}>{q.sentence}</div>
        )}
        {q.prompt_text && (
          <div style={{ background: t.soft, borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 22, fontWeight: 800, textAlign: "center" }}>{q.prompt_text}</div>
        )}

        {q.type === "multiple_choice" || q.type === "fill_blank" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(q.options || []).map((opt, i) => {
              const isSel = userAns === opt;
              return (
                <div key={i} onClick={() => setAnswers(p => ({ ...p, [currentIdx]: opt }))} className="k-press"
                  style={{
                    background: isSel ? t.soft : "#fff", color: isSel ? t.accent : t.text,
                    border: isSel ? `2px solid ${t.accent}` : `2px solid ${t.border}`,
                    borderRadius: 12, padding: "12px 8px", fontSize: 14, fontWeight: 700,
                    textAlign: "center", cursor: "pointer", transition: "all .15s",
                  }}>{opt}</div>
              );
            })}
          </div>
        ) : (
          <input value={userAns} onChange={e => setAnswers(p => ({ ...p, [currentIdx]: e.target.value }))} placeholder="Хариугаа бичнэ үү..."
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 16, fontWeight: 600, outline: "none", textAlign: "center", boxSizing: "border-box" }} />
        )}

        {q.translation && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setShowTranslate(s => ({ ...s, [currentIdx]: !s[currentIdx] }))}
              style={{ background: "#fff", color: t.accent, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              💡 {showTranslate[currentIdx] ? "Нуух" : "Утга харах"}
            </button>
            {showTranslate[currentIdx] && (
              <div style={{ marginTop: 6, padding: 8, background: "#fff8e1", borderRadius: 8, fontSize: 12, color: "#b8860b" }}>{q.translation}</div>
            )}
          </div>
        )}
      </div>

      <button onClick={() => currentIdx + 1 >= questions.length ? submitExam(false) : setCurrentIdx(i => i + 1)} disabled={!userAns || submitting}
        style={{
          width: "100%", padding: 14, borderRadius: 14, border: "none",
          background: (userAns && !submitting) ? t.accent : "#e0e0e0", color: "#fff",
          fontWeight: 800, fontSize: 14, cursor: (userAns && !submitting) ? "pointer" : "default",
          boxShadow: (userAns && !submitting) ? `0 4px 0 ${t.border}` : "none",
        }}>
        {submitting ? "⏳ Хадгалж байна..." : currentIdx + 1 >= questions.length ? "🏁 Дуусгах" : "Дараагийн →"}
      </button>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 8 — PracticeStudio (Солонгос хэлээ бэлдэх)
// 6 төрлийн дасгал + Duolingo animation
// ════════════════════════════════════════════════════════════════════

// ── 2 хөөрхөн амьтан гэр лүүгээ алхаж байгаа SVG ─────────────
function WalkingBuddies({ progress, lostItem }) {
  // progress = 0..1 (0 эхлэл, 1 гэрт ирсэн)
  const leftPos = progress * 70; // 0% to 70%
  return (
    <div style={{
      position: "relative", height: 70, marginBottom: 14,
      background: "linear-gradient(180deg,#a8d8ff 0%,#c4e7ff 60%,#7eca6e 60%,#5cb85c 100%)",
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* Sun */}
      <div style={{ position: "absolute", top: 6, right: 12, fontSize: 16 }}>☀️</div>
      {/* Cloud */}
      <div style={{ position: "absolute", top: 4, left: 20, fontSize: 14, opacity: .9 }}>☁️</div>
      {/* House (right) */}
      <div style={{ position: "absolute", right: 8, bottom: 4, fontSize: 28 }}>🏠</div>
      {/* Lost item (хэрвээ алдсан бол) */}
      {lostItem && (
        <div className="k-pop" style={{ position: "absolute", left: `${Math.max(0, leftPos - 5)}%`, bottom: 22, fontSize: 14, animation: "kBounce 1s ease infinite" }}>
          💔
        </div>
      )}
      {/* Walking buddies */}
      <div style={{
        position: "absolute", left: `${leftPos}%`, bottom: 6,
        transition: "left .8s ease-out", display: "flex", gap: 2,
      }}>
        <span className="k-walk" style={{ fontSize: 26, display: "inline-block" }}>🐧</span>
        <span className="k-walk" style={{ fontSize: 26, display: "inline-block", animationDelay: ".15s" }}>🐧</span>
      </div>
    </div>
  );
}

// ── Flashcard ─────────────────────────────────────────────────
function FlashcardExercise({ current, t, onNext }) {
  const [flipped, setFlipped] = useState(false);
  const [emoji, setEmoji] = useState("📝");
  useEffect(() => {
    setFlipped(false);
    // Offline emoji эхлэлд харуулна, AI-аар сайжруулах
    const offEmoji = getEmojiForWord(current.target.word, current.target.meaning);
    setEmoji(offEmoji);
    if (offEmoji === "📝") {
      getEmojiByAI(current.target.word, current.target.meaning).then(e => setEmoji(e));
    }
  }, [current]);
  return (
    <div className="k-pop" key={current.target.word}>
      <div onClick={() => setFlipped(f => !f)} style={{
        background: flipped ? t.accent : "#fff",
        color: flipped ? "#fff" : t.text,
        borderRadius: 22, padding: "30px 24px", textAlign: "center", cursor: "pointer",
        minHeight: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        border: `3px solid ${t.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        transition: "all 0.4s",
      }}>
        <div style={{ fontSize: 11, opacity: .7, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
          {flipped ? "ХАРИУ" : "ҮГ"}
        </div>
        {/* Emoji sticker */}
        <div style={{ fontSize: 50, marginBottom: 8, lineHeight: 1, filter: flipped ? "brightness(1.2)" : "none" }}>
          {emoji}
        </div>
        <div style={{ fontSize: flipped ? 30 : 38, fontWeight: 900, marginBottom: 12 }}>
          {flipped ? current.target.meaning : current.target.word}
        </div>
        {!flipped && (
          <button onClick={e => { e.stopPropagation(); speakKr(current.target.word); }}
            style={{ background: t.soft, color: t.accent, border: "none", borderRadius: 12, padding: "8px 14px", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>
            🔊 Сонсох
          </button>
        )}
        <div style={{ fontSize: 10, opacity: .6, marginTop: 14, fontWeight: 600 }}>
          {flipped ? "Дахин дарж эргүүл" : "👆 Дарж эргүүл"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => onNext(false)} style={{ flex: 1, background: "#ffcdd2", color: "#c62828", border: "none", borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 0 #ef9a9a" }}>
          😅 Мэдэхгүй
        </button>
        <button onClick={() => onNext(true)} style={{ flex: 1, background: "#c8e6c9", color: "#2e7d32", border: "none", borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 0 #a5d6a7" }}>
          ✅ Мэднэ
        </button>
      </div>
    </div>
  );
}

// ── Multiple Choice ──────────────────────────────────────────
function MCExercise({ current, t, questionKey, answerKey, label, noAudio, showResult, onSubmit }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => { setSelected(null); }, [current]);
  const handleClick = (opt) => {
    if (selected !== null || showResult) return;
    setSelected(opt);
    setTimeout(() => onSubmit(opt), 200);
  };
  return (
    <div key={current.target.word}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "30px 20px", textAlign: "center", marginBottom: 14, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 11, opacity: .6, fontWeight: 700, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: t.text, marginBottom: 12, lineHeight: 1.2 }}>{current.target[questionKey]}</div>
        {!noAudio && (
          <button onClick={() => speakKr(current.target.word)}
            style={{ background: t.soft, color: t.accent, border: "none", borderRadius: 12, padding: "8px 16px", fontSize: 14, cursor: "pointer", fontWeight: 700 }}>
            🔊 Сонсох
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {current.options.map((opt, i) => {
          const isSel = selected === opt;
          const isCorrect = showResult && opt === current.target[answerKey];
          const isWrong = showResult === "wrong" && isSel;
          let bg = "#fff", col = t.text, border = t.border;
          if (isCorrect) { bg = "#c8e6c9"; col = "#1b5e20"; border = "#66bb6a"; }
          else if (isWrong) { bg = "#ffcdd2"; col = "#b71c1c"; border = "#e57373"; }
          else if (isSel) { bg = t.soft; col = t.accent; border = t.accent; }
          return (
            <div key={i} onClick={() => handleClick(opt)} className="k-press"
              style={{
                background: bg, color: col, border: `2px solid ${border}`,
                borderRadius: 14, padding: "16px 12px", fontSize: 15, fontWeight: 700,
                textAlign: "center", cursor: selected !== null ? "default" : "pointer",
                transition: "all 0.2s", animation: `kSlideUp .3s ease ${i * 0.05}s both`,
              }}>{opt}</div>
          );
        })}
      </div>
    </div>
  );
}

// ── Spelling ────────────────────────────────────────────────
function SpellingExercise({ current, t, userAnswer, setUserAnswer, showHint, setShowHint, showResult, onSubmit }) {
  return (
    <div key={current.target.word}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "30px 20px", textAlign: "center", marginBottom: 14, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 11, opacity: .6, fontWeight: 700, marginBottom: 8 }}>МОНГОЛООР</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: t.text, marginBottom: 14 }}>{current.target.meaning}</div>
        <div style={{ fontSize: 11, opacity: .7 }}>👇 Солонгос үгээ бичнэ үү</div>
      </div>
      <input value={userAnswer} onChange={e => setUserAnswer(e.target.value)}
        onKeyDown={e => e.key === "Enter" && userAnswer.trim() && onSubmit()}
        placeholder="한국어" disabled={!!showResult} autoFocus
        style={{ width: "100%", padding: "16px 20px", borderRadius: 14, border: `2px solid ${t.border}`, fontSize: 22, fontWeight: 700, textAlign: "center", outline: "none", marginBottom: 12, background: "#fff", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShowHint(true)}
          style={{ background: t.soft, color: t.accent, border: "none", borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 12, cursor: "pointer", flex: 1 }}>
          💡 Сэжүүр
        </button>
        <button onClick={onSubmit} disabled={!userAnswer.trim() || !!showResult}
          style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 13, cursor: "pointer", flex: 2, opacity: userAnswer.trim() ? 1 : .5, boxShadow: `0 4px 0 ${t.border}` }}>
          ✓ Шалгах
        </button>
      </div>
      {showHint && (
        <div className="k-fade" style={{ marginTop: 14, padding: 14, background: "#fff3cd", border: "2px solid #ffe082", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#b8860b", fontWeight: 700, marginBottom: 4 }}>💡 СЭЖҮҮР</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#b8860b", letterSpacing: 3 }}>
            {current.target.word.charAt(0)}{"_".repeat(Math.max(0, current.target.word.length - 1))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Listening ───────────────────────────────────────────────
function ListeningExercise({ current, t, userAnswer, setUserAnswer, showResult, onSubmit }) {
  useEffect(() => {
    const tm = setTimeout(() => speakKr(current.target.word), 300);
    return () => clearTimeout(tm);
  }, [current]);
  return (
    <div key={current.target.word}>
      <div style={{ background: `linear-gradient(135deg,${t.accent},${t.accent}cc)`, color: "#fff", borderRadius: 22, padding: "50px 20px", textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 11, opacity: .9, fontWeight: 700, marginBottom: 16 }}>СОНСООД БИЧИХ</div>
        <button onClick={() => speakKr(current.target.word)}
          style={{ background: "#fff", color: t.accent, border: "none", borderRadius: "50%", width: 80, height: 80, fontSize: 36, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.2)", margin: "0 auto" }}>
          🔊
        </button>
        <div style={{ fontSize: 12, opacity: .9, marginTop: 14, fontWeight: 600 }}>👆 Дахин сонсох</div>
      </div>
      <input value={userAnswer} onChange={e => setUserAnswer(e.target.value)}
        onKeyDown={e => e.key === "Enter" && userAnswer.trim() && onSubmit()}
        placeholder="Сонссон үгээ бичнэ үү..." disabled={!!showResult} autoFocus
        style={{ width: "100%", padding: "16px 20px", borderRadius: 14, border: `2px solid ${t.border}`, fontSize: 20, fontWeight: 700, textAlign: "center", outline: "none", marginBottom: 12, background: "#fff", boxSizing: "border-box" }} />
      <button onClick={onSubmit} disabled={!userAnswer.trim() || !!showResult}
        style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 14, cursor: "pointer", width: "100%", opacity: userAnswer.trim() ? 1 : .5, boxShadow: `0 4px 0 ${t.border}` }}>
        ✓ Шалгах
      </button>
    </div>
  );
}

// ── SentenceExercise — Үгийг өгүүлбэрт оруулж бэлдэх ─────────────
function SentenceExercise({ current, t, showResult, onSubmit }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [tappedWord, setTappedWord] = useState(null); // дарсан шинэ үг {word, mean}

  // Template-аар өгүүлбэр зохиох (AI-гүй) — синхрон, түргэн
  const sentence = useMemo(() => {
    return buildSentenceFromTemplate(
      current.target.word,
      current.target.meaning,
      current.grammar || null
    );
  }, [current]);

  useEffect(() => {
    setShowAnswer(false);
    setTappedWord(null);
    // Бүх өгүүлбэрийг уншина
    const krText = sentence.parts.map(p => p.t).join("");
    const tm = setTimeout(() => speakKr(krText), 400);
    return () => clearTimeout(tm);
  }, [current, sentence]);

  const krFull = sentence.parts.map(p => p.t).join("");

  return (
    <div key={current.target.word}>
      {/* Target word card */}
      <div style={{ background: "#fff", borderRadius: 18, padding: "16px", textAlign: "center", marginBottom: 12, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 11, opacity: .6, fontWeight: 700, marginBottom: 6 }}>ШИНЭ ҮГ</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: t.text, marginBottom: 4 }}>{current.target.word}</div>
        <div style={{ fontSize: 13, color: t.text, opacity: .65 }}>{current.target.meaning}</div>
        {/* Дүрэм харуулах */}
        {sentence.grammarName && (
          <div style={{ marginTop: 8, display: "inline-block", background: "#f3e5f5", color: "#7c3aed", padding: "4px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
            📖 Дүрэм: {sentence.grammarName} {sentence.grammarMeaning ? `(${sentence.grammarMeaning})` : ""}
          </div>
        )}
        <div>
          <button onClick={() => speakKr(current.target.word)}
            style={{ marginTop: 8, background: t.soft, color: t.accent, border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
            🔊 Үг сонсох
          </button>
        </div>
      </div>

      {/* Sentence card — parts бүтэцтэй, шинэ үг дарвал утга гарна */}
      <div style={{ background: `linear-gradient(135deg,${t.soft},#fff)`, borderRadius: 18, padding: 16, marginBottom: 12, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, marginBottom: 10, letterSpacing: 1 }}>✍️ ӨГҮҮЛБЭР</div>

        {/* Солонгос өгүүлбэр — үг бүр tap хийж болно */}
        <div style={{ fontSize: 19, fontWeight: 700, color: "#1a1a2e", lineHeight: 1.8, marginBottom: 8 }}>
          {sentence.parts.map((p, i) => {
            if (p.word) {
              // Шинэ үг — тодруулсан, дарж болно
              return (
                <span key={i} onClick={() => {
                  setTappedWord(tappedWord?.word === p.word ? null : { word: p.word, mean: p.mean });
                  speakKr(p.word);
                }} style={{
                  background: "#fff3cd", color: "#b8860b", padding: "2px 8px",
                  borderRadius: 8, fontWeight: 900, border: "2px solid #ffc107",
                  cursor: "pointer", margin: "0 2px", display: "inline-block",
                }}>{p.t}</span>
              );
            }
            return <span key={i}>{p.t}</span>;
          })}
        </div>

        {/* Дарсан шинэ үгийн утга */}
        {tappedWord && (
          <div className="k-fade" style={{ background: "#fffbeb", border: "1px solid #ffc107", borderRadius: 10, padding: "8px 12px", marginBottom: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 900, color: "#b8860b" }}>{tappedWord.word}</span>
            <span style={{ color: "#666" }}> = {tappedWord.mean}</span>
            <span style={{ fontSize: 10, color: "#999", marginLeft: 6 }}>(анхны хэлбэр)</span>
          </div>
        )}

        <button onClick={() => speakKr(krFull)}
          style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 10, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700, marginBottom: 4 }}>
          🔊 Бүх өгүүлбэр сонсох
        </button>
        <div style={{ fontSize: 10, color: t.accent, opacity: .6, marginTop: 4 }}>💡 Шар үг дээр дарж утга, дуудлагыг үзээрэй</div>

        {showAnswer && (
          <div className="k-fade" style={{ borderTop: `1px solid ${t.border}`, paddingTop: 10, marginTop: 10, fontSize: 14, color: "#555", lineHeight: 1.5 }}>
            <span style={{ fontSize: 10, color: t.accent, fontWeight: 700 }}>📝 МОНГОЛ ОРЧУУЛГА:</span>
            <div style={{ marginTop: 4, fontWeight: 600 }}>{sentence.mn}</div>
          </div>
        )}
      </div>

      {/* Buttons */}
      {!showAnswer && (
        <button onClick={() => setShowAnswer(true)}
          style={{ width: "100%", padding: 12, borderRadius: 14, border: "none", background: t.soft, color: t.accent, fontWeight: 800, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          💡 Бүтэн орчуулга харах
        </button>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onSubmit(false)}
          style={{ flex: 1, background: "#ffcdd2", color: "#c62828", border: "none", borderRadius: 14, padding: 12, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 3px 0 #ef9a9a" }}>
          😅 Дахин үзэх
        </button>
        <button onClick={() => onSubmit(true)}
          style={{ flex: 1, background: "#c8e6c9", color: "#2e7d32", border: "none", borderRadius: 14, padding: 12, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 3px 0 #a5d6a7" }}>
          ✅ Ойлгосон
        </button>
      </div>
    </div>
  );
}
function PracticeStudio({ vocabs, grammars, t, level, onClose, onComplete, title }) {
  const [stage, setStage] = useState("menu");
  const [exerciseType, setExerciseType] = useState(null);
  const [items, setItems] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [showResult, setShowResult] = useState(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [lostItem, setLostItem] = useState(false);
  const [selectedDate, setSelectedDate] = useState("all"); // "all" эсвэл "YYYY-MM-DD"
  const [missedWords, setMissedWords] = useState([]); // алдсан үгсийн жагсаалт
  const [selectedGrammar, setSelectedGrammar] = useState(null); // sentence дасгалд сонгосон дүрэм
  const [showGrammarPick, setShowGrammarPick] = useState(false); // дүрэм сонгох popup
  // ⚡ XP — идэвхтэй (хүчинтэй) хугацаа хэмжих
  // Асуулт хооронд 5 секундээс бага зуурсан бол → хууран мэхэлж байна → тоохгүй
  const lastAnswerTimeRef = useRef(null); // өмнөх хариултын цаг
  const validSecondsRef = useRef(0); // нийт ХҮЧИНТЭЙ секунд

  // Бүх боломжит өдрүүд
  const availableDates = useMemo(() => {
    const all = [...(vocabs || []), ...(grammars || [])];
    const dates = [...new Set(all.filter(v => v.date).map(v => v.date))].sort().reverse();
    return dates;
  }, [vocabs, grammars]);

  const allWords = useMemo(() => {
    let v = (vocabs || []).filter(x => x.word && x.meaning);
    let g = (grammars || []).filter(x => x.word && x.meaning);
    // Filter by selected date
    if (selectedDate !== "all") {
      v = v.filter(x => x.date === selectedDate);
      g = g.filter(x => x.date === selectedDate);
    }
    return [...v, ...g];
  }, [vocabs, grammars, selectedDate]);

  const startExercise = (type) => {
    if (allWords.length < 1) return;
    setExerciseType(type);
    setCurrentIdx(0); setCorrectCount(0); setWrongCount(0);
    setStreak(0); setMaxStreak(0); setShowResult(null);
    setUserAnswer(""); setShowHint(false);
    setStartTime(Date.now()); setLostItem(false);
    // ⚡ XP хугацаа хэмжих ref-үүдийг эхлүүлэх
    lastAnswerTimeRef.current = Date.now();
    validSecondsRef.current = 0;

    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    const itemCount = Math.min(allWords.length, 10);
    const selected = shuffled.slice(0, itemCount);

    if (type === "multiple_choice" || type === "reverse_choice") {
      setItems(selected.map(target => {
        const distractors = shuffled.filter(w => w.word !== target.word).slice(0, 3);
        const options = type === "reverse_choice"
          ? [...distractors.map(d => d.word), target.word].sort(() => Math.random() - 0.5)
          : [...distractors.map(d => d.meaning), target.meaning].sort(() => Math.random() - 0.5);
        return { target, options };
      }));
    } else if (type === "sentence") {
      // Зөвхөн vocab (дүрэм биш) ашиглаж, сонгосон дүрмийг хослуулна
      let vocabOnly = selected.filter(w => w.type !== "grammar");
      if (vocabOnly.length === 0) vocabOnly = selected; // fallback
      setItems(vocabOnly.map(target => ({ target, grammar: selectedGrammar })));
    } else {
      setItems(selected.map(target => ({ target })));
    }
    setStage("exercise");
  };

  const submitAnswer = (answer, correct) => {
    const isRight = String(answer).trim().toLowerCase() === String(correct).trim().toLowerCase();
    // ⚡ XP — асуулт хооронд зарцуулсан хугацаа тооцох
    // 5-60 секундын хооронд бол ХҮЧИНТЭЙ (хэт хурдан = хууралт, хэт удаан = орхисон)
    const now = Date.now();
    if (lastAnswerTimeRef.current) {
      const gap = (now - lastAnswerTimeRef.current) / 1000;
      if (gap >= 5 && gap <= 60) {
        validSecondsRef.current += gap;
      }
    }
    lastAnswerTimeRef.current = now;

    setShowResult(isRight ? "correct" : "wrong");
    const currentWord = items[currentIdx]?.target?.word;
    if (isRight) {
      setCorrectCount(c => c + 1);
      setStreak(s => { const ns = s + 1; setMaxStreak(m => Math.max(m, ns)); return ns; });
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
    } else {
      setWrongCount(c => c + 1);
      setStreak(0); setLostItem(true);
      // Алдсан үгийг хадгалах
      if (currentWord) {
        setMissedWords(prev => [...prev, currentWord]);
      }
      try { if (navigator.vibrate) navigator.vibrate([30, 30, 30]); } catch (e) {}
      setTimeout(() => setLostItem(false), 1500);
    }
    setTimeout(() => {
      setShowResult(null); setUserAnswer(""); setShowHint(false);
      if (currentIdx + 1 >= items.length) finishExercise(correctCount + (isRight ? 1 : 0));
      else setCurrentIdx(i => i + 1);
    }, isRight ? 800 : 1500);
  };

  const finishExercise = (finalCorrect) => {
    const total = items.length;
    const score = total > 0 ? Math.round((finalCorrect / total) * 100) : 0;
    setStage("done");
    if (onComplete) {
      const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
      // validSeconds = зөвхөн ХҮЧИНТЭЙ (5-60 сек хооронд) зарцуулсан хугацаа
      const validSeconds = Math.round(validSecondsRef.current);
      onComplete({ score, correct: finalCorrect, total, exerciseType, elapsed, validSeconds, maxStreak, missedWords });
    }
  };

  // ─── MENU ───
  if (stage === "menu") {
    const exerciseTypes = [
      { id: "flashcard", emoji: "🎴", title: "Flashcard", desc: "Үг харах, эргүүлж шалгах", color: "#42a5f5" },
      { id: "multiple_choice", emoji: "✅", title: "Сонголт", desc: "4 хариунаас зөвийг сонго", color: "#66bb6a" },
      { id: "reverse_choice", emoji: "🔄", title: "Mongol→Korean", desc: "Эсрэг чиглэлд таних", color: "#ab47bc" },
      { id: "spelling", emoji: "⌨️", title: "Үсэглэх", desc: "Солонгосоор бичих", color: "#ff7043" },
      { id: "listening", emoji: "👂", title: "Сонсох", desc: "Дуудлагыг сонсож бичих", color: "#ec407a" },
      { id: "sentence", emoji: "✍️", title: "Өгүүлбэр", desc: "Үгийг өгүүлбэрт оруулж сурах", color: "#7c3aed" },
    ];
    return (
      <div style={{ minHeight: "100vh", background: t.bg, padding: 14, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={onClose} style={btn("#fff", t.text, t.border)}>← Хаах</button>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{title || "Бэлдэх"}</div>
          <div style={{ width: 60 }} />
        </div>

        {/* Hero animation — 2 penguin walking */}
        <WalkingBuddies progress={0} />

        <div className="k-fade" style={{ background: `linear-gradient(135deg,${t.accent},${t.accent}cc)`, color: "#fff", borderRadius: 18, padding: 18, marginBottom: 16, position: "relative", overflow: "hidden" }}>
          <div className="k-bounce" style={{ fontSize: 28, marginBottom: 4 }}>🌸</div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Сайн уу!</div>
          <div style={{ fontSize: 13, opacity: .95, marginTop: 3 }}>Ямар дасгалаар бэлдмээр байна?</div>
          <div style={{ fontSize: 11, opacity: .8, marginTop: 4 }}>📚 {allWords.length} үг бэлэн</div>
        </div>

        {/* Өдөр сонгох tab */}
        {availableDates.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: t.text, opacity: .7, fontWeight: 700, marginBottom: 6, letterSpacing: .5 }}>
              📅 АЛЬ ӨДРИЙН ҮГИЙГ БЭЛДЭХ ВЭ?
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", overflowX: "auto", paddingBottom: 4 }}>
              <button onClick={() => setSelectedDate("all")} style={{
                background: selectedDate === "all" ? t.accent : "#fff",
                color: selectedDate === "all" ? "#fff" : t.text,
                border: `2px solid ${selectedDate === "all" ? t.accent : t.border}`,
                borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer",
                whiteSpace: "nowrap",
              }}>📋 Бүгд</button>
              {availableDates.map(d => {
                const cnt = [...(vocabs || []), ...(grammars || [])].filter(v => v.date === d).length;
                const isSel = selectedDate === d;
                return (
                  <button key={d} onClick={() => setSelectedDate(d)} style={{
                    background: isSel ? t.accent : "#fff",
                    color: isSel ? "#fff" : t.text,
                    border: `2px solid ${isSel ? t.accent : t.border}`,
                    borderRadius: 10, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}>{d.slice(5)} <span style={{ opacity: .7 }}>({cnt})</span></button>
                );
              })}
            </div>
          </div>
        )}

        {allWords.length === 0 ? (
          <div style={{ background: t.card, borderRadius: 16, padding: 30, textAlign: "center", border: `2px dashed ${t.border}` }}>
            <div style={{ fontSize: 48, marginBottom: 10, opacity: .5 }}>📭</div>
            <div style={{ fontSize: 14, color: t.text, fontWeight: 700 }}>Үг байхгүй байна</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {exerciseTypes.map((ex, i) => (
              <div key={ex.id} onClick={() => {
                // Sentence дасгалд → эхлээд дүрэм сонгох цонх
                if (ex.id === "sentence") {
                  setShowGrammarPick(true);
                } else {
                  startExercise(ex.id);
                }
              }} className="k-press"
                style={{
                  background: "#fff", borderRadius: 16, padding: 14,
                  border: `2px solid ${ex.color}33`, borderTop: `4px solid ${ex.color}`,
                  cursor: "pointer", animation: `kSlideUp .35s ease ${i * 0.05}s both`, textAlign: "center",
                }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>{ex.emoji}</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#1a1a2e" }}>{ex.title}</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{ex.desc}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: t.text, opacity: .5 }}>
          🌸 화이팅! Чадна!
        </div>

        {/* 📖 ДҮРЭМ СОНГОХ POPUP (sentence дасгалд) */}
        {showGrammarPick && (
          <Overlay onClose={() => setShowGrammarPick(false)} maxW={420}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 24 }}>✍️</span> Өгүүлбэр зохиох
            </div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 14, lineHeight: 1.5, background: "#f3e5f5", padding: 10, borderRadius: 10 }}>
              💡 Дүрэм сонговол шинэ үгсээ <b>тэр дүрмээр</b> өгүүлбэрт оруулна. Дүрэм сонгохгүй бол энгийн өгүүлбэр зохионо.
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: t.accent, marginBottom: 8 }}>📖 ДҮРЭМ СОНГОХ (заавал биш)</div>
            <div style={{ maxHeight: "40vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {/* Дүрэмгүй сонголт */}
              <div onClick={() => setSelectedGrammar(null)} style={{
                padding: 10, borderRadius: 10, cursor: "pointer",
                background: !selectedGrammar ? t.soft : "#f8f8f8",
                border: !selectedGrammar ? `2px solid ${t.accent}` : "2px solid #eee",
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: !selectedGrammar ? t.accent : "#666" }}>
                  🎲 Дүрэмгүй (энгийн өгүүлбэр)
                </div>
              </div>
              {/* Ангийн grammar-ууд */}
              {(grammars || []).filter(g => g.word && g.meaning).map((g, i) => {
                const isSel = selectedGrammar?.word === g.word;
                return (
                  <div key={i} onClick={() => setSelectedGrammar(g)} style={{
                    padding: 10, borderRadius: 10, cursor: "pointer",
                    background: isSel ? t.soft : "#f8f8f8",
                    border: isSel ? `2px solid ${t.accent}` : "2px solid #eee",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: isSel ? t.accent : "#1a1a2e" }}>
                      📖 {g.word}
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{g.meaning}</div>
                  </div>
                );
              })}
              {(grammars || []).filter(g => g.word && g.meaning).length === 0 && (
                <div style={{ textAlign: "center", padding: 16, color: "#aaa", fontSize: 12 }}>
                  Ангид дүрэм байхгүй байна.<br />Энгийн өгүүлбэр зохионо.
                </div>
              )}
            </div>

            <button onClick={() => { setShowGrammarPick(false); startExercise("sentence"); }}
              style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: `linear-gradient(135deg,${t.accent},${t.accent}dd)`, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: `0 4px 0 ${t.border}` }}>
              ✍️ Эхлэх {selectedGrammar ? `(${selectedGrammar.word} дүрмээр)` : "(энгийн)"}
            </button>
          </Overlay>
        )}
      </div>
    );
  }

  // ─── DONE ───
  if (stage === "done") {
    const total = items.length;
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
    const isGreat = score >= 80, isGood = score >= 60;
    return (
      <div style={{ minHeight: "100vh", background: t.bg, padding: 14, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto" }}>
        <div className="k-pop" style={{ background: "#fff", borderRadius: 22, padding: 24, textAlign: "center", border: `2px solid ${t.border}`, marginTop: 20 }}>
          <div className="k-bounce" style={{ fontSize: 70, marginBottom: 10 }}>{isGreat ? "🏆" : isGood ? "🎉" : "💪"}</div>
          <div style={{ fontWeight: 900, fontSize: 22, color: t.accent, marginBottom: 4 }}>{isGreat ? "Гайхалтай!" : isGood ? "Сайн!" : "Үргэлжлүүл!"}</div>
          <div style={{ fontSize: 13, color: t.text, opacity: .7, marginBottom: 18 }}>
            {isGreat ? "Гайхалтай хийсэн!" : isGood ? "Сайн ажиллалаа!" : "Дахин оролд!"}
          </div>
          <div style={{ background: `linear-gradient(135deg,${t.accent},${t.accent}cc)`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
            <div style={{ color: "#fff", fontSize: 14, opacity: .9, fontWeight: 700 }}>ОНОО</div>
            <div style={{ color: "#fff", fontSize: 44, fontWeight: 900, lineHeight: 1, marginTop: 4 }}>{score}<span style={{ fontSize: 22 }}>/100</span></div>
            <div style={{ color: "#fff", fontSize: 12, opacity: .9, marginTop: 6 }}>{correctCount} зөв / {total} нийт</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ background: t.soft, borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 10, color: t.text, opacity: .7, fontWeight: 700 }}>🔥 MAX STREAK</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: t.accent }}>{maxStreak}</div>
            </div>
            <div style={{ background: t.soft, borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 10, color: t.text, opacity: .7, fontWeight: 700 }}>⏱️ ХУГАЦАА</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: t.accent }}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStage("menu")}
              style={{ flex: 1, background: "#fff", color: t.accent, border: `2px solid ${t.accent}`, borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              🔄 Дахин
            </button>
            <button onClick={onClose}
              style={{ flex: 1, background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: `0 4px 0 ${t.border}` }}>
              ✅ Дуусгах
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── EXERCISES ───
  const current = items[currentIdx];
  if (!current) return null;
  const progress = items.length > 0 ? currentIdx / items.length : 0;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, padding: 14, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setStage("menu")} style={btn("#fff", t.text, t.border)}>← Цэс</button>
        <div style={{ fontWeight: 800, fontSize: 13, color: t.accent }}>{currentIdx + 1}/{items.length}</div>
        <div style={{ width: 60, textAlign: "right" }}>
          {streak >= 3 && <span style={{ background: "#ff9800", color: "#fff", padding: "3px 8px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}>🔥 {streak}</span>}
        </div>
      </div>

      {/* Walking buddies animation — Image шиг! */}
      <WalkingBuddies progress={progress} lostItem={lostItem} />

      <div style={{ height: 6, background: t.soft, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: `linear-gradient(90deg,${t.accent},${t.accent}cc)`, transition: "width .4s" }} />
      </div>

      {exerciseType === "flashcard" && (
        <FlashcardExercise current={current} t={t} onNext={(known) => {
          if (known) setCorrectCount(c => c + 1); else { setWrongCount(c => c + 1); setLostItem(true); setTimeout(() => setLostItem(false), 1500); }
          if (currentIdx + 1 >= items.length) finishExercise(correctCount + (known ? 1 : 0));
          else setCurrentIdx(i => i + 1);
        }} />
      )}
      {exerciseType === "multiple_choice" && (
        <MCExercise current={current} t={t} questionKey="word" answerKey="meaning" label="Энэ үгийн утгыг сонго:" showResult={showResult} onSubmit={(ans) => submitAnswer(ans, current.target.meaning)} />
      )}
      {exerciseType === "reverse_choice" && (
        <MCExercise current={current} t={t} questionKey="meaning" answerKey="word" label="Солонгосоор сонго:" noAudio showResult={showResult} onSubmit={(ans) => submitAnswer(ans, current.target.word)} />
      )}
      {exerciseType === "spelling" && (
        <SpellingExercise current={current} t={t} userAnswer={userAnswer} setUserAnswer={setUserAnswer} showHint={showHint} setShowHint={setShowHint} showResult={showResult} onSubmit={() => submitAnswer(userAnswer, current.target.word)} />
      )}
      {exerciseType === "listening" && (
        <ListeningExercise current={current} t={t} userAnswer={userAnswer} setUserAnswer={setUserAnswer} showResult={showResult} onSubmit={() => submitAnswer(userAnswer, current.target.word)} />
      )}
      {exerciseType === "sentence" && (
        <SentenceExercise current={{ ...current, level }} t={t} showResult={showResult}
          onSubmit={(known) => {
            // "Ойлгож байна" → зөв, "Ойлгохгүй" → буруу (алдсан үгсэд хадгална)
            if (known) {
              setCorrectCount(c => c + 1);
              setStreak(s => { const ns = s + 1; setMaxStreak(m => Math.max(m, ns)); return ns; });
            } else {
              setWrongCount(c => c + 1);
              setStreak(0);
              setLostItem(true);
              const cw = items[currentIdx]?.target?.word;
              if (cw) setMissedWords(prev => [...prev, cw]);
              setTimeout(() => setLostItem(false), 1500);
            }
            if (currentIdx + 1 >= items.length) finishExercise(correctCount + (known ? 1 : 0));
            else setCurrentIdx(i => i + 1);
          }} />
      )}

      {showResult && (
        <div className="k-pop" style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: showResult === "correct" ? "linear-gradient(180deg,#c8e6c9,#a5d6a7)" : "linear-gradient(180deg,#ffcdd2,#ef9a9a)",
          padding: "18px 20px", zIndex: 1000, textAlign: "center",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          boxShadow: "0 -10px 30px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{showResult === "correct" ? "🎉" : "💔"}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: showResult === "correct" ? "#1b5e20" : "#b71c1c" }}>
            {showResult === "correct" ? "Зөв! +5 XP" : `Уучлаарай. Зөв: ${current.target.meaning || current.target.word}`}
          </div>
        </div>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 9 — CardContent (Сурагчийн карт)
// ════════════════════════════════════════════════════════════════════

function CardContent({ s, t, isAdmin, isSuperAdmin, upd, attMonth, setAttMonth, classDays, vocabEntries, sessions, present, onToggleAtt, setShowPay, editNotes, setEditNotes, notes, setNotes, homeworks, homeworkSubs, exams, examSubs }) {
  const xp = s.xp || 0;
  const level = s.level || 0;
  const enrollDate = s.enroll_date ? new Date(s.enroll_date) : null;
  const daysEnrolled = enrollDate ? Math.floor((Date.now() - enrollDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  // Homework + Exam statistics
  const myHws = (homeworks || []).filter(h => h.class_id === s.class_id);
  const mySubs = (homeworkSubs || []).filter(hs => hs.student_id === s.id);
  const completedHwCount = mySubs.length;
  const pendingHwCount = myHws.filter(h => !mySubs.find(sub => sub.homework_id === h.id) && new Date(h.due_date) > new Date()).length;
  const myExamSubs = (examSubs || []).filter(es => es.student_id === s.id);
  const avgExScore = myExamSubs.length > 0 ? Math.round(myExamSubs.reduce((a, b) => a + (b.score || 0), 0) / myExamSubs.length) : 0;

  return (
    <div className="k-fade">
      {/* Photo + Name + Background plant */}
      <div style={{
        background: t.card, borderRadius: 18, padding: 18, marginBottom: 12,
        border: `2px solid ${t.border}`, textAlign: "center",
        position: "relative", overflow: "hidden",
      }}>
        {/* Ургамал — background */}
        {(() => {
          // Хэр өсөх вэ — completedHwCount + maxStreak + correctStreak-аас
          const growth = Math.min(100, (completedHwCount * 8) + ((s.hw_streak || 0) * 3));
          // 5 шат:
          // 0-20%: бороого үр (seedling 🌱)
          // 21-40%: жижиг ургамал 🌿
          // 41-60%: дунд ургамал 🪴
          // 61-80%: мод 🌳
          // 81-100%: цэцэг 🌸 / том мод 🌲
          let plantEmoji = "🌱", plantSize = 60;
          if (growth >= 81) { plantEmoji = "🌳"; plantSize = 200; }
          else if (growth >= 61) { plantEmoji = "🌲"; plantSize = 160; }
          else if (growth >= 41) { plantEmoji = "🪴"; plantSize = 120; }
          else if (growth >= 21) { plantEmoji = "🌿"; plantSize = 90; }
          return (
            <div style={{
              position: "absolute", bottom: -10, right: -10,
              fontSize: plantSize, opacity: 0.15,
              pointerEvents: "none", lineHeight: 1,
              transition: "all .6s ease",
            }}>{plantEmoji}</div>
          );
        })()}
        {/* Огторгуй */}
        <div style={{ position: "absolute", top: 6, left: 8, fontSize: 16, opacity: 0.2 }}>☁️</div>
        <div style={{ position: "absolute", top: 6, right: 8, fontSize: 16, opacity: 0.2 }}>✨</div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ position: "relative", display: "inline-block", marginBottom: 10 }}>
            <div style={{
              width: 90, height: 90, borderRadius: "50%", overflow: "hidden",
              background: t.soft, border: `4px solid ${t.accent}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40,
              margin: "0 auto", boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
            }}>
              {s.photo_url ? <img src={s.photo_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : t.emoji}
            </div>
          </div>
          <div style={{ fontWeight: 900, fontSize: 20, color: t.text, marginBottom: 4 }}>{s.name}</div>
          <div style={{ fontSize: 12, color: t.accent, fontWeight: 700, marginBottom: 8 }}>{TOPIK[level]}</div>

          {/* XP big */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.soft, borderRadius: 12, padding: "6px 14px", marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: t.accent }}>{xp}</span>
            <span style={{ fontSize: 11, color: t.text, opacity: .7, fontWeight: 700 }}>XP</span>
          </div>

          {/* Plant growth indicator */}
          {(completedHwCount > 0 || (s.hw_streak || 0) > 0) && (() => {
            const growth = Math.min(100, (completedHwCount * 8) + ((s.hw_streak || 0) * 3));
            let stageName = "🌱 Үр", nextStage = "🌿 Ургамал";
            if (growth >= 81) { stageName = "🌳 Том мод"; nextStage = "Хамгийн дээд!"; }
            else if (growth >= 61) { stageName = "🌲 Мод"; nextStage = "🌳 Том мод"; }
            else if (growth >= 41) { stageName = "🪴 Цэцэг"; nextStage = "🌲 Мод"; }
            else if (growth >= 21) { stageName = "🌿 Ургамал"; nextStage = "🪴 Цэцэг"; }
            return (
              <div style={{ marginTop: 10, padding: "6px 10px", background: t.soft, borderRadius: 10, fontSize: 10, color: t.text, fontWeight: 700 }}>
                {stageName} · {growth}% {growth < 100 && <span style={{ opacity: .6 }}>→ {nextStage}</span>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Attendance stats */}
      {sessions.length > 0 && (
        <div style={{ background: t.card, borderRadius: 14, padding: 12, marginBottom: 10, border: `2px solid ${t.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: t.text }}>📅 Энэ сарын ирц</div>
            <div style={{ fontSize: 11, color: t.text, opacity: .6 }}>
              {sessions.length} оролтоос {present}-нд оролцсон
            </div>
          </div>
          <AttendanceStats present={present} total={sessions.length} card={t.soft} />
        </div>
      )}

      {/* Хичээллэх оролтуудын dot grid */}
      {sessions.length > 0 && (
        <div style={{ background: t.card, borderRadius: 14, padding: 12, marginBottom: 10, border: `2px solid ${t.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 8 }}>
            🎯 {attMonth} оролтууд
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {sessions.map(item => {
              const ok = (s.attendance || {})[item.date];
              return (
                <div key={item.date} onClick={() => isAdmin && onToggleAtt(item.date)}
                  title={`${item.date} ${ok ? "✓ ирсэн" : "ирээгүй"}`}
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: ok ? t.accent : t.soft,
                    border: ok ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: ok ? "#fff" : t.text, fontWeight: 700,
                    cursor: isAdmin ? "pointer" : "default",
                  }}>
                  {parseInt(item.date.slice(-2))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Үг + Дүрэм статистик */}
      {vocabEntries && vocabEntries.length > 0 && (() => {
        const vCount = vocabEntries.filter(v => v.type !== "grammar").length;
        const gCount = vocabEntries.filter(v => v.type === "grammar").length;
        return (
          <div style={{ background: t.card, borderRadius: 14, padding: 12, marginBottom: 10, border: `2px solid ${t.border}` }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 8 }}>📚 Сурсан зүйлс</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ background: t.soft, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: t.accent }}>{vCount}</div>
                <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>📚 үг</div>
              </div>
              <div style={{ background: t.soft, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed" }}>{gCount}</div>
                <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>📖 дүрэм</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Сургалтын идэвх — Homework + Exam stats */}
      {(myHws.length > 0 || myExamSubs.length > 0) && (
        <div style={{ background: t.card, borderRadius: 14, padding: 12, marginBottom: 10, border: `2px solid ${t.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 8 }}>🎓 Сургалтын идэвх</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div style={{ background: t.soft, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: t.accent }}>{completedHwCount}<span style={{ fontSize: 11, opacity: .6 }}>/{myHws.length}</span></div>
              <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>📝 Даалгавар</div>
              {pendingHwCount > 0 && <div style={{ fontSize: 8, color: "#e65100", fontWeight: 700, marginTop: 1 }}>⏳ {pendingHwCount}</div>}
            </div>
            <div style={{ background: t.soft, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#43a047" }}>{myExamSubs.length}</div>
              <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>🏆 Шалгалт</div>
              {myExamSubs.length > 0 && <div style={{ fontSize: 8, color: "#43a047", fontWeight: 700, marginTop: 1 }}>дундаж {avgExScore}%</div>}
            </div>
            <div style={{ background: t.soft, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#7c3aed" }}>+{myExamSubs.reduce((a, b) => a + (b.xp_earned || 0), 0)}</div>
              <div style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>⚡ XP</div>
            </div>
          </div>
        </div>
      )}

      {/* Personal info — зөвхөн сүпэр-админ + сурагч өөрөө харна */}
      {(isSuperAdmin || (!isAdmin)) && (
        <div style={{ background: t.card, borderRadius: 14, padding: 12, marginBottom: 10, border: `2px solid ${t.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 8 }}>📋 Мэдээлэл</div>
          <div style={{ display: "grid", gap: 6, fontSize: 12, color: t.text }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ opacity: .6 }}>📞 Утас:</span>
              <span style={{ fontWeight: 700 }}>{s.phone || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ opacity: .6 }}>📧 И-мэйл:</span>
              <span style={{ fontWeight: 700, fontSize: 11 }}>{s.email || "—"}</span>
            </div>
            {isSuperAdmin && s.rd && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: .6 }}>🆔 Регистр:</span>
                <span style={{ fontWeight: 700, fontSize: 11 }}>{s.rd}</span>
              </div>
            )}
            {s.enroll_date && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: .6 }}>📅 Бүртгүүлсэн:</span>
                <span style={{ fontWeight: 700 }}>{fmtDate(s.enroll_date)} ({daysEnrolled} өдөр)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Энгийн багшид: зөвхөн нэр, түвшин, ангид байгаа эсэх */}
      {isAdmin && !isSuperAdmin && (
        <div style={{ background: t.card, borderRadius: 14, padding: 12, marginBottom: 10, border: `2px solid ${t.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 8 }}>📋 Мэдээлэл</div>
          <div style={{ display: "grid", gap: 6, fontSize: 12, color: t.text }}>
            {s.enroll_date && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: .6 }}>📅 Бүртгүүлсэн:</span>
                <span style={{ fontWeight: 700 }}>{fmtDate(s.enroll_date)} ({daysEnrolled} өдөр)</span>
              </div>
            )}
            <div style={{ fontSize: 10, opacity: .5, fontStyle: "italic", marginTop: 4 }}>
              🔒 Утас, и-мэйл, РД зөвхөн сүпэр админд харагдана
            </div>
          </div>
        </div>
      )}

      {/* Payment info — бүх хэрэглэгчид харуулна */}
      {((s.total_fee || 0) > 0 || s.next_due) && (
        <div style={{ background: t.card, borderRadius: 14, padding: 12, marginBottom: 10, border: `2px solid ${t.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: t.text }}>💰 Төлбөр</div>
            {isSuperAdmin && setShowPay && <button onClick={() => setShowPay(true)} style={btn(t.soft, t.accent)}>+ Нэмэх</button>}
          </div>

          {(s.total_fee || 0) > 0 && (
            <>
              <div style={{ height: 8, background: t.soft, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${Math.min(100, ((s.total_paid || 0) / (s.total_fee || 1)) * 100)}%`, background: (s.total_paid || 0) >= (s.total_fee || 0) ? "#43a047" : t.accent }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.text, marginBottom: s.next_due ? 8 : 0 }}>
                <span>{fmt(s.total_paid || 0)} ₮ төлсөн</span>
                <span style={{ opacity: .7 }}>{fmt(s.total_fee || 0)} ₮ нийт</span>
              </div>
            </>
          )}

          {/* Дараагийн төлбөрийн хугацаа */}
          {s.next_due && (() => {
            const dueDate = new Date(s.next_due);
            const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isOverdue = daysLeft < 0;
            const isSoon = daysLeft >= 0 && daysLeft <= 7;
            return (
              <div style={{
                background: isOverdue ? "#ffebee" : isSoon ? "#fff3cd" : "#e8f5e9",
                border: `1px solid ${isOverdue ? "#ffcdd2" : isSoon ? "#ffe082" : "#a5d6a7"}`,
                borderRadius: 10, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 10, color: isOverdue ? "#c62828" : isSoon ? "#b8860b" : "#1b5e20", fontWeight: 700 }}>
                    {isOverdue ? "⏰ ХОЦОРСОН" : isSoon ? "⚠️ ОЙРХОН" : "✅ ХУГАЦААТАЙ"}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1a1a2e", marginTop: 2 }}>
                    Дараагийн төлбөр: {fmtDate(s.next_due)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: isOverdue ? "#c62828" : isSoon ? "#b8860b" : "#1b5e20" }}>
                    {Math.abs(daysLeft)}
                  </div>
                  <div style={{ fontSize: 9, color: "#888", fontWeight: 600 }}>
                    {isOverdue ? "хоног хоцорсон" : "хоног үлдсэн"}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Notes (багшийн тэмдэглэл) */}
      {isAdmin && (
        <div style={{ background: t.card, borderRadius: 14, padding: 12, border: `2px solid ${t.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: t.text }}>📝 Багшийн тэмдэглэл</div>
            <button onClick={() => setEditNotes && setEditNotes(!editNotes)} style={btn(t.soft, t.accent)}>
              {editNotes ? "💾 Хадгал" : "✏️ Засах"}
            </button>
          </div>
          {editNotes ? (
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              onBlur={() => upd && upd({ teacher_notes: notes })}
              placeholder="Энэ сурагчийн тухай тэмдэглэл..." rows={4}
              style={{ ...INP, fontSize: 12, resize: "vertical", fontFamily: "inherit" }} />
          ) : (
            <div style={{ fontSize: 12, color: t.text, opacity: .8, whiteSpace: "pre-wrap", minHeight: 20 }}>
              {s.teacher_notes || <span style={{ opacity: .4 }}>Тэмдэглэл байхгүй</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 10 — ClassDetail (Анги дотор — Image 2 шиг хэвтээ progress bar)
// ════════════════════════════════════════════════════════════════════

// ── EditClassModal — Ангийн нэр/цаг/өдөр/өнгө/эхлэсэн огноо засах ──
function EditClassModal({ cls, onClose, onSaved, onToast, teachers = [], isSuperAdmin = false }) {
  const [name, setName] = useState(cls.name || "");
  const [time, setTime] = useState(cls.time || "");
  const [days, setDays] = useState(cls.days || []);
  const [color, setColor] = useState(cls.color || "#7c3aed");
  const [startDate, setStartDate] = useState(cls.start_date || TODAY);
  const [teacherId, setTeacherId] = useState(cls.teacher_id || "");
  const [saving, setSaving] = useState(false);

  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const save = async () => {
    if (!name.trim() || !time.trim() || days.length === 0) {
      onToast && onToast("❌ Бүгдийг бөглөнө үү", "error"); return;
    }
    setSaving(true);
    try {
      const updates = { name: name.trim(), time: time.trim(), days, color, start_date: startDate };
      if (isSuperAdmin && teacherId && teacherId !== cls.teacher_id) {
        updates.teacher_id = teacherId;
        // Багш солихоор бол хуучин болон шинэ багшийн class_ids-ийг шинэчилнэ
        const oldTeacherId = cls.teacher_id;
        if (oldTeacherId && oldTeacherId !== teacherId) {
          const oldTeacher = teachers.find(t => t.id === oldTeacherId);
          if (oldTeacher) {
            const newClassIds = (oldTeacher.class_ids || []).filter(id => id !== cls.id);
            await supaUpdate("teachers", oldTeacherId, { class_ids: newClassIds });
          }
        }
        const newTeacher = teachers.find(t => t.id === teacherId);
        if (newTeacher) {
          const newClassIds = [...(newTeacher.class_ids || [])];
          if (!newClassIds.includes(cls.id)) newClassIds.push(cls.id);
          await supaUpdate("teachers", teacherId, { class_ids: newClassIds });
        }
      }
      await supaUpdate("classes", cls.id, updates);
      onSaved && onSaved(updates);
      onToast && onToast("✅ Хадгалагдлаа", "success");
      onClose();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose} maxW={420}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 24 }}>⚙️</span>
        Ангийн тохиргоо
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>📌 АНГИЙН НЭР</div>
        <input value={name} onChange={e => setName(e.target.value)} style={INP} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>🕐 ХИЧЭЭЛЛЭХ ЦАГ</div>
        <input value={time} onChange={e => setTime(e.target.value)} placeholder="жишээ: 18:00" style={INP} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>📅 АНГИ ЭХЭЛСЭН ОГНОО</div>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={INP} />
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Календарь дээр энэ өдрөөс хичээллэх өдрүүд харагдана</div>
      </div>

      {/* 🔀 Багш солих — зөвхөн сүпэр-админд */}
      {isSuperAdmin && teachers.length > 0 && (
        <div style={{ marginBottom: 10, background: "#f3e5f5", borderRadius: 10, padding: 10, border: "1px solid #d4b8ff" }}>
          <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>👩‍🏫 ХАРИУЦАХ БАГШ</div>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)} style={{ ...INP, cursor: "pointer" }}>
            <option value="">— Багш сонгох —</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name} {t.is_super_admin ? "(👑 Сүпэр)" : ""}</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>🔒 Зөвхөн сүпэр-админ багш солих боломжтой</div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>📆 ХИЧЭЭЛЛЭХ ӨДРҮҮД</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6, 7].map(d => {
            const sel = days.includes(d);
            return (
              <button key={d} onClick={() => toggleDay(d)} style={{
                padding: "8px 12px", borderRadius: 10,
                border: sel ? "2px solid #1976d2" : "2px solid #e0e0e0",
                background: sel ? "#e3f2fd" : "#fff", color: sel ? "#1976d2" : "#666",
                fontWeight: 800, fontSize: 11, cursor: "pointer",
              }}>{DLABELS[d]}</button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>🎨 ӨНГӨ</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["#e91e8c", "#7c3aed", "#43a047", "#f57c00", "#1976d2", "#00897b", "#c62828", "#5d4037"].map(c => (
            <div key={c} onClick={() => setColor(c)} style={{
              width: 36, height: 36, borderRadius: 10, background: c, cursor: "pointer",
              border: color === c ? "3px solid #1a1a2e" : "2px solid #fff",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={save} disabled={saving} style={{ ...btn("#1976d2", "#fff"), flex: 2, justifyContent: "center", boxShadow: "0 3px 0 #0d47a1" }}>
          {saving ? "⏳..." : "💾 Хадгалах"}
        </button>
      </div>
    </Overlay>
  );
}

// ── CopyVocabsModal — Сонгосон үг/дүрмийг өөр анги руу хуулах ──
function CopyVocabsModal({ sourceClass, vocabsToCopy, allClasses, onClose, onCopied, onToast }) {
  const [targetClassId, setTargetClassId] = useState("");
  const [targetDate, setTargetDate] = useState(TODAY);
  const [classes, setClassesLocal] = useState(allClasses);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!classes || classes.length === 0) {
      supaSelect("classes").then(setClassesLocal);
    }
  }, []);

  const otherClasses = (classes || []).filter(c => c.id !== sourceClass.id);

  const copy = async () => {
    if (!targetClassId) { onToast && onToast("❌ Анги сонгоно уу", "error"); return; }
    if (vocabsToCopy.length === 0) { onToast && onToast("❌ Хуулах үг байхгүй", "error"); return; }
    setCopying(true);
    try {
      const inserts = vocabsToCopy.map(v => ({
        id: `v${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        class_id: targetClassId,
        word: v.word, meaning: v.meaning, type: v.type || "vocab", date: targetDate,
      }));
      await Promise.all(inserts.map(item => supaInsert("vocab_entries", item)));
      const targetCls = otherClasses.find(c => c.id === targetClassId);
      onToast && onToast(`✅ ${vocabsToCopy.length} үг "${targetCls?.name || "—"}"-руу хуулагдлаа`, "success");
      onCopied && onCopied();
      onClose();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setCopying(false);
  };

  return (
    <Overlay onClose={onClose} maxW={420}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 24 }}>📋</span>
        Үгсийг хуулах
      </div>

      <div style={{ background: "#e3f2fd", borderRadius: 12, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 4 }}>📦 ХУУЛАХ ЗҮЙЛС ({vocabsToCopy.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 80, overflowY: "auto" }}>
          {vocabsToCopy.slice(0, 20).map(v => (
            <span key={v.id} style={{ background: "#fff", border: "1px solid #90caf9", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: v.type === "grammar" ? "#7c3aed" : "#1976d2" }}>
              {v.type === "grammar" ? "📖" : "📚"} {v.word}
            </span>
          ))}
          {vocabsToCopy.length > 20 && <span style={{ opacity: .6, fontSize: 10 }}>+{vocabsToCopy.length - 20}</span>}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>🎯 АЛЬ АНГИ РУУ?</div>
        <select value={targetClassId} onChange={e => setTargetClassId(e.target.value)} style={{ ...INP, cursor: "pointer" }}>
          <option value="">Анги сонгох...</option>
          {otherClasses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.time})</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>📅 АЛЬ ӨДӨРТ?</div>
        <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={INP} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={copy} disabled={copying || !targetClassId} style={{ ...btn("#1976d2", "#fff"), flex: 2, justifyContent: "center", boxShadow: "0 3px 0 #0d47a1", opacity: (copying || !targetClassId) ? .5 : 1 }}>
          {copying ? "⏳..." : `📋 ${vocabsToCopy.length} үг хуулах`}
        </button>
      </div>
    </Overlay>
  );
}

function ClassDetail({ cls, isAdmin, isSuperAdmin, students, setStudents, setClasses,
  goBack, attMonth, setAttMonth, teacherId, homeworks, homeworkSubs, exams, examSubs,
  vocabEntries, refreshAll, onToast, onSelectStudent, teachers = [] }) {
  const [showAddSt, setShowAddSt] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [showBulkAtt, setShowBulkAtt] = useState(false);
  const [showCreateHw, setShowCreateHw] = useState(false);
  const [showHwList, setShowHwList] = useState(false);
  const [showCreateExam, setShowCreateExam] = useState(false);
  const [selExam, setSelExam] = useState(null);
  const [confirmDelCls, setConfirmDelCls] = useState(false);
  const [confirmDelSt, setConfirmDelSt] = useState(null);
  const [showEditCls, setShowEditCls] = useState(false);
  const [showCopyVocabs, setShowCopyVocabs] = useState(false);
  const [selectedVocabIds, setSelectedVocabIds] = useState(new Set());
  const [showVocabList, setShowVocabList] = useState(false);
  // Vocab add
  const [vocabDate, setVocabDate] = useState(TODAY);
  const [vocabType, setVocabType] = useState("vocab");
  const [vocabWord, setVocabWord] = useState("");
  const [vocabMean, setVocabMean] = useState("");
  const [vocabCategory, setVocabCategory] = useState("");
  const [translating, setTranslating] = useState(false);
  // Bulk paste
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkKr, setBulkKr] = useState("");
  const [bulkMn, setBulkMn] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkTranslating, setBulkTranslating] = useState(false);
  // New student
  const [ns, setNs] = useState({ name: "", phone: "", email: "", password: "", level: 0 });

  const classVocabs = vocabEntries.filter(v => v.class_id === cls.id);
  const classHws = (homeworks || []).filter(h => h.class_id === cls.id);
  const classExams = (exams || []).filter(e => e.class_id === cls.id);
  const activeExam = classExams.find(e => e.status === "active");

  // Add new student
  const addStudent = async () => {
    if (!ns.name.trim() || !ns.email.trim() || !ns.password) {
      onToast && onToast("❌ Бүгдийг бөглөнө үү", "error"); return;
    }
    try {
      await supaInsert("students", {
        id: `s${Date.now()}`, class_id: cls.id, ...ns,
        enroll_date: TODAY, theme_id: "sakura", xp: 0,
        attendance: {}, badges: [], weak_words: [],
      });
      onToast && onToast("✅ Сурагч нэмэгдлээ", "success");
      setShowAddSt(false);
      setNs({ name: "", phone: "", email: "", password: "", level: 0 });
      refreshAll && refreshAll();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  // Delete student
  const deleteStudent = async (sid) => {
    try {
      await supaDelete("students", sid);
      setStudents(prev => prev.filter(s => s.id !== sid));
      onToast && onToast("✅ Сурагч устгагдлаа", "success");
      setConfirmDelSt(null);
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  // Delete class
  const deleteClass = async () => {
    try {
      for (const s of students) await supaDelete("students", s.id);
      for (const v of classVocabs) await supaDelete("vocab_entries", v.id);
      await supaDelete("classes", cls.id);
      onToast && onToast("✅ Анги устгагдлаа", "success");
      goBack();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  // Add vocab
  const addVocab = async () => {
    if (!vocabWord.trim() || !vocabMean.trim()) {
      onToast && onToast("❌ Үг ба утгыг бөглөнө үү", "error"); return;
    }
    const word = vocabWord.trim();
    // Давхар үг шалгах — энэ ангид ижил үг байгаа эсэх
    const duplicate = classVocabs.find(v =>
      (v.word || "").trim().toLowerCase() === word.toLowerCase()
    );
    if (duplicate) {
      const ok = window.confirm(
        `⚠️ "${word}" гэдэг үг энэ ангид аль хэдийн байна!\n\n` +
        `Одоо байгаа: ${duplicate.word} = ${duplicate.meaning}\n` +
        `Огноо: ${duplicate.date || "—"}\n\n` +
        `Дахин нэмэх үү?`
      );
      if (!ok) return;
    }
    try {
      await supaInsert("vocab_entries", {
        id: `v${Date.now()}`, class_id: cls.id,
        word, meaning: vocabMean.trim(),
        type: vocabType, date: vocabDate,
        category: vocabCategory.trim() || null,
      });
      setVocabWord(""); setVocabMean("");
      onToast && onToast(`✅ ${vocabType === "grammar" ? "Дүрэм" : "Үг"} нэмэгдлээ`, "success");
      refreshAll && refreshAll();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  // AI translate
  const doTranslate = async () => {
    if (!vocabWord.trim()) return;
    setTranslating(true);
    try {
      const mn = await translateKrToMn(vocabWord.trim());
      if (mn) setVocabMean(mn);
      else onToast && onToast("⚠️ Орчуулга олдсонгүй", "warning");
    } catch (e) { onToast && onToast("❌ AI алдаа: " + e.message, "error"); }
    setTranslating(false);
  };

  // Bulk paste — мөр болгоныг тусдаа үг болгож хослуулна
  const bulkRows = useMemo(() => {
    const krLines = bulkKr.split("\n").map(l => l.trim()).filter(l => l);
    const mnLines = bulkMn.split("\n").map(l => l.trim()).filter(l => l);
    const max = Math.max(krLines.length, mnLines.length);
    const rows = [];
    for (let i = 0; i < max; i++) {
      rows.push({ kr: krLines[i] || "", mn: mnLines[i] || "" });
    }
    return rows;
  }, [bulkKr, bulkMn]);

  // Bulk дотор монгол хоосон мөрүүдийг AI-аар бөглөх
  const doBulkTranslate = async () => {
    const krLines = bulkKr.split("\n").map(l => l.trim()).filter(l => l);
    if (krLines.length === 0) { onToast && onToast("❌ Эхлээд солонгос үгс оруулна уу", "error"); return; }
    setBulkTranslating(true);
    try {
      const translations = [];
      for (const kr of krLines) {
        const mn = await translateKrToMn(kr);
        translations.push(mn || "");
      }
      setBulkMn(translations.join("\n"));
      onToast && onToast(`✅ ${translations.filter(t => t).length} үг орчуулагдлаа`, "success");
    } catch (e) { onToast && onToast("❌ AI алдаа: " + e.message, "error"); }
    setBulkTranslating(false);
  };

  const doBulkAdd = async () => {
    const validRows = bulkRows.filter(r => r.kr && r.mn);
    if (validRows.length === 0) {
      onToast && onToast("❌ Солонгос ба монгол үг хоёулаа байх ёстой", "error"); return;
    }
    // Давхар үг шалгах
    const existingWords = new Set(classVocabs.map(v => (v.word || "").trim().toLowerCase()));
    const duplicates = validRows.filter(r => existingWords.has(r.kr.trim().toLowerCase()));
    let rowsToAdd = validRows;
    if (duplicates.length > 0) {
      const dupList = duplicates.slice(0, 5).map(d => `• ${d.kr}`).join("\n");
      const more = duplicates.length > 5 ? `\n...болон ${duplicates.length - 5} өөр` : "";
      const choice = window.confirm(
        `⚠️ ${duplicates.length} үг энэ ангид аль хэдийн байна:\n\n${dupList}${more}\n\n` +
        `OK = Давхардсаныг алгасч, шинийг л нэмэх\n` +
        `Cancel = Болих`
      );
      if (!choice) return;
      // Давхардаагүйг л нэмнэ
      rowsToAdd = validRows.filter(r => !existingWords.has(r.kr.trim().toLowerCase()));
      if (rowsToAdd.length === 0) {
        onToast && onToast("⚠️ Бүх үг давхардсан тул нэмэх үг алга", "warning"); return;
      }
    }
    setBulkSaving(true);
    try {
      const inserts = rowsToAdd.map((r, i) => ({
        id: `v${Date.now()}${i}${Math.random().toString(36).slice(2, 5)}`,
        class_id: cls.id,
        word: r.kr, meaning: r.mn,
        type: vocabType, date: vocabDate,
        category: vocabCategory.trim() || null,
      }));
      for (const item of inserts) await supaInsert("vocab_entries", item);
      onToast && onToast(`✅ ${rowsToAdd.length} ${vocabType === "grammar" ? "дүрэм" : "үг"} нэмэгдлээ!`, "success");
      setBulkKr(""); setBulkMn("");
      setShowBulkPaste(false);
      refreshAll && refreshAll();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setBulkSaving(false);
  };

  const sessions = getSessions(cls.days, attMonth);
  // Sort students by attendance %
  const sortedStudents = [...students].map(s => {
    const pres = sessions.filter(item => (s.attendance || {})[item.date]).length;
    const pct = sessions.length > 0 ? Math.round(pres / sessions.length * 100) : 0;
    return { s, pres, pct };
  }).sort((a, b) => b.pct - a.pct);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9ff", fontFamily: "system-ui", padding: 14, paddingBottom: 30 }}>
      <style>{ANIMATIONS}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={goBack} style={btn("#fff", "#555", "#e0e0e0")}>←</button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: cls.color, display: "inline-block" }} />
              {cls.name}
            </div>
            <div style={{ fontSize: 11, color: "#888" }}>🕐 {cls.time} · 👥 {students.length} сурагч</div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={() => setShowBulkAtt(true)} style={{ ...btn("#43a047", "#fff"), boxShadow: "0 3px 0 #2e7d32" }}>✅ Ирц</button>
          <button onClick={() => setShowCreateHw(true)} style={{ ...btn("#7c3aed", "#fff"), boxShadow: "0 3px 0 #5b21b6" }}>📝 Даалгавар</button>
          <button onClick={() => setShowHwList(true)} style={{ ...btn("#fff", "#7c3aed", "#d4b8ff"), position: "relative" }}>
            📋
            {classHws.length > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#e53935", color: "#fff", borderRadius: 8, padding: "1px 5px", fontSize: 9, fontWeight: 800 }}>{classHws.length}</span>}
          </button>
          <button onClick={() => activeExam ? setSelExam(activeExam) : setShowCreateExam(true)}
            style={{ ...btn(activeExam ? "#43a047" : "#ff9800", "#fff"), boxShadow: activeExam ? "0 3px 0 #2e7d32" : "0 3px 0 #ef6c00" }}>
            🏆 {activeExam ? "Идэвхтэй" : "Шалгалт"}
          </button>
          <button onClick={() => setShowVocab(v => !v)} style={btn("#fff3cd", "#b8860b", "#f9a825")}>{showVocab ? "✕" : "📚"}</button>
          <button onClick={() => setShowVocabList(true)} style={btn("#e1f5fe", "#0288d1", "#81d4fa")}>📋 Жагсаалт</button>
          <button onClick={() => setShowAddSt(true)} style={btn(cls.color, "#fff")}>+ Сурагч</button>
          {isAdmin && <button onClick={() => setShowEditCls(true)} style={btn("#f0f4ff", "#1976d2", "#90caf9")}>⚙️</button>}
          {isSuperAdmin && <button onClick={() => setConfirmDelCls(true)} style={btn("#fff0f0", "#e53935", "#ffcdd2")}>🗑️</button>}
        </div>
      )}

      {/* Vocab панель (нэмэх, харах) */}
      {showVocab && isAdmin && (
        <div className="k-fade" style={{ background: "#fffdf5", borderRadius: 14, padding: 12, marginBottom: 14, border: "2px solid #ffe082" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#b8860b" }}>📚 Үг/Дүрэм нэмэх</div>
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => setShowBulkPaste(true)} style={{ ...btn("#7c3aed", "#fff"), boxShadow: "0 2px 0 #5b21b6" }}>📋 Бөөнөөр</button>
              <button onClick={() => setShowVocab(false)} style={btn("#fff", "#888", "#e0e0e0")}>✕</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input type="date" value={vocabDate} onChange={e => setVocabDate(e.target.value)} style={{ ...INP, flex: 1, fontSize: 12, padding: "8px 10px" }} />
            <select value={vocabType} onChange={e => setVocabType(e.target.value)} style={{ ...INP, width: 100, fontSize: 12, padding: "8px 10px", cursor: "pointer" }}>
              <option value="vocab">📚 Үг</option>
              <option value="grammar">📖 Дүрэм</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <input value={vocabWord} onChange={e => setVocabWord(e.target.value)} placeholder="한국어"
              style={{ ...INP, flex: 2, fontSize: 14, padding: "8px 10px", fontWeight: 600, minWidth: 100 }} />
            <button onClick={doTranslate} disabled={translating || !vocabWord.trim()}
              title="AI-аар орчуулах"
              style={{ ...btn("#42a5f5", "#fff"), padding: "8px 10px", opacity: (translating || !vocabWord.trim()) ? .5 : 1 }}>
              {translating ? "⏳" : "✨"}
            </button>
            <input value={vocabMean} onChange={e => setVocabMean(e.target.value)} placeholder="Монгол утга"
              onKeyDown={e => e.key === "Enter" && addVocab()}
              style={{ ...INP, flex: 2, fontSize: 13, padding: "8px 10px", minWidth: 100 }} />
            <button onClick={addVocab} style={{ ...btn("#7c3aed", "#fff"), boxShadow: "0 3px 0 #5b21b6" }}>+ Нэмэх</button>
          </div>

          {/* 🏷️ Сэдэв/категори (заавал биш) */}
          <div style={{ marginBottom: 8 }}>
            <input value={vocabCategory} onChange={e => setVocabCategory(e.target.value)}
              placeholder="🏷️ Сэдэв (заавал биш): Хичээлийн хэрэгсэл, Хоол, Гэр бүл..."
              list="vocab-categories"
              style={{ ...INP, fontSize: 12, padding: "8px 10px" }} />
            <datalist id="vocab-categories">
              {[...new Set(classVocabs.map(v => v.category).filter(Boolean))].map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {/* Сонгосон өдрийн үгс — checkbox-той + copy товч */}
          {(() => {
            const dayVocabs = classVocabs.filter(v => v.date === vocabDate);
            if (dayVocabs.length === 0) return null;
            const allSelected = dayVocabs.every(v => selectedVocabIds.has(v.id));
            const someSelected = selectedVocabIds.size > 0;
            return (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{vocabDate} өдрийн үгс ({dayVocabs.length})</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => {
                      if (allSelected) {
                        const ns = new Set(selectedVocabIds);
                        dayVocabs.forEach(v => ns.delete(v.id));
                        setSelectedVocabIds(ns);
                      } else {
                        const ns = new Set(selectedVocabIds);
                        dayVocabs.forEach(v => ns.add(v.id));
                        setSelectedVocabIds(ns);
                      }
                    }} style={{ ...btn("#fff", "#1976d2", "#90caf9"), padding: "4px 8px", fontSize: 11 }}>
                      {allSelected ? "✕ Бүгдийг" : "✓ Бүгдийг"}
                    </button>
                    {someSelected && (
                      <>
                        <button onClick={() => setShowCopyVocabs(true)} className="k-pop"
                          style={{ ...btn("#1976d2", "#fff"), padding: "4px 10px", fontSize: 11, boxShadow: "0 2px 0 #0d47a1" }}>
                          📋 {selectedVocabIds.size} хуулах
                        </button>
                        <button onClick={async () => {
                          if (!window.confirm(`${selectedVocabIds.size} үгийг устгахдаа итгэлтэй байна уу?\n\nЭнэ үйлдлийг буцаах боломжгүй!`)) return;
                          try {
                            const ids = [...selectedVocabIds];
                            for (const id of ids) await supaDelete("vocab_entries", id);
                            setSelectedVocabIds(new Set());
                            onToast && onToast(`✅ ${ids.length} үг устгагдлаа`, "success");
                            refreshAll && refreshAll();
                          } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
                        }} className="k-pop"
                          style={{ ...btn("#e53935", "#fff"), padding: "4px 10px", fontSize: 11, boxShadow: "0 2px 0 #b71c1c" }}>
                          🗑️ {selectedVocabIds.size} устгах
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {dayVocabs.map(v => {
                    const isSel = selectedVocabIds.has(v.id);
                    return (
                      <div key={v.id} onClick={() => {
                        const ns = new Set(selectedVocabIds);
                        if (isSel) ns.delete(v.id); else ns.add(v.id);
                        setSelectedVocabIds(ns);
                      }} className="k-press"
                        style={{
                          background: isSel ? "#e3f2fd" : "#fff",
                          border: isSel ? "1px solid #1976d2" : "1px solid #ffe082",
                          borderRadius: 8, padding: "6px 10px",
                          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                        }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, background: isSel ? "#1976d2" : "#fff", border: `2px solid ${isSel ? "#1976d2" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                          {isSel ? "✓" : ""}
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: v.type === "grammar" ? "#7c3aed" : "#b8860b" }}>
                            {v.type === "grammar" ? "📖" : "📚"} {v.word}
                          </span>
                          <span style={{ fontSize: 11, color: "#666", marginLeft: 8 }}>{v.meaning}</span>
                        </div>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`"${v.word}" устгах уу?`)) {
                            supaDelete("vocab_entries", v.id).then(() => {
                              refreshAll && refreshAll();
                            });
                          }
                        }} style={{ background: "transparent", border: "none", color: "#c62828", cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Шалгалтуудын жагсаалт */}
      {!activeExam && classExams.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 6 }}>🏆 Шалгалтууд</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {classExams.slice(0, 5).map(ex => (
              <button key={ex.id} onClick={() => setSelExam(ex)}
                style={{ background: ex.status === "finished" ? "#e3f2fd" : "#fff3cd", color: ex.status === "finished" ? "#1565c0" : "#b8860b", border: `1px solid ${ex.status === "finished" ? "#90caf9" : "#ffe082"}`, borderRadius: 9, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {ex.status === "finished" ? "🏁" : "⏳"} {ex.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Month picker */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 10, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Сар:</span>
        <input type="month" value={attMonth} onChange={e => setAttMonth(e.target.value)} style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid #e0e0e0", fontSize: 12, outline: "none" }} />
        <span style={{ fontSize: 11, color: "#aaa" }}>{sessions.length} оролт</span>
      </div>

      {/* СУРАГЧИЙН ИДЭВХ — Олон theme-тэй дөрвөлжин карт */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingLeft: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a2e" }}>🎓 Сурагчид</div>
          <div style={{ fontSize: 11, color: "#aaa" }}>{students.length} сурагч</div>
        </div>

        {sortedStudents.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 18, textAlign: "center", padding: "40px 20px", color: "#aaa", fontSize: 13 }}>
            <div style={{ fontSize: 40, opacity: .4, marginBottom: 8 }}>👥</div>
            Сурагч байхгүй байна
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
            {sortedStudents.map(({ s, pres, pct }, idx) => {
              const t2 = getTheme(s.theme_id);
              const due = (s.total_paid || 0) < (s.total_fee || 0);
              const isTop = idx < 3 && pct > 0;
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <div key={s.id} style={{
                  background: t2.card, borderRadius: 16, padding: 11,
                  border: `2px solid ${t2.border}`, position: "relative",
                  animation: `kSlideUp .3s ease ${idx * 0.04}s both`,
                }}>
                  {/* Хоцорсон төлбөрийн dot (зөвхөн сүпэр-админ) */}
                  {isSuperAdmin && due && (
                    <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#f44336" }} />
                  )}
                  {/* Delete button (зөвхөн admin) */}
                  {isAdmin && (
                    <div onClick={() => setConfirmDelSt(s)}
                      style={{ position: "absolute", top: 7, left: 7, width: 18, height: 18, borderRadius: "50%", background: "#ff000018", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 9, color: "#c62828", fontWeight: 700, opacity: .7 }}>✕</div>
                  )}
                  {/* Top-3 medal */}
                  {isTop && (
                    <div style={{ position: "absolute", top: 5, right: due && isSuperAdmin ? 22 : 7, fontSize: 16, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}>{medals[idx]}</div>
                  )}

                  <div onClick={() => onSelectStudent && onSelectStudent(s.id)} style={{ cursor: "pointer" }}>
                    {/* Том avatar */}
                    <div style={{
                      width: 56, height: 56, borderRadius: "50%", overflow: "hidden",
                      margin: "6px auto 8px",
                      border: `3px solid ${t2.accent}`, background: t2.soft,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    }}>
                      {s.photo_url ? <img src={s.photo_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : t2.emoji}
                    </div>
                    {/* Нэр */}
                    <div style={{ textAlign: "center", fontWeight: 800, fontSize: 12, color: t2.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                    {/* TOPIK түвшин */}
                    <div style={{ textAlign: "center", fontSize: 10, color: t2.accent, fontWeight: 700, marginBottom: 3 }}>{TOPIK[s.level || 0]}</div>
                    {/* XP */}
                    <div style={{ textAlign: "center", fontSize: 10, color: t2.text, opacity: .65, marginBottom: 6, fontWeight: 600 }}>⚡ {s.xp || 0} XP</div>
                  </div>

                  {/* Ирц dot grid */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 5, justifyContent: "center" }}>
                    {sessions.slice(0, 12).map(item => {
                      const ok = (s.attendance || {})[item.date] || false;
                      return <div key={item.date} title={item.date} style={{ width: 11, height: 11, borderRadius: 3, background: ok ? t2.accent : t2.soft, border: `1px solid ${ok ? t2.accent : t2.border}`, flexShrink: 0 }} />;
                    })}
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 4, background: t2.soft, borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "#43a047" : pct >= 60 ? "#fb8c00" : pct > 0 ? "#e53935" : t2.border, transition: "width .6s" }} />
                  </div>
                  <div style={{ textAlign: "center", fontSize: 9, color: t2.text, opacity: .55, fontWeight: 700 }}>
                    {pres}/{sessions.length} оролт · {pct}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODALS */}
      {showBulkAtt && (
        <BulkAttendance students={students} classDays={cls.days} setStudents={setStudents}
          onClose={() => setShowBulkAtt(false)} onToast={onToast} />
      )}
      {showCreateHw && (
        <CreateHomeworkModal cls={cls} vocabEntries={classVocabs} teacherId={teacherId}
          onClose={() => setShowCreateHw(false)} onCreated={() => refreshAll && refreshAll()} onToast={onToast} />
      )}
      {showHwList && (
        <HomeworkListModal cls={cls} students={students} homeworks={homeworks || []} submissions={homeworkSubs || []}
          isSuperAdmin={isSuperAdmin} currentTeacherId={teacherId} teachers={teachers}
          onClose={() => setShowHwList(false)} onRefresh={() => refreshAll && refreshAll()} onToast={onToast} />
      )}
      {showCreateExam && (
        <CreateExamModal cls={cls} vocabEntries={classVocabs} teacherId={teacherId}
          onClose={() => setShowCreateExam(false)} onCreated={(ex) => { refreshAll && refreshAll(); setSelExam(ex); }} onToast={onToast} />
      )}
      {selExam && (
        <ExamRoomModal exam={(exams || []).find(e => e.id === selExam.id) || selExam}
          cls={cls} students={students} examSubmissions={examSubs || []}
          isOwner={selExam.teacher_id === teacherId || isSuperAdmin}
          onClose={() => setSelExam(null)} onRefresh={() => refreshAll && refreshAll()} onToast={onToast} />
      )}

      {/* Add student modal */}
      {showAddSt && (
        <Overlay onClose={() => setShowAddSt(false)}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>👤 Сурагч нэмэх</div>
          <input placeholder="Овог нэр" value={ns.name} onChange={e => setNs({ ...ns, name: e.target.value })} style={{ ...INP, marginBottom: 8 }} />
          <input placeholder="Утас" value={ns.phone} onChange={e => setNs({ ...ns, phone: e.target.value })} style={{ ...INP, marginBottom: 8 }} />
          <input placeholder="И-мэйл" value={ns.email} onChange={e => setNs({ ...ns, email: e.target.value })} style={{ ...INP, marginBottom: 8 }} />
          <input type="password" placeholder="Нууц үг (6+)" value={ns.password} onChange={e => setNs({ ...ns, password: e.target.value })} style={{ ...INP, marginBottom: 8 }} />
          <select value={ns.level} onChange={e => setNs({ ...ns, level: +e.target.value })} style={{ ...INP, marginBottom: 14, cursor: "pointer" }}>
            {TOPIK.map((t, i) => <option key={i} value={i}>{t}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowAddSt(false)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
            <button onClick={addStudent} style={{ ...btn("#7c3aed", "#fff"), flex: 2, justifyContent: "center" }}>+ Нэмэх</button>
          </div>
        </Overlay>
      )}

      {/* Confirm delete student */}
      {confirmDelSt && (
        <Overlay onClose={() => setConfirmDelSt(null)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Сурагч устгах уу?</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 18 }}>
              <b>{confirmDelSt.name}</b>-ийн бүх мэдээлэл алга болно
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelSt(null)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
              <button onClick={() => deleteStudent(confirmDelSt.id)} style={{ ...btn("#e53935", "#fff"), flex: 1, justifyContent: "center" }}>🗑️ Устгах</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Confirm delete class */}
      {confirmDelCls && (
        <Overlay onClose={() => setConfirmDelCls(false)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🚨</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Анги устгах уу?</div>
            <div style={{ fontSize: 13, color: "#c62828", marginBottom: 18, fontWeight: 700 }}>
              "{cls.name}" болон {students.length} сурагч, {classVocabs.length} үг бүгд алга болно!
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelCls(false)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
              <button onClick={deleteClass} style={{ ...btn("#e53935", "#fff"), flex: 1, justifyContent: "center" }}>🗑️ Тийм, устга</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Edit Class Settings */}
      {showEditCls && (
        <EditClassModal cls={cls} teachers={teachers} isSuperAdmin={isSuperAdmin}
          onClose={() => setShowEditCls(false)} onSaved={(updated) => {
          setClasses && setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, ...updated } : c));
          refreshAll && refreshAll();
          onToast && onToast("✅ Анги шинэчлэгдлээ", "success");
        }} onToast={onToast} />
      )}

      {/* Copy Vocabs to other class */}
      {showCopyVocabs && (
        <CopyVocabsModal sourceClass={cls} vocabsToCopy={classVocabs.filter(v => selectedVocabIds.has(v.id))}
          allClasses={[]} onClose={() => { setShowCopyVocabs(false); setSelectedVocabIds(new Set()); }}
          onCopied={() => { refreshAll && refreshAll(); setSelectedVocabIds(new Set()); }} onToast={onToast} />
      )}

      {/* Бүх үгсийг харах + хэвлэх */}
      {showVocabList && (
        <Overlay onClose={() => setShowVocabList(false)} maxW={520}>
          <VocabListView vocabEntries={classVocabs} t={{ accent: cls.color, text: "#1a1a2e", soft: cls.color + "22", card: "#fff", border: cls.color + "55" }}
            className={cls.name} weakWords={[]} />
        </Overlay>
      )}

      {/* 📋 BULK PASTE — Бөөнөөр үг нэмэх */}
      {showBulkPaste && (
        <Overlay onClose={() => setShowBulkPaste(false)} maxW={560}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>📋</span>
            Бөөнөөр үг нэмэх
          </div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 14, lineHeight: 1.5, background: "#f0f4ff", padding: 10, borderRadius: 10 }}>
            💡 <b>Хэрхэн ашиглах:</b><br />
            1. Gemini-аас солонгос үгсээ хуулж зүүн талд тавь<br />
            2. <b>✨ AI орчуулах</b> дарвал монгол утга автомат бөглөгдөнө<br />
            3. Эсвэл монгол утгаа баруун талд гар аргаар тавь<br />
            4. <b>Бүгдийг нэмэх</b> дарна
          </div>

          {/* Огноо + төрөл */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input type="date" value={vocabDate} onChange={e => setVocabDate(e.target.value)} style={{ ...INP, flex: 1, fontSize: 12 }} />
            <select value={vocabType} onChange={e => setVocabType(e.target.value)} style={{ ...INP, width: 110, fontSize: 12, cursor: "pointer" }}>
              <option value="vocab">📚 Үг</option>
              <option value="grammar">📖 Дүрэм</option>
            </select>
          </div>
          {/* Категори (бүх нэмэх үгэнд хамаарна) */}
          <div style={{ marginBottom: 10 }}>
            <input value={vocabCategory} onChange={e => setVocabCategory(e.target.value)}
              placeholder="🏷️ Сэдэв (заавал биш): Хичээлийн хэрэгсэл, Хоол..."
              list="vocab-categories-bulk"
              style={{ ...INP, fontSize: 12 }} />
            <datalist id="vocab-categories-bulk">
              {[...new Set(classVocabs.map(v => v.category).filter(Boolean))].map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {/* 2 textarea зэрэгцээ */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 4 }}>🇰🇷 СОЛОНГОС (мөр бүрд 1 үг)</div>
              <textarea value={bulkKr} onChange={e => setBulkKr(e.target.value)}
                placeholder={"사과\n학교\n선생님\n..."}
                rows={10}
                style={{ ...INP, fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#b8860b", marginBottom: 4 }}>🇲🇳 МОНГОЛ (мөр бүрд 1 утга)</div>
              <textarea value={bulkMn} onChange={e => setBulkMn(e.target.value)}
                placeholder={"алим\nсургууль\nбагш\n..."}
                rows={10}
                style={{ ...INP, fontSize: 13, fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 }} />
            </div>
          </div>

          {/* AI орчуулах товч */}
          <button onClick={doBulkTranslate} disabled={bulkTranslating || !bulkKr.trim()}
            style={{ width: "100%", ...btn("#42a5f5", "#fff"), justifyContent: "center", marginBottom: 10, padding: 10, opacity: (bulkTranslating || !bulkKr.trim()) ? .5 : 1 }}>
            {bulkTranslating ? "⏳ Орчуулж байна..." : "✨ AI-аар монгол руу орчуулах"}
          </button>

          {/* Preview хүснэгт */}
          {bulkRows.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>
                👀 Урьдчилан харах ({bulkRows.filter(r => r.kr && r.mn).length}/{bulkRows.length} бэлэн)
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid #e0e0e0", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f5f0ff" }}>
                    <tr>
                      <th style={{ padding: "6px 8px", textAlign: "left", width: 30 }}>#</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>🇰🇷 Солонгос</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>🇲🇳 Монгол</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #f0f0f0", background: (!r.kr || !r.mn) ? "#fff5f5" : "#fff" }}>
                        <td style={{ padding: "5px 8px", color: "#aaa" }}>{i + 1}</td>
                        <td style={{ padding: "5px 8px", fontWeight: 700, color: r.kr ? "#1a1a2e" : "#f44336" }}>
                          {r.kr || "⚠️ хоосон"}
                        </td>
                        <td style={{ padding: "5px 8px", color: r.mn ? "#555" : "#f44336" }}>
                          {r.mn || "⚠️ хоосон"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowBulkPaste(false)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
            <button onClick={doBulkAdd} disabled={bulkSaving || bulkRows.filter(r => r.kr && r.mn).length === 0}
              style={{ ...btn("#7c3aed", "#fff"), flex: 2, justifyContent: "center", boxShadow: "0 3px 0 #5b21b6", opacity: (bulkSaving || bulkRows.filter(r => r.kr && r.mn).length === 0) ? .5 : 1 }}>
              {bulkSaving ? "⏳ Хадгалж байна..." : `➕ ${bulkRows.filter(r => r.kr && r.mn).length} үг нэмэх`}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 11 — StudentView (Сурагчийн дэлгэц — Image 1 шиг Habit Tracker)
// ════════════════════════════════════════════════════════════════════

function StudentView({ s, setStudents, goBack, attMonth, setAttMonth, classDays, classStartDate, vocabEntries, classmates, classColor,
  homeworks, homeworkSubs, exams, examSubs, refreshAll, onToast }) {
  const [view, setView] = useState("home"); // home | card | daily | vocab | leaderboard
  const [showPractice, setShowPractice] = useState(false);
  const [activeHw, setActiveHw] = useState(null);
  const [hwPhotoModal, setHwPhotoModal] = useState(null); // даалгаврын зураг илгээх {hw}
  const [hwPhoto, setHwPhoto] = useState("");
  const [hwPhotoSaving, setHwPhotoSaving] = useState(false);
  const [activeExam, setActiveExam] = useState(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(s.photo_url || "");
  const [photoSaving, setPhotoSaving] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(s.teacher_notes || "");
  const [hwTab, setHwTab] = useState("pending"); // pending | done | overdue

  const t = getTheme(s.theme_id);
  const sessions = getSessions(classDays, attMonth);
  const present = sessions.filter(item => (s.attendance || {})[item.date]).length;

  // Update student field
  const upd = async (updates) => {
    try {
      await supaUpdate("students", s.id, updates);
      setStudents(prev => prev.map(x => x.id === s.id ? { ...x, ...updates } : x));
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  const toggleAtt = async (date) => {
    const att = { ...(s.attendance || {}) };
    if (att[date]) delete att[date]; else att[date] = true;
    await upd({ attendance: att });
  };

  // Homework data
  const myHws = (homeworks || []).filter(h => h.class_id === s.class_id).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const mySubs = (homeworkSubs || []).filter(hs => hs.student_id === s.id);
  const subMap = Object.fromEntries(mySubs.map(sub => [sub.homework_id, sub]));
  const pendingHws = myHws.filter(h => !subMap[h.id] && new Date(h.due_date) > new Date());
  const completedHws = myHws.filter(h => subMap[h.id]);
  const overdueHws = myHws.filter(h => !subMap[h.id] && new Date(h.due_date) <= new Date());

  // Exam history
  const myExamSubs = (examSubs || []).filter(es => es.student_id === s.id).sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""));

  // Active exam check
  const myActiveExam = (exams || []).find(e => e.class_id === s.class_id && e.status === "active"
    && !(examSubs || []).find(es => es.exam_id === e.id && es.student_id === s.id));

  // === ACTIVE EXAM SCREEN ===
  if (activeExam) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: t.bg, overflowY: "auto" }}>
        <style>{ANIMATIONS}</style>
        <StudentExamScreen exam={activeExam} vocabEntries={vocabEntries} student={s} t={t}
          previousSubmissions={examSubs || []}
          onComplete={({ score, xpEarned }) => {
            setStudents(prev => prev.map(x => x.id === s.id ? { ...x, xp: (x.xp || 0) + xpEarned } : x));
            refreshAll && refreshAll();
          }}
          onClose={() => setActiveExam(null)} />
      </div>
    );
  }

  // === HOMEWORK PRACTICE SCREEN ===
  if (activeHw) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: t.bg, overflowY: "auto" }}>
        <style>{ANIMATIONS}</style>
        <PracticeStudio
          vocabs={activeHw.vocabs.filter(v => v.type !== "grammar")}
          grammars={activeHw.vocabs.filter(v => v.type === "grammar")}
          t={t} level={s.level || 0} title={`📝 ${activeHw.hw.title}`}
          onClose={() => setActiveHw(null)}
          onComplete={async ({ score }) => {
            try {
              const subId = `hsub${Date.now()}_${s.id}`;
              await supaInsert("homework_submissions", {
                id: subId, homework_id: activeHw.hw.id, student_id: s.id,
                score: Math.round(score), on_time: new Date(activeHw.hw.due_date) >= new Date(),
              });
              const xpAdd = activeHw.hw.xp_reward || 30;
              const newXp = (s.xp || 0) + xpAdd;
              await supaUpdate("students", s.id, { xp: newXp });
              setStudents(prev => prev.map(x => x.id === s.id ? { ...x, xp: newXp } : x));
              refreshAll && refreshAll();
              onToast && onToast(`✅ Даалгавар хийгдсэн! +${xpAdd} XP`, "success");
              // Зураг илгээх санал — даалгаврын хариу болгож
              const hwRef = activeHw.hw;
              setActiveHw(null);
              setHwPhotoModal({ hw: hwRef, subId });
              setHwPhoto("");
            } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
          }} />
      </div>
    );
  }

  // === FREE PRACTICE SCREEN ===
  if (showPractice) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: t.bg, overflowY: "auto" }}>
        <style>{ANIMATIONS}</style>
        <PracticeStudio
          vocabs={vocabEntries.filter(v => v.type !== "grammar")}
          grammars={vocabEntries.filter(v => v.type === "grammar")}
          t={t} level={s.level || 0} title="🌸 Хэлээ бэлдэх"
          onClose={() => setShowPractice(false)}
          onComplete={async ({ correct, missedWords = [], validSeconds = 0 }) => {
            // Алдсан үгсийг weak_words-д нэмэх
            const existing = s.weak_words || [];
            const existingMap = {};
            existing.forEach(w => {
              const word = typeof w === "string" ? w : w.word;
              existingMap[word] = typeof w === "string" ? { word, miss_count: 1 } : { ...w };
            });
            missedWords.forEach(w => {
              if (existingMap[w]) existingMap[w].miss_count = (existingMap[w].miss_count || 0) + 1;
              else existingMap[w] = { word: w, miss_count: 1 };
            });
            const newWeakWords = Object.values(existingMap);

            // ⚡ XP ЛОГИК — шударга, хуурахаас хамгаалсан:
            // 1) validSeconds = зөвхөн ХҮЧИНТЭЙ (асуулт хооронд 5-60 сек) зарцуулсан хугацаа
            //    → хурдан click хийж XP авах боломжгүй
            // 2) 2 минут тутамд +1 XP (бодит бэлдсэн хугацаагаар)
            // 3) Өдөрт дээд тал нь 30 XP (нэг хүн давамгайлахаас сэргийлнэ)
            const validMinutes = Math.floor(validSeconds / 60);
            let xpAdd = Math.floor(validMinutes / 2); // 2 минут тутамд 1 XP

            // Өдрийн XP хязгаар шалгах
            const today = TODAY;
            const xpToday = (s.xp_today_date === today) ? (s.xp_today || 0) : 0;
            const DAILY_LIMIT = 30; // бэлдэх дасгалаас өдөрт дээд тал нь 30 XP
            const remaining = Math.max(0, DAILY_LIMIT - xpToday);
            xpAdd = Math.min(xpAdd, remaining);

            try {
              const updates = { weak_words: newWeakWords };
              if (xpAdd > 0) {
                updates.xp = (s.xp || 0) + xpAdd;
                updates.xp_today = xpToday + xpAdd;
                updates.xp_today_date = today;
              }
              await supaUpdate("students", s.id, updates);
              setStudents(prev => prev.map(x => x.id === s.id ? { ...x, ...updates } : x));
              if (xpAdd > 0) {
                onToast && onToast(`🌟 ${validMinutes} минут чанартай бэлдсэн! +${xpAdd} XP`, "success");
              } else if (validMinutes < 2) {
                onToast && onToast(`💡 Удаан бэлдвэл XP авна (одоо ${validMinutes} мин)`, "info");
              } else {
                onToast && onToast(`✅ Өнөөдрийн XP дээд хязгаарт хүрсэн (${DAILY_LIMIT})`, "info");
              }
            } catch (e) {}
          }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "system-ui", padding: 14, paddingBottom: 30 }}>
      <style>{ANIMATIONS}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={() => {
          if (window.confirm("Системээс гарах уу?")) goBack();
        }} style={btn("#fff", t.text, t.border)}>← Гарах</button>
        <div style={{ fontWeight: 800, fontSize: 14, color: t.accent }}>🌸 Кандун</div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => { setPhotoUrl(s.photo_url || ""); setShowPhotoUpload(true); }} style={btn(t.soft, t.accent)} title="Профайл зураг">📷</button>
          <button onClick={() => setShowThemePicker(true)} style={btn(t.soft, t.accent)} title="Theme солих">🎨</button>
          <button onClick={() => setShowChangePw(true)} style={btn(t.soft, t.accent)} title="Нууц үг солих">🔑</button>
        </div>
      </div>

      {/* ── ИДЭВХТЭЙ ШАЛГАЛТЫН POPUP ── */}
      {myActiveExam && view === "home" && (
        <div className="k-pop k-pulse" style={{
          background: "linear-gradient(135deg,#ff5722,#e64a19)", color: "#fff",
          borderRadius: 18, padding: 18, marginBottom: 14,
          boxShadow: "0 8px 24px rgba(229,57,53,0.35)", border: "3px solid #fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div className="k-bounce" style={{ fontSize: 36 }}>🏆</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: .9, letterSpacing: 1 }}>ИДЭВХТЭЙ ШАЛГАЛТ</div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{myActiveExam.title}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: .95, marginBottom: 10 }}>
            ⏱️ {myActiveExam.duration_minutes} минут · {myActiveExam.question_count} асуулт
          </div>
          <button onClick={() => setActiveExam(myActiveExam)}
            style={{ width: "100%", background: "#fff", color: "#e64a19", border: "none", borderRadius: 12, padding: 12, fontWeight: 900, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>
            🚀 ШАЛГАЛТ ӨГӨХ
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* HOME VIEW — Image 1 шиг Habit Tracker маягийн pastel картууд */}
      {/* ═══════════════════════════════════════════════════ */}
      {view === "home" && (
        <div className="k-fade">
          {/* Hero — нэр, XP, ирц progress */}
          <div style={{
            background: `linear-gradient(135deg,${t.accent}22,${t.accent}11)`,
            borderRadius: 22, padding: "18px 18px 14px", marginBottom: 16,
            border: `2px solid ${t.accent}33`, position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -20, right: -20, fontSize: 120, opacity: .1 }}>🌸</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="k-bounce" style={{ width: 56, height: 56, borderRadius: 18, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", flexShrink: 0 }}>
                {s.photo_url ? <img src={s.photo_url} style={{ width: "100%", height: "100%", borderRadius: 18, objectFit: "cover" }} alt="" /> : t.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 2 }}>Сайн уу! 👋</div>
                <div style={{ fontWeight: 800, fontSize: 17, color: t.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: t.text, opacity: .65, fontWeight: 600 }}>{TOPIK[s.level || 0]}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: t.accent }}>⚡{s.xp || 0}</div>
                <div style={{ fontSize: 9, color: t.text, opacity: .6, fontWeight: 600 }}>XP оноо</div>
              </div>
            </div>
            {sessions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: t.text, opacity: .75, fontWeight: 600, marginBottom: 4 }}>
                  <span>📅 Энэ сарын ирц</span>
                  <span>{sessions.length} оролтоос {present}-нд оролцсон</span>
                </div>
                <div style={{ height: 8, background: "#fff", borderRadius: 4, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }}>
                  <div style={{ height: "100%", width: `${sessions.length > 0 ? (present / sessions.length) * 100 : 0}%`, background: `linear-gradient(90deg,${t.accent},${t.accent}cc)`, transition: "width .6s" }} />
                </div>
              </div>
            )}
          </div>

          {/* Habit Tracker маягийн pastel menu картууд */}
          <div style={{ fontWeight: 700, fontSize: 13, color: t.text, marginBottom: 10, marginLeft: 4, opacity: .7, letterSpacing: .5 }}>
            ✨ ӨНӨӨДӨР ЮУ ХИЙХ ВЭ?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(() => {
              const vocabCount = vocabEntries.filter(v => v.type !== "grammar").length;
              const grammarCount = vocabEntries.filter(v => v.type === "grammar").length;
              const vocabSummary = `${vocabCount} үг · ${grammarCount} дүрэм`;
              return [
              {
                id: "practice", emoji: "🎓", title: "Солонгос хэлээ бэлдэх",
                sub: vocabSummary, bg: "#e3f2fd", color: "#42a5f5",
                action: () => setShowPractice(true),
              },
              {
                id: "homework", emoji: "📝", title: "Гэрийн даалгавар",
                sub: pendingHws.length > 0 ? `${pendingHws.length} хийх ёстой` : `${myHws.length} нийт`,
                bg: "#f3e5f5", color: "#ab47bc", badge: pendingHws.length > 0 ? pendingHws.length : null,
                action: () => setView("homework"),
              },
              {
                id: "exam", emoji: "🏆", title: "Шалгалт",
                sub: myActiveExam ? "Идэвхтэй шалгалт байна!" : "Багш эхлүүлэхийг хүлээх",
                bg: "#fbe9e7", color: "#ff7043", badge: myActiveExam ? "!" : null,
                action: () => myActiveExam ? setActiveExam(myActiveExam) : onToast && onToast("Одоогоор идэвхтэй шалгалт байхгүй", "info"),
              },
              {
                id: "card", emoji: "📋", title: "Сурагчийн карт",
                sub: `Ирц, XP, мэдээлэл`, bg: "#e8f5e9", color: "#66bb6a",
                action: () => setView("card"),
              },
              {
                id: "daily", emoji: "📅", title: "Календарь",
                sub: "Өдрийн үг, дүрэм харах", bg: "#fce4ec", color: "#ec407a",
                action: () => setView("daily"),
              },
              {
                id: "vocablist", emoji: "📋", title: "Шинэ үгсийн жагсаалт",
                sub: vocabSummary, bg: "#e1f5fe", color: "#0288d1",
                action: () => setView("vocablist"),
              },
              {
                id: "examhistory", emoji: "📊", title: "Шалгалтын түүх",
                sub: `${myExamSubs.length} удаа өгсөн`, bg: "#f3e5f5", color: "#7c3aed",
                action: () => setView("examhistory"),
              },
              {
                id: "leaderboard", emoji: "🏆", title: "Жагсаалт",
                sub: `Ангийн ${classmates.length} сурагч`, bg: "#fff8e1", color: "#ffca28",
                action: () => setView("leaderboard"),
              },
            ];
            })().map((item, idx) => (
              <div key={item.id} onClick={item.action} className="k-press"
                style={{
                  background: item.bg, borderRadius: 18, padding: "14px 16px",
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  animation: `kSlideUp .35s ease ${idx * 0.05}s both`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  position: "relative",
                }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                  {item.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e", marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>{item.sub}</div>
                </div>
                {item.badge && (
                  <div className="k-pop" style={{
                    background: "#e53935", color: "#fff", minWidth: 24, height: 24, borderRadius: 12,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, padding: "0 8px",
                    boxShadow: "0 2px 6px rgba(229,57,53,0.4)",
                  }}>{item.badge}</div>
                )}
                <div style={{ fontSize: 18, color: item.color, opacity: .5, flexShrink: 0, fontWeight: 800 }}>→</div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: t.text, opacity: .5 }}>
            🌸 화이팅! Чадна, өдөр болгон хичээх 🌸
          </div>
        </div>
      )}

      {/* ── Бусад view-нууд (back товчтой) ── */}
      {view !== "home" && (
        <button onClick={() => setView("home")} style={{ ...btn(t.soft, t.accent), marginBottom: 14 }}>← Нүүр хуудас</button>
      )}

      {view === "card" && (
        <CardContent s={s} t={t} isAdmin={false} isSuperAdmin={false} upd={upd}
          attMonth={attMonth} setAttMonth={setAttMonth} classDays={classDays}
          vocabEntries={vocabEntries} sessions={sessions} present={present}
          onToggleAtt={() => {}} setShowPay={null}
          editNotes={false} setEditNotes={() => {}} notes={notes} setNotes={setNotes}
          homeworks={homeworks} homeworkSubs={homeworkSubs} exams={exams} examSubs={examSubs} />
      )}

      {view === "daily" && <DailyCalendarTab vocabEntries={vocabEntries} t={t} classDays={classDays} classStartDate={classStartDate} classColor={classColor} />}
      {view === "vocab" && <VocabTab vocabEntries={vocabEntries} t={t} />}
      {view === "vocablist" && <VocabListView vocabEntries={vocabEntries} t={t} className={s.name + "-ийн анги"} weakWords={s.weak_words || []} />}
      {view === "leaderboard" && (
        <div className="k-fade" style={{ background: t.card, borderRadius: 18, padding: 16, border: `2px solid ${t.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginBottom: 14, textAlign: "center" }}>🏆 Ангийн жагсаалт</div>
          <Leaderboard students={classmates} myId={s.id} classColor={classColor || t.accent} />
        </div>
      )}

      {/* 📊 ШАЛГАЛТЫН ТҮҮХ + КАЛЕНДАРЬ */}
      {view === "examhistory" && (() => {
        const avgScore = myExamSubs.length > 0 ? Math.round(myExamSubs.reduce((a, b) => a + (b.score || 0), 0) / myExamSubs.length) : 0;
        const bestScore = myExamSubs.length > 0 ? Math.max(...myExamSubs.map(es => es.score || 0)) : 0;
        const totalXp = myExamSubs.reduce((a, b) => a + (b.xp_earned || 0), 0);

        // Календарь — сүүлийн 30 өдөр
        const today = new Date();
        const days = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          const subsThisDay = myExamSubs.filter(es => (es.submitted_at || "").slice(0, 10) === dateStr);
          days.push({ date: dateStr, day: d.getDate(), subs: subsThisDay });
        }

        return (
          <div className="k-fade">
            {/* Статистик */}
            <div style={{ background: t.card, borderRadius: 18, padding: 16, border: `2px solid ${t.border}`, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 12, textAlign: "center" }}>📊 Шалгалтын статистик</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                <div style={{ background: t.soft, borderRadius: 10, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: t.text, opacity: .7, fontWeight: 700 }}>НИЙТ</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: t.accent }}>{myExamSubs.length}</div>
                </div>
                <div style={{ background: t.soft, borderRadius: 10, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: t.text, opacity: .7, fontWeight: 700 }}>ДУНДАЖ</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: avgScore >= 70 ? "#43a047" : "#f57c00" }}>{avgScore}</div>
                </div>
                <div style={{ background: t.soft, borderRadius: 10, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: t.text, opacity: .7, fontWeight: 700 }}>МАХ</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#43a047" }}>{bestScore}</div>
                </div>
                <div style={{ background: t.soft, borderRadius: 10, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: t.text, opacity: .7, fontWeight: 700 }}>XP</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed" }}>+{totalXp}</div>
                </div>
              </div>
            </div>

            {/* Календарь - 30 өдөр */}
            <div style={{ background: t.card, borderRadius: 18, padding: 16, border: `2px solid ${t.border}`, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 10 }}>📅 Сүүлийн 30 өдөр</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {days.map(d => {
                  const has = d.subs.length > 0;
                  const bestOfDay = has ? Math.max(...d.subs.map(s => s.score || 0)) : 0;
                  return (
                    <div key={d.date} title={`${d.date}: ${has ? `${d.subs.length} шалгалт, ${bestOfDay}%` : "Шалгалт өгөөгүй"}`}
                      style={{
                        aspectRatio: 1, borderRadius: 6, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                        background: has ? (bestOfDay >= 80 ? "#43a047" : bestOfDay >= 60 ? "#ffa726" : "#ef5350") : t.soft,
                        color: has ? "#fff" : t.text + "55",
                      }}>{d.day}</div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 9, color: t.text, opacity: .6, justifyContent: "center" }}>
                <span>🟢 80+</span> <span>🟠 60-79</span> <span>🔴 0-59</span>
              </div>
            </div>

            {/* Бүх шалгалтын жагсаалт */}
            <div style={{ background: t.card, borderRadius: 18, padding: 16, border: `2px solid ${t.border}` }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 10 }}>📝 Бүх шалгалт ({myExamSubs.length})</div>
              {myExamSubs.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: t.text, opacity: .5 }}>
                  <div style={{ fontSize: 40, marginBottom: 6 }}>📭</div>
                  <div style={{ fontSize: 12 }}>Одоохондоо шалгалт өгөөгүй</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {myExamSubs.map((es, i) => {
                    const exam = (exams || []).find(e => e.id === es.exam_id);
                    const prev = myExamSubs[i + 1]; // Дараагийн (= өмнөх удаа)
                    const change = prev ? (es.score || 0) - (prev.score || 0) : null;
                    return (
                      <div key={es.id} style={{ background: t.soft, borderRadius: 10, padding: 10, fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: t.text, marginBottom: 2 }}>
                              {exam?.title || "(устгагдсан)"}
                            </div>
                            <div style={{ fontSize: 10, color: t.text, opacity: .6 }}>
                              📅 {(es.submitted_at || "").slice(0, 10) || "—"}
                              {change !== null && change !== 0 && (
                                <span style={{ marginLeft: 6, color: change > 0 ? "#43a047" : "#e53935", fontWeight: 700 }}>
                                  {change > 0 ? `▲ +${change}` : `▼ ${change}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{
                            background: (es.score || 0) >= 80 ? "#43a047" : (es.score || 0) >= 60 ? "#ffa726" : "#ef5350",
                            color: "#fff", padding: "6px 12px", borderRadius: 10, fontWeight: 900, fontSize: 14,
                          }}>{es.score}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* HOMEWORK VIEW */}
      {view === "homework" && (
        <div className="k-fade" style={{ background: t.card, borderRadius: 18, padding: 14, border: `2px solid ${t.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>📝 Гэрийн даалгавар</div>
            <div style={{ fontSize: 11, color: t.text, opacity: .6 }}>{myHws.length} нийт</div>
          </div>

          {myHws.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ fontSize: 48, opacity: .4, marginBottom: 8 }}>🌙</div>
              <div style={{ fontSize: 13, color: t.text, opacity: .6 }}>Даалгавар байхгүй</div>
            </div>
          ) : (
            <>
              {pendingHws.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: t.accent, marginBottom: 6 }}>🎯 ХҮЛЭЭГДЭЖ БУЙ ({pendingHws.length})</div>
                  {pendingHws.map(hw => (
                    <StudentHomeworkCard key={hw.id} hw={hw} vocabEntries={vocabEntries} t={t}
                      isCompleted={false} submission={null}
                      onStart={(h, vs) => setActiveHw({ hw: h, vocabs: vs })} />
                  ))}
                </div>
              )}
              {completedHws.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#43a047", marginBottom: 6 }}>✅ ХИЙСЭН ({completedHws.length})</div>
                  {completedHws.map(hw => (
                    <StudentHomeworkCard key={hw.id} hw={hw} vocabEntries={vocabEntries} t={t}
                      isCompleted={true} submission={subMap[hw.id]} onStart={() => {}} />
                  ))}
                </div>
              )}
              {overdueHws.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#c62828", marginBottom: 6 }}>❌ ХОЦОРСОН ({overdueHws.length})</div>
                  {overdueHws.map(hw => (
                    <StudentHomeworkCard key={hw.id} hw={hw} vocabEntries={vocabEntries} t={t}
                      isCompleted={false} submission={null} onStart={() => {}} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showChangePw && (
        <ChangePasswordModal studentId={s.id} onClose={() => setShowChangePw(false)} onToast={onToast} />
      )}

      {/* 📤 ДААЛГАВРЫН ХАРИУ ЗУРАГ ИЛГЭЭХ */}
      {hwPhotoModal && (
        <Overlay onClose={() => setHwPhotoModal(null)} maxW={420}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>📤</span> Даалгаврын зураг илгээх
          </div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 14, lineHeight: 1.5, background: t.soft, padding: 10, borderRadius: 10 }}>
            💡 Та даалгавраа дэвтэр дээрээ хийсэн бол зургаа дарж багшдаа илгээж болно. (Заавал биш)
          </div>

          {hwPhoto ? (
            <div style={{ position: "relative", marginBottom: 12 }}>
              <img src={hwPhoto} style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 10, border: `1px solid ${t.border}` }} alt="" />
              <button onClick={() => setHwPhoto("")}
                style={{ position: "absolute", top: 6, right: 6, background: "#e53935", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          ) : (
            <label style={{
              display: "block", padding: 14, borderRadius: 12, border: `2px dashed ${t.border}`,
              textAlign: "center", cursor: "pointer", background: t.soft, color: t.accent, fontWeight: 700, fontSize: 13, marginBottom: 12,
            }}>
              📷 Зураг сонгох (гар утас/компьютер)
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 3 * 1024 * 1024) { onToast && onToast("❌ Зураг 3MB-аас бага байх ёстой", "error"); return; }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      const maxSize = 800;
                      let { width, height } = img;
                      if (width > height) { if (width > maxSize) { height = height * maxSize / width; width = maxSize; } }
                      else { if (height > maxSize) { width = width * maxSize / height; height = maxSize; } }
                      canvas.width = width; canvas.height = height;
                      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                      setHwPhoto(canvas.toDataURL("image/jpeg", 0.7));
                    };
                    img.src = ev.target.result;
                  };
                  reader.readAsDataURL(file);
                }} />
            </label>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setHwPhotoModal(null)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>
              Алгасах
            </button>
            {hwPhoto && (
              <button onClick={async () => {
                setHwPhotoSaving(true);
                try {
                  // submission-д зураг нэмэх
                  await supaUpdate("homework_submissions", hwPhotoModal.subId, {
                    photo_url: hwPhoto, photo_submitted_at: new Date().toISOString(),
                  });
                  onToast && onToast("✅ Зураг багшид илгээгдлээ!", "success");
                  refreshAll && refreshAll();
                  setHwPhotoModal(null);
                } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
                setHwPhotoSaving(false);
              }} disabled={hwPhotoSaving}
                style={{ ...btn(t.accent, "#fff"), flex: 2, justifyContent: "center", boxShadow: `0 3px 0 ${t.border}`, opacity: hwPhotoSaving ? .5 : 1 }}>
                {hwPhotoSaving ? "⏳..." : "📤 Багшид илгээх"}
              </button>
            )}
          </div>
        </Overlay>
      )}

      {/* Профайл зураг солих */}
      {showPhotoUpload && (
        <Overlay onClose={() => setShowPhotoUpload(false)} maxW={400}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>📷</span>
            Профайл зураг
          </div>

          {/* Одоогийн зураг preview */}
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{
              width: 100, height: 100, borderRadius: "50%", margin: "0 auto",
              overflow: "hidden", border: `4px solid ${t.accent}`, background: t.soft,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44,
            }}>
              {photoUrl ? <img src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" onError={e => e.target.style.display = "none"} /> : t.emoji}
            </div>
          </div>

          {/* Файл сонгох */}
          <div style={{ marginBottom: 10 }}>
            <label style={{
              display: "block", padding: 12, borderRadius: 12, border: `2px dashed ${t.border}`,
              textAlign: "center", cursor: "pointer", background: t.soft, color: t.accent, fontWeight: 700, fontSize: 13,
            }}>
              📁 Зураг сонгох (Гар утаснаас)
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Хэмжээ шалгах — 1MB-аас бага байх
                  if (file.size > 2 * 1024 * 1024) {
                    onToast && onToast("❌ Зураг 2MB-аас бага байх ёстой", "error");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    // Зургийг багасгаж base64 болгох
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      const maxSize = 300;
                      let { width, height } = img;
                      if (width > height) {
                        if (width > maxSize) { height = height * maxSize / width; width = maxSize; }
                      } else {
                        if (height > maxSize) { width = width * maxSize / height; height = maxSize; }
                      }
                      canvas.width = width; canvas.height = height;
                      const ctx = canvas.getContext("2d");
                      ctx.drawImage(img, 0, 0, width, height);
                      const compressed = canvas.toDataURL("image/jpeg", 0.7);
                      setPhotoUrl(compressed);
                    };
                    img.src = ev.target.result;
                  };
                  reader.readAsDataURL(file);
                }} />
            </label>
          </div>

          <div style={{ fontSize: 10, color: "#888", marginBottom: 14, textAlign: "center" }}>
            💡 Зураг автоматаар багасгагдана (300px)
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowPhotoUpload(false)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
            {photoUrl && (
              <button onClick={async () => {
                setPhotoSaving(true);
                try {
                  await upd({ photo_url: photoUrl });
                  onToast && onToast("✅ Зураг хадгалагдлаа", "success");
                  setShowPhotoUpload(false);
                } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
                setPhotoSaving(false);
              }} disabled={photoSaving}
                style={{ ...btn(t.accent, "#fff"), flex: 2, justifyContent: "center", boxShadow: `0 3px 0 ${t.border}`, opacity: photoSaving ? .5 : 1 }}>
                {photoSaving ? "⏳..." : "💾 Хадгалах"}
              </button>
            )}
          </div>
          {s.photo_url && (
            <button onClick={async () => {
              if (!window.confirm("Зургийг устгах уу?")) return;
              await upd({ photo_url: null });
              setPhotoUrl("");
              onToast && onToast("✅ Зураг устгагдлаа", "success");
              setShowPhotoUpload(false);
            }} style={{ width: "100%", marginTop: 8, padding: 8, borderRadius: 10, border: "none", background: "transparent", color: "#c62828", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
              🗑️ Одоогийн зургийг устгах
            </button>
          )}
        </Overlay>
      )}

      {/* Theme picker */}
      {showThemePicker && (
        <Overlay onClose={() => setShowThemePicker(false)} maxW={400}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>🎨</span>
            Theme сонгох
          </div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>Аппын өнгийг сонгоно уу</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {THEMES.map(theme => {
              const isSel = s.theme_id === theme.id;
              return (
                <div key={theme.id} onClick={async () => {
                  await upd({ theme_id: theme.id });
                  onToast && onToast(`${theme.emoji} ${theme.name} сонгогдлоо`, "success");
                  setShowThemePicker(false);
                }} className="k-press"
                  style={{
                    background: theme.card, borderRadius: 14, padding: 14, cursor: "pointer",
                    border: isSel ? `3px solid ${theme.accent}` : `2px solid ${theme.border}`,
                    textAlign: "center", transition: "all .2s",
                  }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>{theme.emoji}</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: theme.text }}>{theme.name}</div>
                  {isSel && (
                    <div style={{ marginTop: 4, fontSize: 10, color: theme.accent, fontWeight: 800 }}>✓ ИДЭВХТЭЙ</div>
                  )}
                </div>
              );
            })}
          </div>
        </Overlay>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
// PART 12 — MAIN APP (Гол компонент)
// ════════════════════════════════════════════════════════════════════

// ── Багш сурагч харах AdminStudentDetail ──────────────────────
// ── AllVocabsManager — Багш/Сүпэр-Админд: бүх анги, бүх үг, copy/print ──
function AllVocabsManager({ classes, vocabEntries, onClose, onChanged, onToast }) {
  const [selClsId, setSelClsId] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showCopyTo, setShowCopyTo] = useState(false);
  const [copyTargetCls, setCopyTargetCls] = useState("");
  const [copyTargetDate, setCopyTargetDate] = useState(TODAY);
  const [copying, setCopying] = useState(false);

  const filtered = useMemo(() => {
    if (selClsId === "all") return vocabEntries;
    return vocabEntries.filter(v => v.class_id === selClsId);
  }, [vocabEntries, selClsId]);

  // Group by date
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(v => {
      const d = v.date || "Огноогүй";
      if (!map[d]) map[d] = [];
      map[d].push(v);
    });
    return Object.keys(map).sort().reverse().map(d => ({ date: d, items: map[d] }));
  }, [filtered]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(v => v.id)));
  };

  const doCopy = async () => {
    if (!copyTargetCls) { onToast && onToast("❌ Анги сонгоно уу", "error"); return; }
    if (selectedIds.size === 0) { onToast && onToast("❌ Үг сонгоно уу", "error"); return; }
    setCopying(true);
    try {
      const toCopy = filtered.filter(v => selectedIds.has(v.id));
      const inserts = toCopy.map(v => ({
        id: `v${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        class_id: copyTargetCls, word: v.word, meaning: v.meaning,
        type: v.type || "vocab", date: copyTargetDate,
      }));
      await Promise.all(inserts.map(item => supaInsert("vocab_entries", item)));
      const cls = classes.find(c => c.id === copyTargetCls);
      onToast && onToast(`✅ ${toCopy.length} үг "${cls?.name || "—"}"-руу хуулагдлаа`, "success");
      setSelectedIds(new Set());
      setShowCopyTo(false);
      onChanged && onChanged();
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
    setCopying(false);
  };

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const clsName = selClsId === "all" ? "Бүх анги" : classes.find(c => c.id === selClsId)?.name || "—";
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Үгсийн жагсаалт</title>
<style>
@page { size: A4; margin: 1.5cm }
body { font-family: Arial; padding: 0 }
h1 { color: #7c3aed; text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 8px; font-size: 22px }
.meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px }
.date-section { margin-bottom: 18px; page-break-inside: avoid }
.date-title { background: #f5f0ff; color: #7c3aed; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; margin-bottom: 8px; display: inline-block }
table { width: 100%; border-collapse: collapse }
th { background: #e3f2fd; padding: 6px 10px; text-align: left; font-size: 12px; border: 1px solid #b3d9ff }
td { padding: 6px 10px; border: 1px solid #e0e0e0; font-size: 13px }
td.kr { font-weight: bold; width: 30% }
td.type { width: 60px; text-align: center; font-size: 11px }
</style></head><body>
<h1>📚 ${clsName}</h1>
<div class="meta">Нийт: ${filtered.length} үг/дүрэм · ${new Date().toLocaleDateString("mn-MN")}</div>`;
    grouped.forEach(g => {
      html += `<div class="date-section"><div class="date-title">📅 ${g.date}</div>
<table><thead><tr><th class="type">Төрөл</th><th>Солонгос</th><th>Монгол</th></tr></thead><tbody>`;
      g.items.forEach(v => {
        const isGr = v.type === "grammar";
        html += `<tr><td class="type">${isGr ? '📖' : '📚'}</td><td class="kr">${v.word || ""}</td><td>${v.meaning || ""}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    });
    html += `<script>window.onload=()=>window.print()</script></body></html>`;
    win.document.write(html); win.document.close();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>📋 Шинэ үгсийн жагсаалт</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{filtered.length} үг/дүрэм</div>
        </div>
        <button onClick={handlePrint} style={{ ...btn("#1976d2", "#fff"), boxShadow: "0 3px 0 #0d47a1" }}>🖨️ Хэвлэх</button>
      </div>

      {/* Анги сонгох */}
      <div style={{ marginBottom: 10 }}>
        <select value={selClsId} onChange={e => { setSelClsId(e.target.value); setSelectedIds(new Set()); }}
          style={{ ...INP, cursor: "pointer", fontWeight: 600 }}>
          <option value="all">🏫 Бүх анги ({vocabEntries.length})</option>
          {classes.map(c => {
            const cnt = vocabEntries.filter(v => v.class_id === c.id).length;
            return <option key={c.id} value={c.id}>{c.name} ({cnt})</option>;
          })}
        </select>
      </div>

      {/* Selection toolbar */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, background: "#e3f2fd", borderRadius: 10, padding: "6px 10px" }}>
          <button onClick={toggleSelectAll} style={btn("#fff", "#1976d2", "#90caf9")}>
            {selectedIds.size === filtered.length && filtered.length > 0 ? "✕ Цэвэрлэх" : "✓ Бүгдийг"}
          </button>
          <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700 }}>
            {selectedIds.size} / {filtered.length} сонгогдсон
          </div>
          {selectedIds.size > 0 && (
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => setShowCopyTo(true)} className="k-pop"
                style={{ ...btn("#1976d2", "#fff"), boxShadow: "0 3px 0 #0d47a1" }}>
                📋 Хуулах
              </button>
              <button onClick={async () => {
                if (!window.confirm(`${selectedIds.size} үгийг устгахдаа итгэлтэй байна уу?\n\nЭнэ үйлдлийг буцаах боломжгүй!`)) return;
                try {
                  const ids = [...selectedIds];
                  for (const id of ids) await supaDelete("vocab_entries", id);
                  setSelectedIds(new Set());
                  onToast && onToast(`✅ ${ids.length} үг устгагдлаа`, "success");
                  onChanged && onChanged();
                } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
              }} className="k-pop"
                style={{ ...btn("#e53935", "#fff"), boxShadow: "0 3px 0 #b71c1c" }}>
                🗑️ Устгах
              </button>
            </div>
          )}
        </div>
      )}

      {/* Үгсийн жагсаалт */}
      <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
        {grouped.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#aaa", fontSize: 13 }}>
            <div style={{ fontSize: 40, marginBottom: 8, opacity: .4 }}>📭</div>
            Үг байхгүй
          </div>
        ) : grouped.map(g => (
          <div key={g.date} style={{ marginBottom: 12, background: "#fff", borderRadius: 12, padding: 10, border: "1px solid #e0e0e0" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #f5f0ff", display: "flex", justifyContent: "space-between" }}>
              <span>📅 {g.date}</span>
              <span style={{ fontSize: 10, opacity: .6 }}>{g.items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {g.items.map(v => {
                const isSel = selectedIds.has(v.id);
                const isGr = v.type === "grammar";
                const cls = classes.find(c => c.id === v.class_id);
                return (
                  <div key={v.id} onClick={() => {
                    const ns = new Set(selectedIds);
                    if (isSel) ns.delete(v.id); else ns.add(v.id);
                    setSelectedIds(ns);
                  }} style={{
                    padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                    background: isSel ? "#e3f2fd" : (isGr ? "#f5f0ff" : "#fffdf5"),
                    border: isSel ? "2px solid #1976d2" : `1px solid ${isGr ? "#d4b8ff" : "#ffe082"}`,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, background: isSel ? "#1976d2" : "#fff", border: `2px solid ${isSel ? "#1976d2" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {isSel ? "✓" : ""}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: isGr ? "#7c3aed" : "#b8860b", flex: 1 }}>
                      {isGr ? "📖" : "📚"} {v.word} <span style={{ fontSize: 11, color: "#666", fontWeight: 500 }}>· {v.meaning}</span>
                    </span>
                    {selClsId === "all" && cls && (
                      <span style={{ fontSize: 9, color: "#fff", background: cls.color, padding: "1px 6px", borderRadius: 6, fontWeight: 700 }}>{cls.name}</span>
                    )}
                    <button onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`"${v.word}" устгах уу?`)) {
                        supaDelete("vocab_entries", v.id).then(() => onChanged && onChanged());
                      }
                    }} style={{ background: "transparent", border: "none", color: "#c62828", cursor: "pointer", fontSize: 13 }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Хуулах modal */}
      {showCopyTo && (
        <Overlay onClose={() => setShowCopyTo(false)} maxW={380}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>📋 Үгсийг хуулах</div>
          <div style={{ background: "#e3f2fd", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 12, color: "#1976d2", fontWeight: 700 }}>
            {selectedIds.size} үг/дүрэм сонгогдсон
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>🎯 АЛЬ АНГИ РУУ?</div>
            <select value={copyTargetCls} onChange={e => setCopyTargetCls(e.target.value)} style={{ ...INP, cursor: "pointer" }}>
              <option value="">Сонгох...</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#1976d2", fontWeight: 700, marginBottom: 5 }}>📅 АЛЬ ӨДӨРТ?</div>
            <input type="date" value={copyTargetDate} onChange={e => setCopyTargetDate(e.target.value)} style={INP} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowCopyTo(false)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
            <button onClick={doCopy} disabled={copying || !copyTargetCls}
              style={{ ...btn("#1976d2", "#fff"), flex: 2, justifyContent: "center", boxShadow: "0 3px 0 #0d47a1", opacity: (copying || !copyTargetCls) ? .5 : 1 }}>
              {copying ? "⏳..." : `📋 ${selectedIds.size} үг хуулах`}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}


function AdminStudentDetail({ s, setStudents, goBack, attMonth, setAttMonth, classDays, vocabEntries,
  homeworks, homeworkSubs, exams, examSubs, isSuperAdmin, onToast }) {
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState(s.teacher_notes || "");
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [editForm, setEditForm] = useState({
    name: s.name || "", phone: s.phone || "", email: s.email || "", rd: s.rd || "",
    password: "", // хоосон үлдээвэл өөрчлөгдөхгүй
    enroll_date: s.enroll_date || "", level: s.level || 0,
    total_fee: s.total_fee || 0, next_due: s.next_due || "",
    xp: s.xp || 0, theme_id: s.theme_id || "sakura",
  });

  const t = getTheme(s.theme_id);
  const sessions = getSessions(classDays, attMonth);
  const present = sessions.filter(item => (s.attendance || {})[item.date]).length;

  const upd = async (updates) => {
    try {
      await supaUpdate("students", s.id, updates);
      setStudents(prev => prev.map(x => x.id === s.id ? { ...x, ...updates } : x));
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  const toggleAtt = async (date) => {
    const att = { ...(s.attendance || {}) };
    if (att[date]) delete att[date]; else att[date] = true;
    await upd({ attendance: att });
  };

  const saveInfo = async () => {
    try {
      const updates = {
        name: editForm.name.trim() || s.name,
        enroll_date: editForm.enroll_date || null,
        level: parseInt(editForm.level) || 0,
        xp: parseInt(editForm.xp) || 0,  // XP-г багш ч засаж болно
      };
      // Зөвхөн сүпэр-админ засаж болох зүйлс
      if (isSuperAdmin) {
        updates.phone = editForm.phone.trim() || null;
        updates.email = editForm.email.trim() || s.email;
        updates.rd = editForm.rd.trim() || null;
        updates.total_fee = parseInt(editForm.total_fee) || 0;
        updates.next_due = editForm.next_due || null;
        updates.theme_id = editForm.theme_id || "sakura";
        if (editForm.password && editForm.password.length >= 6) {
          updates.password = editForm.password;
        }
      }
      await upd(updates);
      onToast && onToast("✅ Хадгалагдлаа", "success");
      setShowEditInfo(false);
    } catch (e) { onToast && onToast("❌ " + e.message, "error"); }
  };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "system-ui", padding: 14, paddingBottom: 30 }}>
      <style>{ANIMATIONS}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={goBack} style={btn("#fff", t.text, t.border)}>← Буцах</button>
        <div style={{ fontWeight: 800, fontSize: 14, color: t.accent }}>{s.name}</div>
        <button onClick={() => setShowEditInfo(true)} style={btn(t.soft, t.accent)}>✏️</button>
      </div>

      <CardContent s={s} t={t} isAdmin={true} isSuperAdmin={isSuperAdmin} upd={upd}
        attMonth={attMonth} setAttMonth={setAttMonth} classDays={classDays}
        vocabEntries={vocabEntries} sessions={sessions} present={present}
        onToggleAtt={toggleAtt} setShowPay={null}
        editNotes={editNotes} setEditNotes={setEditNotes} notes={notes} setNotes={setNotes}
        homeworks={homeworks} homeworkSubs={homeworkSubs} exams={exams} examSubs={examSubs} />

      {/* Сурагчийн мэдээлэл засах */}
      {showEditInfo && (
        <Overlay onClose={() => setShowEditInfo(false)} maxW={420}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>✏️</span>
            Сурагчийн мэдээлэл засах
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>👤 НЭР</div>
            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={INP} />
          </div>

          {isSuperAdmin && (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>📞 УТАС</div>
                <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} style={INP} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>📧 И-МЭЙЛ</div>
                <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={INP} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>🆔 РД (Регистр)</div>
                <input value={editForm.rd} onChange={e => setEditForm({ ...editForm, rd: e.target.value })} style={INP} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>🔑 НУУЦ ҮГ ШИНЭЧЛЭХ</div>
                <input type="text" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Хоосон үлдээвэл өөрчлөгдөхгүй" style={INP} />
              </div>
            </>
          )}

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>📅 БҮРТГҮҮЛСЭН ОГНОО</div>
            <input type="date" value={editForm.enroll_date} onChange={e => setEditForm({ ...editForm, enroll_date: e.target.value })} style={INP} />
            <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Хичээл эхэлсэн анхны өдөр</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>📊 TOPIK ТҮВШИН</div>
            <select value={editForm.level} onChange={e => setEditForm({ ...editForm, level: e.target.value })} style={{ ...INP, cursor: "pointer" }}>
              {TOPIK.map((tp, i) => <option key={i} value={i}>{tp}</option>)}
            </select>
          </div>

          {/* XP засах — багш ч боломжтой (алдаатай XP залруулах) */}
          <div style={{ marginBottom: 10, background: "#fff8e1", borderRadius: 10, padding: 10, border: "1px solid #ffe082" }}>
            <div style={{ fontSize: 11, color: "#f57c00", fontWeight: 700, marginBottom: 5 }}>⚡ XP ОНОО (засах)</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={() => setEditForm({ ...editForm, xp: Math.max(0, (parseInt(editForm.xp) || 0) - 10) })}
                style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: "#ffcdd2", color: "#c62828", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>−</button>
              <input type="number" value={editForm.xp} onChange={e => setEditForm({ ...editForm, xp: e.target.value })} style={{ ...INP, textAlign: "center", fontWeight: 800 }} />
              <button onClick={() => setEditForm({ ...editForm, xp: (parseInt(editForm.xp) || 0) + 10 })}
                style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: "#c8e6c9", color: "#2e7d32", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>+</button>
            </div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>− / + товчоор 10-аар нэмэгдүүлэх/хорогдуулах</div>
          </div>

          {isSuperAdmin && (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>🎨 THEME</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {THEMES.map(theme => {
                    const isSel = editForm.theme_id === theme.id;
                    return (
                      <div key={theme.id} onClick={() => setEditForm({ ...editForm, theme_id: theme.id })}
                        style={{
                          background: theme.card, borderRadius: 10, padding: 8, cursor: "pointer",
                          border: isSel ? `3px solid ${theme.accent}` : `2px solid ${theme.border}`,
                          textAlign: "center",
                        }}>
                        <div style={{ fontSize: 22 }}>{theme.emoji}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: theme.text, marginTop: 2 }}>{theme.name.split(" ")[1] || theme.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>💰 НИЙТ ТӨЛБӨР (₮)</div>
                <input type="number" value={editForm.total_fee} onChange={e => setEditForm({ ...editForm, total_fee: e.target.value })} style={INP} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, marginBottom: 5 }}>⏰ ДАРААГИЙН ТӨЛБӨРИЙН ХУГАЦАА</div>
                <input type="date" value={editForm.next_due} onChange={e => setEditForm({ ...editForm, next_due: e.target.value })} style={INP} />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowEditInfo(false)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
            <button onClick={saveInfo} style={{ ...btn(t.accent, "#fff"), flex: 2, justifyContent: "center", boxShadow: `0 3px 0 ${t.border}` }}>
              💾 Хадгалах
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 🌸 ГОЛ APP КОМПОНЕНТ
// ════════════════════════════════════════════════════════════════════
export default function App() {
  // ── User session (localStorage) ───
  const [user, setUserState] = useState(() => loadSession());
  const setUser = useCallback((u) => { setUserState(u); saveSession(u); }, []);

  // ── State ───
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [vocabEntries, setVocabEntries] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [homeworkSubs, setHomeworkSubs] = useState([]);
  const [exams, setExams] = useState([]);
  const [examSubs, setExamSubs] = useState([]);
  const [pending, setPending] = useState([]);
  const [selCls, setSelCls] = useState(null);
  const [selSid, setSelSid] = useState(null);
  const [attMonth, setAttMonth] = useState(NOW_MONTH);
  const [showAddCls, setShowAddCls] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showOverdueDetail, setShowOverdueDetail] = useState(false);
  const [showAllVocab, setShowAllVocab] = useState(false);
  const [loading, setLoading] = useState(!!user);
  const [toast, setToast] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  // New class form
  const [nc, setNc] = useState({ name: "", time: "", days: [], color: "#e91e8c" });
  // Сүпэр-админ багш сонгож тэр багшийн ангийг тусад нь харах
  const [viewingTeacherId, setViewingTeacherId] = useState(null);

  const showToast = (msg, type) => setToast({ msg, type: type || "success" });

  // Online/Offline detection
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); showToast("✅ Интернет холбогдлоо", "success"); };
    const onOffline = () => { setIsOnline(false); showToast("📵 Интернет тасарсан — Offline горимд ажиллана", "warning"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── Load all data ─────────────
  const loadAll = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      // ХУРДНЫ ОПТИМИЗАЦИ: Эхлээд хамгийн чухал 3 хүснэгт (анги, сурагч, үг) ачаалж нүүр харагдуулна
      // Дараа нь арын background-д бусад мэдээлэл ачаална
      const [cls, sts, voc] = await Promise.all([
        supaSelect("classes"),
        supaSelect("students"),
        supaSelect("vocab_entries"),
      ]);
      setClasses(cls || []);
      setStudents((sts || []).map(s => ({
        ...s,
        attendance: s.attendance && typeof s.attendance === "object" ? s.attendance : {},
        badges: Array.isArray(s.badges) ? s.badges : [],
        weak_words: Array.isArray(s.weak_words) ? s.weak_words : [],
      })));
      setVocabEntries(voc || []);
      if (!silent) setLoading(false);  // нүүр харагдуулчихсан

      // Хоёрдогч мэдээлэл — арын background-д үргэлжлүүлж ачаална
      try {
        const [hws, hsubs, exs, esubs, pends, ts] = await Promise.all([
          supaSelect("homeworks").catch(() => []),
          supaSelect("homework_submissions").catch(() => []),
          supaSelect("exams").catch(() => []),
          supaSelect("exam_submissions").catch(() => []),
          supaSelect("pending_students").catch(() => []),
          supaSelect("teachers").catch(() => []),
        ]);
        setHomeworks(hws || []);
        setHomeworkSubs(hsubs || []);
        setExams(exs || []);
        setExamSubs(esubs || []);
        setPending(pends || []);
        setTeachers(ts || []);
      } catch (e) {
        console.warn("Secondary load error:", e.message);
      }
    } catch (e) {
      console.error("Load error", e);
      showToast("❌ Мэдээлэл ачаалахад алдаа гарлаа", "error");
      if (!silent) setLoading(false);
    }
  }, []);

  // ⚡ Эхлэх үед нэг удаа л дуудна — subscribe нь үлдсэн ачаалалд хариуцна
  useEffect(() => { if (user) loadAll(false); }, [user]);

  // ⚡ REAL-TIME SUBSCRIBERS — Firebase онлайн өөрчлөлтийг шууд авна
  // Багш үг нэмэхэд → сурагч шууд харна (refresh хэрэггүй)
  useEffect(() => {
    if (!user) return;
    const unsubscribers = [];

    // Чухал collections-уудад onSnapshot listener тавьдаг
    // Listener тус бүр өгөгдөл өөрчлөгдөнгүүт автомат state-ийг шинэчилнэ
    const subscribe = (collName, setter, processor) => {
      try {
        const unsub = onSnapshot(
          collection(db, collName),
          (snapshot) => {
            const docs = [];
            snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
            setter(processor ? processor(docs) : docs);
          },
          (err) => console.warn(`Subscribe ${collName}:`, err.message)
        );
        unsubscribers.push(unsub);
      } catch (e) {
        console.warn(`Could not subscribe to ${collName}:`, e.message);
      }
    };

    subscribe("classes", setClasses);
    subscribe("students", setStudents, (docs) => docs.map(s => ({
      ...s,
      attendance: s.attendance && typeof s.attendance === "object" ? s.attendance : {},
      badges: Array.isArray(s.badges) ? s.badges : [],
      weak_words: Array.isArray(s.weak_words) ? s.weak_words : [],
    })));
    subscribe("vocab_entries", setVocabEntries);
    subscribe("homeworks", setHomeworks);
    subscribe("homework_submissions", setHomeworkSubs);
    subscribe("exams", setExams);
    subscribe("exam_submissions", setExamSubs);
    subscribe("pending_students", setPending);
    subscribe("teachers", setTeachers);

    // Cleanup — компонент unmount хийгдэхэд listeners-ийг хаах
    return () => unsubscribers.forEach(unsub => {
      try { unsub(); } catch (e) {}
    });
  }, [user]);

  // Auto-refresh when visible
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && user) loadAll(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, loadAll]);

  // Pull-to-refresh
  const { pullY, refreshing } = usePullToRefresh(async () => { await loadAll(true); });

  // ── Auth ──
  if (!user) return (
    <>
      <style>{ANIMATIONS}</style>
      <AuthScreen onAuth={setUser} />
    </>
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#f48cb1,#e91e8c)", color: "#fff", fontFamily: "system-ui" }}>
        <style>{ANIMATIONS}</style>
        <div className="k-bounce" style={{ fontSize: 64, marginBottom: 12 }}>🌸</div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Уншиж байна...</div>
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", animation: `kBounce 1s ease-in-out ${i * 0.15}s infinite` }} />)}
        </div>
      </div>
    );
  }

  // ── Student view ──
  if (user.role === "student") {
    const s = students.find(x => x.id === user.id);
    if (!s) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, background: "#f8f9ff" }}>
          <style>{ANIMATIONS}</style>
          <div className="k-bounce" style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 16, color: "#666", fontWeight: 700, textAlign: "center" }}>Сурагчийн мэдээлэл олдсонгүй</div>
          <button onClick={() => { setUser(null); }} style={{ marginTop: 14, ...btn("#e53935", "#fff") }}>← Гарах</button>
        </div>
      );
    }
    const cls = classes.find(c => c.id === s.class_id);
    const classVocabs = vocabEntries.filter(v => v.class_id === s.class_id);
    const classmates = students.filter(x => x.class_id === s.class_id);
    return (
      <>
        <style>{ANIMATIONS}</style>
        <PullIndicator pullY={pullY} refreshing={refreshing} color={cls?.color || "#7c3aed"} />
        <StudentView
          s={s} setStudents={setStudents} goBack={() => setUser(null)}
          attMonth={attMonth} setAttMonth={setAttMonth}
          classDays={cls?.days || []} classStartDate={cls?.start_date} vocabEntries={classVocabs}
          classmates={classmates} classColor={cls?.color || "#7c3aed"}
          homeworks={homeworks} homeworkSubs={homeworkSubs}
          exams={exams} examSubs={examSubs}
          refreshAll={() => loadAll(true)} onToast={showToast}
        />
        <Toast msg={toast?.msg} type={toast?.type} onDone={() => setToast(null)} />
      </>
    );
  }

  // ── Teacher view ──
  const isTeacher = user.role === "teacher";
  const isSuperAdmin = user.isSuperAdmin;
  // Багш ангитай эсэхийг шалгах функц
  const classBelongsToTeacher = (c, teacherId) => {
    if (c.teacher_id) return c.teacher_id === teacherId;
    const t = teachers.find(x => x.id === teacherId);
    if (t?.class_ids?.includes(c.id)) return true;
    return false;
  };
  // viewingTeacherId: "all"=бүгд, "mine"=зөвхөн миний, эсвэл багшийн ID
  // Анхдагч нь "all" (бүгд)
  const visibleClasses = isSuperAdmin
    ? (viewingTeacherId === "mine"
        ? classes.filter(c => classBelongsToTeacher(c, user.id))
        : (viewingTeacherId && viewingTeacherId !== "all")
          ? classes.filter(c => classBelongsToTeacher(c, viewingTeacherId))
          : classes)  // "all" эсвэл null → БҮХ анги
    : classes.filter(c => user.class_ids?.includes(c.id) || classBelongsToTeacher(c, user.id));

  // Selected class detail
  if (selCls) {
    const cls = classes.find(c => c.id === selCls);
    if (!cls) { setSelCls(null); return null; }
    const clsSts = students.filter(s => s.class_id === selCls);

    if (selSid) {
      const sel = clsSts.find(s => s.id === selSid);
      if (sel) {
        return (
          <>
            <style>{ANIMATIONS}</style>
            <PullIndicator pullY={pullY} refreshing={refreshing} />
            <AdminStudentDetail s={sel} setStudents={setStudents}
              goBack={() => setSelSid(null)}
              attMonth={attMonth} setAttMonth={setAttMonth}
              classDays={cls.days || []} vocabEntries={vocabEntries.filter(v => v.class_id === cls.id)}
              homeworks={homeworks} homeworkSubs={homeworkSubs}
              exams={exams} examSubs={examSubs}
              isSuperAdmin={isSuperAdmin} onToast={showToast} />
            <Toast msg={toast?.msg} type={toast?.type} onDone={() => setToast(null)} />
          </>
        );
      }
    }

    return (
      <>
        <style>{ANIMATIONS}</style>
        <PullIndicator pullY={pullY} refreshing={refreshing} />
        <ClassDetail cls={cls} isAdmin={isTeacher} isSuperAdmin={isSuperAdmin}
          students={clsSts} setStudents={setStudents} setClasses={setClasses}
          goBack={() => setSelCls(null)} attMonth={attMonth} setAttMonth={setAttMonth}
          teacherId={user.id} teachers={teachers}
          homeworks={homeworks} homeworkSubs={homeworkSubs}
          exams={exams} examSubs={examSubs}
          vocabEntries={vocabEntries} refreshAll={() => loadAll(true)}
          onToast={showToast} onSelectStudent={setSelSid} />
        <Toast msg={toast?.msg} type={toast?.type} onDone={() => setToast(null)} />
      </>
    );
  }

  // === Teacher Dashboard ===
  const todayDow = new Date().getDay();
  const mappedDow = todayDow === 0 ? 7 : todayDow;
  const todayClasses = visibleClasses.filter(c => (c.days || []).includes(mappedDow));
  const allStudents = isSuperAdmin ? students : students.filter(s => visibleClasses.some(c => c.id === s.class_id));
  const activeExams = (exams || []).filter(e => e.status === "active" && visibleClasses.some(c => c.id === e.class_id));

  return (
    <>
      <style>{ANIMATIONS}</style>
      <PullIndicator pullY={pullY} refreshing={refreshing} />
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f8f9ff 0%,#fff 200px)", fontFamily: "system-ui", padding: 16, paddingBottom: 30 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#1a1a2e", display: "flex", alignItems: "center", gap: 8 }}>
              🌸 Кандун
              {/* Real-time / Offline indicator */}
              {isOnline ? (
                <span title="Шууд холбогдсон — багш үг нэмэхэд сурагч шууд харна" style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  background: "#e8f5e9", color: "#1b5e20",
                  padding: "2px 8px", borderRadius: 10, fontSize: 9, fontWeight: 800,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#43a047", display: "inline-block" }} className="k-pulse" />
                  LIVE
                </span>
              ) : (
                <span title="Интернет тасарсан — хадгалсан мэдээллээр ажиллана" style={{
                  background: "#fff3e0", color: "#e65100",
                  padding: "2px 8px", borderRadius: 10, fontSize: 9, fontWeight: 800,
                }}>
                  📵 OFFLINE
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#888" }}>
              {isSuperAdmin ? "👑 Сүпэр админ" : "👩‍🏫 Багш"} · {user.displayName}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {isSuperAdmin && pending.length > 0 && (
              <button onClick={() => setShowAdmin(true)} className="k-pulse" style={{ ...btn("#ff9800", "#fff"), position: "relative" }}>
                ⏳ Хүсэлт <span style={{ background: "#fff", color: "#ff9800", borderRadius: 8, padding: "1px 5px", fontSize: 10, fontWeight: 800, marginLeft: 4 }}>{pending.length}</span>
              </button>
            )}
            <button onClick={() => setShowAllVocab(true)} style={btn("#e1f5fe", "#0288d1", "#81d4fa")}>📋 Үгс</button>
            {isSuperAdmin && <button onClick={() => setShowAdmin(true)} style={btn("#fff", "#7c3aed", "#d4b8ff")}>🔑 Удирдах</button>}
            {isSuperAdmin && <button onClick={() => setShowAddCls(true)} style={{ ...btn("#7c3aed", "#fff"), boxShadow: "0 3px 0 #5b21b6" }}>+ Анги</button>}
            <button onClick={() => loadAll(true)} style={btn("#f0f0f0", "#555")} title="Сэргээх">🔄</button>
            <button onClick={() => {
              if (window.confirm("Системээс гарах уу?")) setUser(null);
            }} style={btn("#fff", "#e53935", "#ffcdd2")}>Гарах</button>
          </div>
        </div>

        {/* 👑 Сүпэр-Админ — Багш сонгож тэр багшийн ангиудыг харах */}
        {isSuperAdmin && (
          <div className="k-fade" style={{ background: "#fff", borderRadius: 14, padding: 10, marginBottom: 12, border: "2px solid #d4b8ff", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", display: "flex", alignItems: "center", gap: 4 }}>
              👑 ХЭНИЙ АНГИУД?
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
              {/* Бүгд */}
              <button onClick={() => setViewingTeacherId("all")}
                style={{
                  padding: "4px 10px", borderRadius: 8, border: "none",
                  background: (!viewingTeacherId || viewingTeacherId === "all") ? "#7c3aed" : "#f3e5f5",
                  color: (!viewingTeacherId || viewingTeacherId === "all") ? "#fff" : "#7c3aed",
                  fontWeight: 700, fontSize: 11, cursor: "pointer",
                }}>
                🌸 Бүгд ({classes.length})
              </button>
              {/* Зөвхөн миний */}
              <button onClick={() => setViewingTeacherId("mine")}
                style={{
                  padding: "4px 10px", borderRadius: 8, border: "none",
                  background: viewingTeacherId === "mine" ? "#7c3aed" : "#f3e5f5",
                  color: viewingTeacherId === "mine" ? "#fff" : "#7c3aed",
                  fontWeight: 700, fontSize: 11, cursor: "pointer",
                }}>
                👤 Зөвхөн миний ({classes.filter(c => classBelongsToTeacher(c, user.id)).length})
              </button>
              {/* Бусад багш нар */}
              {teachers.filter(t => t.id !== user.id).map(t => {
                const cnt = classes.filter(c => classBelongsToTeacher(c, t.id)).length;
                const isSel = viewingTeacherId === t.id;
                return (
                  <button key={t.id} onClick={() => setViewingTeacherId(t.id)}
                    style={{
                      padding: "4px 10px", borderRadius: 8, border: "none",
                      background: isSel ? "#7c3aed" : "#f3e5f5",
                      color: isSel ? "#fff" : "#7c3aed",
                      fontWeight: 700, fontSize: 11, cursor: "pointer",
                    }}>
                    👩‍🏫 {t.name} ({cnt})
                  </button>
                );
              })}
            </div>
            {viewingTeacherId && viewingTeacherId !== "all" && (
              <div style={{ width: "100%", fontSize: 10, color: "#888", textAlign: "center", marginTop: 4, fontStyle: "italic" }}>
                👁️ {viewingTeacherId === "mine"
                  ? "Та зөвхөн өөрийн ангиудаа харж байна"
                  : <>Та <b>{teachers.find(t => t.id === viewingTeacherId)?.name}</b>-ийн ангиудыг харж байна</>}
              </div>
            )}
          </div>
        )}

        {/* Өнөөдрийн тойм */}
        <div className="k-fade" style={{ background: "#fff", borderRadius: 18, padding: 16, marginBottom: 16, border: "1px solid #f0f0f0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a2e", marginBottom: 10 }}>
            📊 Өнөөдрийн тойм <span style={{ fontSize: 11, color: "#888", fontWeight: 500 }}>· {fmtDate(TODAY)}</span>
          </div>

          {/* Идэвхтэй шалгалт alert */}
          {activeExams.length > 0 && (
            <div className="k-pop k-pulse" onClick={() => setSelCls(activeExams[0].class_id)}
              style={{ background: "linear-gradient(135deg,#ff5722,#e64a19)", color: "#fff", borderRadius: 14, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", boxShadow: "0 4px 14px rgba(229,57,53,0.3)" }}>
              <div className="k-bounce" style={{ fontSize: 24 }}>🏆</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{activeExams.length} ИДЭВХТЭЙ ШАЛГАЛТ</div>
                <div style={{ fontSize: 11, opacity: .95 }}>{activeExams.map(e => e.title).slice(0, 2).join(", ")}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>→</div>
            </div>
          )}

          {(() => {
            // Хоцорсон төлбөртэй сурагчид
            const overdueStudents = allStudents.filter(s => {
              if (!s.next_due) return false;
              return new Date(s.next_due) < new Date();
            });
            // Гэрийн даалгаврын идэвхтэй тоо
            const activeHwCount = (homeworks || []).filter(h =>
              visibleClasses.some(c => c.id === h.class_id) &&
              new Date(h.due_date) > new Date()
            ).length;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                {/* 1. ӨНӨӨДӨР - анги */}
                <div style={{ background: "#f5f0ff", borderRadius: 12, padding: "10px 12px", borderLeft: "3px solid #7c3aed" }}>
                  <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginBottom: 2 }}>📚 ӨНӨӨДӨР</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{todayClasses.length} анги</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 1 }}>
                    {todayClasses.length > 0 ? todayClasses.map(c => c.name).join(", ").slice(0, 30) : "Хичээл байхгүй"}
                  </div>
                </div>

                {/* 2. СУРАГЧ */}
                <div style={{ background: "#e8f5e9", borderRadius: 12, padding: "10px 12px", borderLeft: "3px solid #2e7d32" }}>
                  <div style={{ fontSize: 10, color: "#2e7d32", fontWeight: 700, marginBottom: 2 }}>👥 СУРАГЧ</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{allStudents.length}</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 1 }}>{visibleClasses.length} ангид</div>
                </div>

                {/* 3. ХОЦОРСОН ТӨЛБӨР - clickable */}
                <div onClick={() => overdueStudents.length > 0 && setShowOverdueDetail(true)}
                  className="k-press"
                  style={{
                    background: overdueStudents.length > 0 ? "#ffebee" : "#f5f5f5",
                    borderRadius: 12, padding: "10px 12px",
                    borderLeft: `3px solid ${overdueStudents.length > 0 ? "#c62828" : "#aaa"}`,
                    cursor: overdueStudents.length > 0 ? "pointer" : "default",
                  }}>
                  <div style={{ fontSize: 10, color: overdueStudents.length > 0 ? "#c62828" : "#888", fontWeight: 700, marginBottom: 2 }}>
                    💰 ХОЦОРСОН
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>
                    {overdueStudents.length} <span style={{ fontSize: 11, fontWeight: 600, opacity: .6 }}>сурагч</span>
                  </div>
                  <div style={{ fontSize: 10, color: overdueStudents.length > 0 ? "#c62828" : "#888", marginTop: 1 }}>
                    {overdueStudents.length > 0 ? "Дэлгэрэнгүй харах →" : "Бүгд төлсөн"}
                  </div>
                </div>

                {/* 4. ДААЛГАВАР */}
                <div style={{ background: "#fff3cd", borderRadius: 12, padding: "10px 12px", borderLeft: "3px solid #b8860b" }}>
                  <div style={{ fontSize: 10, color: "#b8860b", fontWeight: 700, marginBottom: 2 }}>📝 ДААЛГАВАР</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{activeHwCount}</div>
                  <div style={{ fontSize: 10, color: "#b8860b", marginTop: 1 }}>идэвхтэй</div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Анги жагсаалт — Image 1 шиг Habit Tracker маяг */}
        <div style={{ fontWeight: 700, fontSize: 14, color: "#555", marginBottom: 10, marginLeft: 4 }}>📚 Миний ангиуд</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleClasses.map((cls, idx) => {
            const cs = students.filter(s => s.class_id === cls.id);
            const isToday = (cls.days || []).includes(mappedDow);
            const sessions = getSessions(cls.days, attMonth);
            const totalSessions = sessions.length;
            const avgAttendance = (() => {
              if (totalSessions === 0 || cs.length === 0) return 0;
              const totalAtt = cs.reduce((sum, s) => sum + sessions.filter(sess => (s.attendance || {})[sess.date]).length, 0);
              return Math.round((totalAtt / (totalSessions * cs.length)) * 100);
            })();
            const todayPresent = cs.filter(s => (s.attendance || {})[TODAY]).length;
            const lightBg = cls.color + "1f";
            const fillColor = cls.color + "55";

            return (
              <div key={cls.id} onClick={() => setSelCls(cls.id)} className="k-press"
                style={{
                  background: lightBg, borderRadius: 20,
                  position: "relative", overflow: "hidden",
                  animation: `kSlideUp .35s ease ${idx * 0.05}s both`,
                  cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}>
                {/* Progress fill */}
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${avgAttendance}%`, background: fillColor, transition: "width .6s ease" }} />
                {/* Content */}
                <div style={{ position: "relative", zIndex: 1, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 2px 6px rgba(0,0,0,0.08)", flexShrink: 0 }}>
                    🏫
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cls.name}</div>
                      {isToday && <span style={{ background: cls.color, color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 8, whiteSpace: "nowrap" }}>📍 ӨНӨӨДӨР</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>
                      {isToday ? `🕐 ${cls.time} · 👥 ${todayPresent}/${cs.length} ирсэн`
                        : `🕐 ${cls.time} · 📅 ${totalSessions} оролт · 👥 ${cs.length} сурагч`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginBottom: 2 }}>
                      <span style={{ fontSize: 14 }}>🔥</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e" }}>{totalSessions} оролт</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: avgAttendance >= 80 ? "#2e7d32" : avgAttendance >= 60 ? "#e65100" : "#c62828" }}>
                      {avgAttendance}<span style={{ fontSize: 11, opacity: .7 }}>%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {visibleClasses.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa", fontSize: 14, background: "#fff", borderRadius: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 8, opacity: .4 }}>📚</div>
              Танд оноогдсон анги байхгүй байна.
            </div>
          )}
        </div>

        {/* Add class modal */}
        {showAddCls && (
          <Overlay onClose={() => setShowAddCls(false)}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>+ Шинэ анги</div>
            <input placeholder="Ангийн нэр" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ ...INP, marginBottom: 8 }} />
            <input placeholder="Цаг (жишээ нь 18:00)" value={nc.time} onChange={e => setNc({ ...nc, time: e.target.value })} style={{ ...INP, marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>Хичээллэх өдрүүд:</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5, 6, 7].map(d => {
                const sel = nc.days.includes(d);
                return (
                  <button key={d} onClick={() => setNc({ ...nc, days: sel ? nc.days.filter(x => x !== d) : [...nc.days, d] })}
                    style={{
                      padding: "8px 12px", borderRadius: 10, border: sel ? "2px solid #7c3aed" : "2px solid #e0e0e0",
                      background: sel ? "#f5f0ff" : "#fff", color: sel ? "#7c3aed" : "#666",
                      fontWeight: 800, fontSize: 11, cursor: "pointer",
                    }}>{DLABELS[d]}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>Өнгө:</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {["#e91e8c", "#7c3aed", "#43a047", "#f57c00", "#1976d2", "#00897b", "#c62828", "#5d4037"].map(c => (
                <div key={c} onClick={() => setNc({ ...nc, color: c })} style={{
                  width: 32, height: 32, borderRadius: 8, background: c, cursor: "pointer",
                  border: nc.color === c ? "3px solid #1a1a2e" : "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddCls(false)} style={{ ...btn("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
              <button onClick={async () => {
                if (!nc.name.trim() || !nc.time.trim() || nc.days.length === 0) {
                  showToast("❌ Бүгдийг бөглөнө үү", "error"); return;
                }
                try {
                  const newClsId = `c${Date.now()}`;
                  await supaInsert("classes", { id: newClsId, ...nc, name: nc.name.trim(), time: nc.time.trim(), teacher_id: user.id, start_date: TODAY });
                  // Багшийн class_ids-руу нэмэх
                  const currentTeacher = teachers.find(t => t.id === user.id);
                  if (currentTeacher) {
                    const newClassIds = [...(currentTeacher.class_ids || []), newClsId];
                    await supaUpdate("teachers", user.id, { class_ids: newClassIds });
                  }
                  setNc({ name: "", time: "", days: [], color: "#e91e8c" });
                  setShowAddCls(false);
                  showToast("✅ Анги нэмэгдлээ", "success");
                  loadAll(true);
                } catch (e) { showToast("❌ " + e.message, "error"); }
              }} style={{ ...btn("#7c3aed", "#fff"), flex: 2, justifyContent: "center" }}>+ Үүсгэх</button>
            </div>
          </Overlay>
        )}

        {/* Admin Panel */}
        {showAdmin && (
          <AdminPanel students={students} setStudents={setStudents}
            currentTeacherId={user.id} classes={classes}
            onClose={() => setShowAdmin(false)} onToast={showToast}
            onRefresh={() => loadAll(true)} />
        )}

        {/* Хоцорсон төлбөртэй сурагчдын дэлгэрэнгүй */}
        {showOverdueDetail && (() => {
          const overdueList = allStudents.filter(s => {
            if (!s.next_due) return false;
            return new Date(s.next_due) < new Date();
          }).map(s => {
            const cls = classes.find(c => c.id === s.class_id);
            const daysOverdue = Math.floor((Date.now() - new Date(s.next_due).getTime()) / (1000 * 60 * 60 * 24));
            const dueAmount = Math.max(0, (s.total_fee || 0) - (s.total_paid || 0));
            return { s, cls, daysOverdue, dueAmount };
          }).sort((a, b) => b.daysOverdue - a.daysOverdue);
          return (
            <Overlay onClose={() => setShowOverdueDetail(false)} maxW={460}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 28 }}>💰</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#c62828" }}>Хоцорсон төлбөр</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{overdueList.length} сурагч</div>
                </div>
              </div>
              <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                {overdueList.map(({ s, cls, daysOverdue, dueAmount }) => {
                  const t2 = getTheme(s.theme_id);
                  return (
                    <div key={s.id} onClick={() => { setShowOverdueDetail(false); setSelCls(s.class_id); setSelSid(s.id); }}
                      className="k-press"
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, marginBottom: 6, background: "#fff5f5", borderRadius: 12, border: "1px solid #ffcdd2", cursor: "pointer" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: t2.soft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: `2px solid ${t2.accent}`, flexShrink: 0 }}>
                        {s.photo_url ? <img src={s.photo_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : t2.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                          <span style={{ background: cls?.color || "#888", color: "#fff", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{cls?.name || "—"}</span>
                          <span style={{ marginLeft: 6, color: "#c62828", fontWeight: 700 }}>⏰ {daysOverdue} хоног хоцорсон</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#c62828" }}>{fmt(dueAmount)}₮</div>
                        <div style={{ fontSize: 9, color: "#888", fontWeight: 600 }}>үлдсэн</div>
                      </div>
                    </div>
                  );
                })}
                {overdueList.length === 0 && (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "#43a047" }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Бүх сурагч төлбөрөө төлсөн!</div>
                  </div>
                )}
              </div>
            </Overlay>
          );
        })()}

        {/* Бүх үгс — бүх ангиар filter + copy боломжтой */}
        {showAllVocab && (
          <Overlay onClose={() => setShowAllVocab(false)} maxW={560}>
            <AllVocabsManager classes={visibleClasses} vocabEntries={vocabEntries}
              onClose={() => setShowAllVocab(false)}
              onChanged={() => loadAll(true)} onToast={showToast} />
          </Overlay>
        )}

        <Toast msg={toast?.msg} type={toast?.type} onDone={() => setToast(null)} />
      </div>
    </>
  );
}
