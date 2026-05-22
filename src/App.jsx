import { useState, useRef, useCallback, useMemo, useEffect } from "react";

// ── SUPABASE ──────────────────────────────────────────
const SUPA_URL = "https://ftmvhmsvrtownqrnvbzo.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0bXZobXN2cnRvd25xcm52YnpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE5ODIsImV4cCI6MjA5NDU5Nzk4Mn0.TV0YMNDNRcjv8oVfekwjJYeMgHlix4c4J3l0CR2_HUI";

// ── GLOBAL CSS ANIMATIONS (Duolingo маягийн) ──────────
if(typeof document!=="undefined"&&!document.getElementById("k-anim")){
  const style=document.createElement("style");
  style.id="k-anim";
  style.textContent=`
    @keyframes kFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes kSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes kSlideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
    @keyframes kPop{0%{transform:scale(0.92);opacity:0}60%{transform:scale(1.03);opacity:1}100%{transform:scale(1)}}
    @keyframes kBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
    @keyframes kShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
    @keyframes kFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    @keyframes kStretchUp{0%{transform:scaleY(0);transform-origin:bottom}100%{transform:scaleY(1);transform-origin:bottom}}
    @keyframes kSpinSlow{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    .k-fade{animation:kFadeIn .35s ease}
    .k-slide{animation:kSlideUp .3s ease}
    .k-pop{animation:kPop .35s cubic-bezier(0.34,1.56,0.64,1)}
    .k-press{transition:transform .12s ease}
    .k-press:active{transform:scale(0.94)}
    .k-hover{transition:all .2s ease}
    .k-hover:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,0.1)}
    .k-card-hover{transition:all .2s ease;cursor:pointer}
    .k-card-hover:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.12)}
    .k-bouncy{animation:kBounce 1s ease-in-out infinite}
    .k-float{animation:kFloat 2s ease-in-out infinite}
    button.k-btn{transition:transform .12s ease,box-shadow .15s ease,filter .15s ease}
    button.k-btn:hover{filter:brightness(1.05)}
    button.k-btn:active{transform:scale(0.96)}
  `;
  document.head.appendChild(style);
}

// Solongos audio (Web Speech API)
const speakKr=(text)=>{
  if(typeof window==="undefined"||!("speechSynthesis"in window))return;
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang="ko-KR";
    u.rate=0.85;
    window.speechSynthesis.speak(u);
  }catch(e){console.warn("TTS error",e);}
};

// ── GEMINI AI HELPERS ─────────────────────────────────
// Vercel api/gemini.js endpoint-той ажиллана
// Environment-аас GEMINI_API_KEY уншина (Vercel-д тохируулна)
const GEMINI_ENDPOINT = "/api/gemini";

async function geminiCall(prompt, opts = {}) {
  try {
    const r = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        system: opts.system,
        json: opts.json || false,
      }),
    });
    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      throw new Error(errData.error || `Gemini error: ${r.status}`);
    }
    const data = await r.json();
    return data.text || "";
  } catch (e) {
    console.error("Gemini call error:", e);
    throw e;
  }
}

// Солонгос үг → Монгол утга орчуулга
async function translateKrToMn(koreanWord) {
  const word = (koreanWord || "").trim();
  if (!word) return "";
  const prompt = `Солонгос үг "${word}"-ийн монгол утгыг ЗӨВХӨН утгыг буцаа. Тайлбар, өөр текст бичих хэрэггүй. Жишээ нь:
- "안녕하세요" → "Сайн уу"
- "감사합니다" → "Баярлалаа"
- "공부하다" → "хичээллэх"
- "학교" → "сургууль"

Одоо: "${word}" →`;
  try {
    const text = await geminiCall(prompt, {
      system: "Та солонгос-монгол хэлний орчуулагч. Зөвхөн утгыг буцаана, тайлбар бичихгүй.",
    });
    // Ихэвчлэн утга л буцаагдана
    return text.replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0].slice(0, 100);
  } catch (e) {
    return "";
  }
}

// Шалгалт/Бэлдэх дасгалын асуулт үүсгэх
async function generateExamQuestions({ vocabs, grammars, count = 10, level = 0, recentVocabs = [] }) {
  // vocabs = [{word, meaning}], grammars = [{word, meaning}]
  if ((!vocabs || vocabs.length === 0) && (!grammars || grammars.length === 0)) {
    return [];
  }
  const vocabStr = (vocabs || []).map((v, i) => `${i + 1}. ${v.word} = ${v.meaning}`).join("\n");
  const grammarStr = (grammars || []).map((v, i) => `${i + 1}. ${v.word}: ${v.meaning}`).join("\n");
  const recentStr = (recentVocabs || []).slice(0, 10).map(v => `${v.word} = ${v.meaning}`).join("\n");

  const levelName = ["Pre-TOPIK", "TOPIK I-1", "TOPIK I-2", "TOPIK II-3", "TOPIK II-4", "TOPIK II-5", "TOPIK II-6"][level] || "TOPIK I-1";

  const prompt = `Доорх солонгос үг, дүрмүүдээс ${count} ширхэг асуулт үүсгэ. Хариулагчийн түвшин: ${levelName}.

ГОЛ ҮГС:
${vocabStr || "(үгсгүй)"}

ДҮРМҮҮД:
${grammarStr || "(дүрэмгүй)"}

ӨМНӨХ ҮЗСЭН ҮГС (бага сага оруулж болно):
${recentStr || "(байхгүй)"}

ДҮРЭМ:
- 4 төрлийн асуулт оруулна: "multiple_choice" (4 сонголт), "translate_kr_mn" (солонгос→монгол бичих), "translate_mn_kr" (монгол→солонгос бичих), "fill_blank" (хоосон зайг гүйцээх).
- multiple_choice бол 4 сонголтын зөвхөн 1 нь зөв байна, бусад нь үнэмшилтэй буруу.
- translate_kr_mn бол сурагч монгол утгыг бичнэ.
- translate_mn_kr бол сурагч солонгос үг/үсэг бичнэ.
- fill_blank бол солонгос өгүүлбэрт ___ оруулаад зөв үгийг сонгуулна, 4 сонголттой.
- 80% нь ГОЛ ҮГ/ДҮРМЭЭС, 20% нь ӨМНӨХ үгсээс байх.
- Хэт хүнд биш, түвшинд тохирсон байх.

ЗААВАЛ ДАРААХ JSON форматаар буцаа (өөр текст бичихгүй):
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "학교-ийн утга юу вэ?",
      "options": ["сургууль", "найз", "багш", "ном"],
      "correct": "сургууль",
      "audio": "학교"
    },
    {
      "type": "translate_kr_mn",
      "question": "Дараах үгийн утгыг бичнэ үү:",
      "audio": "친구",
      "correct": "найз",
      "alternatives": ["анд", "нөхөр"]
    },
    {
      "type": "translate_mn_kr",
      "question": "Дараах монгол үгийг солонгосоор бичнэ үү:",
      "prompt_text": "сургууль",
      "correct": "학교"
    },
    {
      "type": "fill_blank",
      "question": "Хоосон зайг гүйцээ:",
      "sentence": "나는 ___에 갑니다",
      "audio": "나는 학교에 갑니다",
      "options": ["학교", "친구", "음식", "물"],
      "correct": "학교",
      "translation": "Би сургуульд явж байна"
    }
  ]
}`;

  try {
    const text = await geminiCall(prompt, {
      system: "Та солонгос хэлний багш. JSON форматтай асуулт үүсгэнэ. Зөвхөн JSON буцаа, өөр текст бичихгүй.",
      json: true,
    });
    const parsed = JSON.parse(text);
    return parsed.questions || [];
  } catch (e) {
    console.error("Question generation error:", e);
    return [];
  }
}

// Жишээ өгүүлбэр үүсгэх (нэг үгэнд)
async function generateExampleSentence(word, meaning, level = 0) {
  const prompt = `Солонгос үг "${word}" (${meaning})-ийг ашиглан 1 энгийн жишээ өгүүлбэр үүсгэ.
Хариуг ЗААВАЛ дараах JSON хэлбэрээр буцаа:
{"sentence": "솔롱오스 жишээ өгүүлбэр", "translation": "Монгол утга"}
Зөвхөн JSON, өөр зүйл бичихгүй.`;
  try {
    const text = await geminiCall(prompt, { json: true });
    return JSON.parse(text);
  } catch (e) {
    return { sentence: word, translation: meaning };
  }
}

const supa = {
  async from(table) {
    const base = `${SUPA_URL}/rest/v1/${table}`;
    const headers = {
      "apikey": SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    };
    return {
      async select(cols="*") {
        const r = await fetch(`${base}?select=${cols}`, {headers});
        return r.json();
      },
      async selectWhere(col, val, cols="*") {
        const r = await fetch(`${base}?select=${cols}&${col}=eq.${encodeURIComponent(val)}`, {headers});
        return r.json();
      },
      async insert(data) {
        const r = await fetch(base, {method:"POST", headers, body:JSON.stringify(data)});
        return r.json();
      },
      async update(col, val, data) {
        const r = await fetch(`${base}?${col}=eq.${encodeURIComponent(val)}`, {method:"PATCH", headers, body:JSON.stringify(data)});
        return r.ok;
      },
      async delete(col, val) {
        const r = await fetch(`${base}?${col}=eq.${encodeURIComponent(val)}`, {method:"DELETE", headers});
        return r.ok;
      },
      async upsert(data) {
        const h = {...headers, "Prefer":"resolution=merge-duplicates,return=representation"};
        const r = await fetch(base, {method:"POST", headers:h, body:JSON.stringify(data)});
        return r.json();
      },
    };
  }
};

const db = {
  async getAll(table) { return (await supa).from(table).then(t=>t.select()); },
};

// ── GLOBALS ───────────────────────────────────────────
let _levels = [
  {level:1,name:"Новш",xp:0},{level:2,name:"Анхан",xp:100},
  {level:3,name:"Суралцагч",xp:215},{level:4,name:"Дадлагажигч",xp:362},
  {level:5,name:"Чадварлаг",xp:546},{level:6,name:"Мэргэжилтэн",xp:778},
  {level:7,name:"Ахлагч",xp:1075},{level:8,name:"Мастер",xp:1455},
  {level:9,name:"Гранд Мастер",xp:1943},{level:10,name:"Легенд",xp:2584},
];

// Ургамлын stage label — superadmin засаж болно
let _plant_labels = [
  "🌱 Тариалж байна",
  "🌿 Ургаж байна",
  "🌳 Хөгжиж байна",
  "🌲 Цэцэглэж байна",
  "✨ Хамгийн дээд!",
];

// role: superadmin = бүх эрх, нууц үг харах, төлбөр харах
// role: teacher    = зөвхөн өөрийн анги, нууц үг/төлбөр харахгүй
let _teachers = [
  {id:"t1",name:"Супер Админ",email:"admin@school.mn",password:"password123",role:"superadmin"},
  {id:"t2",name:"Багш 1",email:"KoreanSem1@school.mn",password:"teacher789",role:"teacher",class_ids:["c1"]},
];

let _pending = [];

let _db = {
  classes:[
    {id:"c1",name:"Morning Beginners",time:"09:00",days:[1,3,5],color:"#e91e8c"},
    {id:"c2",name:"Evening Intermediate",time:"19:00",days:[2,4,6],color:"#2196f3"},
  ],
  students:[
    {id:"s1",class_id:"c1",name:"Emma Johnson",email:"emma@example.com",password:"emma1234",rd:"УБ123456",phone:"+976 9901-0101",photo_url:null,enroll_date:"2025-03-10",level:1,theme_id:"sakura",student_code:"AB12CD34",xp:340,badges:["vocab_master"],teacher_notes:"Дуудлага сайн.",weak_words:[{word:"어떻게",meaning:"Яаж",miss:3},{word:"왜냐하면",meaning:"Учир нь",miss:1}],hw_streak:5,hw_miss:0,attendance:{},total_paid:800000,total_fee:1000000,next_due:"2025-06-01",grammar_learned:4,grammar_total:4},
    {id:"s2",class_id:"c1",name:"Liam Park",email:"liam@example.com",password:"liam1234",rd:"УБ234567",phone:"+976 9901-0102",photo_url:null,enroll_date:"2025-04-07",level:2,theme_id:"sky",student_code:"XY99ZW11",xp:520,badges:["consistent"],teacher_notes:"Идэвхтэй.",weak_words:[{word:"그러므로",meaning:"Тиймийн тул",miss:5}],hw_streak:12,hw_miss:0,attendance:{},total_paid:500000,total_fee:1000000,next_due:"2025-05-15",grammar_learned:4,grammar_total:4},
    {id:"s3",class_id:"c1",name:"Sofia Kim",email:"sofia@example.com",password:"sofia1234",rd:"УБ345678",phone:"+976 9901-0103",photo_url:null,enroll_date:"2025-03-15",level:0,theme_id:"mint",student_code:"KL33MN44",xp:210,badges:[],teacher_notes:"",weak_words:[],hw_streak:2,hw_miss:1,attendance:{},total_paid:0,total_fee:1000000,next_due:null,grammar_learned:4,grammar_total:4},
    {id:"s4",class_id:"c1",name:"Jake Lee",email:"jake@example.com",password:"jake1234",rd:"УБ456789",phone:"+976 9901-0104",photo_url:null,enroll_date:"2025-04-01",level:1,theme_id:"peach",student_code:"PQ77RS88",xp:180,badges:["top_scorer"],teacher_notes:"",weak_words:[],hw_streak:0,hw_miss:3,attendance:{},total_paid:1000000,total_fee:1000000,next_due:"2025-06-01",grammar_learned:4,grammar_total:4},
    {id:"s5",class_id:"c2",name:"Noah Chen",email:"noah@example.com",password:"noah1234",rd:"УБ567890",phone:"+976 9901-0105",photo_url:null,enroll_date:"2025-01-15",level:3,theme_id:"forest",student_code:"MN55PQ22",xp:720,badges:["exam_master","consistent"],teacher_notes:"TOPIK II.",weak_words:[],hw_streak:8,hw_miss:0,attendance:{},total_paid:1200000,total_fee:1200000,next_due:"2025-06-01",grammar_learned:2,grammar_total:2},
  ],
  payments:[
    {id:"p1",student_id:"s1",amount:800000,paid_at:"2025-04-01",next_due:"2025-06-01",note:""},
    {id:"p2",student_id:"s2",amount:500000,paid_at:"2025-04-01",next_due:"2025-05-15",note:"Дутуу"},
    {id:"p3",student_id:"s5",amount:1200000,paid_at:"2025-04-01",next_due:"2025-06-01",note:""},
  ],
  vocab_entries:[
    {id:"ve1",class_id:"c1",month:"2025-04",word:"안녕하세요",meaning:"Сайн уу",type:"vocab"},
    {id:"ve2",class_id:"c1",month:"2025-04",word:"감사합니다",meaning:"Баярлалаа",type:"vocab"},
    {id:"ve3",class_id:"c1",month:"2025-04",word:"어떻게",meaning:"Яаж",type:"vocab"},
    {id:"ve4",class_id:"c1",month:"2025-04",word:"왜냐하면",meaning:"Учир нь",type:"vocab"},
    {id:"ve5",class_id:"c1",month:"2025-04",word:"이다",meaning:"...мөн",type:"grammar"},
    {id:"ve6",class_id:"c1",month:"2025-04",word:"-아/어요",meaning:"Одоогийн цаг",type:"grammar"},
    {id:"ve7",class_id:"c1",month:"2025-05",word:"학교",meaning:"Сургууль",type:"vocab"},
    {id:"ve8",class_id:"c1",month:"2025-05",word:"그러므로",meaning:"Тиймийн тул",type:"vocab"},
    {id:"ve9",class_id:"c1",month:"2025-05",word:"-았/었어요",meaning:"Өнгөрсөн цаг",type:"grammar"},
    {id:"ve10",class_id:"c1",month:"2025-05",word:"-겠어요",meaning:"Ирээдүй цаг",type:"grammar"},
    {id:"ve11",class_id:"c2",month:"2025-04",word:"어디",meaning:"Хаана",type:"vocab"},
    {id:"ve12",class_id:"c2",month:"2025-04",word:"었/았어요",meaning:"Өнгөрсөн цаг",type:"grammar"},
    {id:"ve13",class_id:"c2",month:"2025-04",word:"-겠-",meaning:"Ирээдүй/таамаг",type:"grammar"},
  ],
  badge_defs:[
    {id:"vocab_master",label:"📚 Vocab Master",auto:true},
    {id:"exam_master",label:"🏆 Exam Master",auto:true},
    {id:"consistent",label:"🔥 Consistent",auto:true},
    {id:"top_scorer",label:"⭐ Top Scorer",auto:false},
    {id:"star_student",label:"🌟 Star Student",auto:false},
    {id:"perfect_attend",label:"✅ Perfect Attend",auto:false},
  ],
};

// ── HELPERS ───────────────────────────────────────────
const THEMES=[
  {id:"sakura",name:"🌸 Sakura",bg:"#fff0f5",card:"#ffe4ef",accent:"#e91e8c",text:"#4a0028",soft:"#ffd6e8",border:"#f48cb1",emoji:"🌸"},
  {id:"sky",name:"☁️ Sky",bg:"#e8f4fd",card:"#d0eaff",accent:"#2196f3",text:"#0d2137",soft:"#b3d9ff",border:"#64b5f6",emoji:"☁️"},
  {id:"mint",name:"🌿 Mint",bg:"#e8faf4",card:"#c8f5e4",accent:"#00897b",text:"#003330",soft:"#a5e9d4",border:"#4db6ac",emoji:"🌿"},
  {id:"lavender",name:"💜 Lavender",bg:"#f3e8ff",card:"#e5d0ff",accent:"#7c3aed",text:"#2d0066",soft:"#d4b8ff",border:"#a78bfa",emoji:"💜"},
  {id:"peach",name:"🍑 Peach",bg:"#fff3e0",card:"#ffe0c0",accent:"#f57c00",text:"#4a1a00",soft:"#ffd099",border:"#ffb74d",emoji:"🍑"},
  {id:"rose",name:"🌹 Rose",bg:"#fce4ec",card:"#f8bbd0",accent:"#c2185b",text:"#4a0019",soft:"#f48fb1",border:"#e91e63",emoji:"🌹"},
  {id:"ocean",name:"🌊 Ocean",bg:"#e0f7fa",card:"#b2ebf2",accent:"#0097a7",text:"#002f35",soft:"#80deea",border:"#26c6da",emoji:"🌊"},
  {id:"forest",name:"🌲 Forest",bg:"#e8f5e9",card:"#c8e6c9",accent:"#2e7d32",text:"#1b3a1c",soft:"#a5d6a7",border:"#66bb6a",emoji:"🌲"},
  {id:"honey",name:"🍯 Honey",bg:"#fffde7",card:"#fff9c4",accent:"#f9a825",text:"#3d2b00",soft:"#fff176",border:"#fdd835",emoji:"🍯"},
  {id:"galaxy",name:"🌌 Galaxy",bg:"#1a1a2e",card:"#16213e",accent:"#e94560",text:"#e0e0ff",soft:"#0f3460",border:"#533483",emoji:"🌌"},
  {id:"space",name:"🚀 Space",bg:"#0d0d1a",card:"#1a1a3e",accent:"#00e5ff",text:"#e0ffff",soft:"#003d4d",border:"#00bcd4",emoji:"🚀"},
  {id:"matcha",name:"🍵 Matcha",bg:"#f1f8e9",card:"#dcedc8",accent:"#558b2f",text:"#1c3300",soft:"#c5e1a5",border:"#8bc34a",emoji:"🍵"},
  {id:"gold",name:"✨ Gold",bg:"#fffbf0",card:"#fff3cd",accent:"#b8860b",text:"#3d2800",soft:"#ffe89a",border:"#d4a017",emoji:"✨"},
  {id:"sunset",name:"🌅 Sunset",bg:"#fff8e1",card:"#ffecb3",accent:"#e65100",text:"#3e1400",soft:"#ffe082",border:"#ffa726",emoji:"🌅"},
  {id:"arctic",name:"❄️ Arctic",bg:"#eceff1",card:"#cfd8dc",accent:"#0288d1",text:"#1a2a35",soft:"#b0bec5",border:"#90a4ae",emoji:"❄️"},
  {id:"cherry",name:"🍒 Cherry",bg:"#ffebee",card:"#ffcdd2",accent:"#b71c1c",text:"#3d0000",soft:"#ef9a9a",border:"#e57373",emoji:"🍒"},
  {id:"cotton",name:"🍬 Cotton",bg:"#fce4ff",card:"#f8b8ff",accent:"#ad1457",text:"#3a003d",soft:"#f48dff",border:"#e040fb",emoji:"🍬"},
  {id:"bubblegum",name:"🫧 Bubble",bg:"#fdf2ff",card:"#f3d0ff",accent:"#d500f9",text:"#2d0040",soft:"#e8a0ff",border:"#ce93d8",emoji:"🫧"},
];
const TOPIK=["Pre-TOPIK","TOPIK I-1","TOPIK I-2","TOPIK II-3","TOPIK II-4","TOPIK II-5","TOPIK II-6"];
const WDAYS=["Ня","Да","Мя","Лх","Пү","Ба","Бя"];
const DLABELS=["","Да","Мя","Лх","Пү","Ба","Бя","Ня"];
const TODAY=new Date().toISOString().split("T")[0];
const NOW_MONTH=new Date().toISOString().slice(0,7);
const fmt=n=>Number(n||0).toLocaleString()+"₮";
const getT=id=>THEMES.find(t=>t.id===id)||THEMES[0];
const getLvl=xp=>[..._levels].reverse().find(l=>xp>=l.xp)||_levels[0];
const getNext=xp=>{const i=_levels.findIndex(l=>l.xp>xp);return i===-1?null:_levels[i];};
const fmtDate=d=>{if(!d)return"—";const p=d.split("-");return`${p[0]}/${p[1]}${p[2]?"/"+p[2]:""}`;};
const bs=(bg,c,border,sm)=>({background:bg,color:c,cursor:"pointer",fontWeight:500,border:border?`1px solid ${border}`:"none",borderRadius:sm?7:10,padding:sm?"5px 11px":"9px 16px",fontSize:sm?11:13,display:"inline-flex",alignItems:"center",gap:5,whiteSpace:"nowrap"});
const bdg=(bg,c)=>({background:bg,color:c,borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"});
const INP={width:"100%",padding:"8px 11px",borderRadius:9,border:"1px solid #e0e0e0",fontSize:13,outline:"none",boxSizing:"border-box"};

function getSessions(days,ym){
  if(!days||!days.length||!ym)return[];
  const parts=ym.split("-").map(Number);
  const y=parts[0],m=parts[1];
  const dim=new Date(y,m,0).getDate();
  const res=[];
  for(let d=1;d<=dim;d++){
    const dow=new Date(y,m-1,d).getDay();
    const mapped=dow===0?7:dow;
    if(days.includes(mapped))res.push({day:d,date:`${ym}-${String(d).padStart(2,"0")}`});
  }
  return res;
}

// ── UI ATOMS ──────────────────────────────────────────
function Overlay({onClose,children,maxW=340}){
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:22,width:"100%",maxWidth:maxW,maxHeight:"90vh",overflowY:"auto"}}>
        {children}
      </div>
    </div>
  );
}

function XPBar({xp,accent}){
  const cur=getLvl(xp);
  const nxt=getNext(xp);
  const pct=nxt?Math.round((xp-cur.xp)/(nxt.xp-cur.xp)*100):100;
  return(
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
        <span style={{fontWeight:700,color:accent}}>Lv.{cur.level} {cur.name}</span>
        <span style={{opacity:.6}}>{xp} XP{nxt?` → ${nxt.xp}`:""}</span>
      </div>
      <div style={{height:7,background:"#eee",borderRadius:7}}>
        <div style={{height:7,background:accent,borderRadius:7,width:`${pct}%`,transition:"width .4s"}}/>
      </div>
    </div>
  );
}

// ── PLANT TYPES ───────────────────────────────────────
const PLANT_TYPES=[
  {id:"cherry",name:"🌸 Интоор",type:"tree"},
  {id:"apple",name:"🍎 Алим",type:"tree"},
  {id:"pine",name:"🌲 Нарс",type:"tree"},
  {id:"maple",name:"🍁 Агч",type:"tree"},
  {id:"bamboo",name:"🎋 Хулс",type:"tree"},
  {id:"rose",name:"🌹 Сарнай",type:"flower"},
  {id:"sunflower",name:"🌻 Наран цэцэг",type:"flower"},
  {id:"tulip",name:"🌷 Тюльпан",type:"flower"},
  {id:"lavender",name:"💜 Лаванда",type:"flower"},
  {id:"daisy",name:"🌼 Хризантем",type:"flower"},
];

function StreakTree({streak,miss,plantType="cherry",onSelectPlant,isStudent=false,showSelect,setShowSelect}){
  const STREAK_COMPLETE = 6;
  const stage = miss>=3 ? 0 : streak===0 ? 0 : Math.min(4, Math.ceil(streak / (STREAK_COMPLETE/4)));
  const sz=[0.7,0.82,0.94,1.06,1.2][stage];
  const h = miss===0?"healthy":miss===1?"wilting":"dry";
  const missLabels=["","⚠️ Анхаарал!","🍂 Хатаж байна"];

  const renderPlant=()=>{
    const alive=miss<3;
    const filter=miss>=2?"saturate(0.2)":miss===1?"saturate(0.5)":"none";
    if(plantType==="cherry"){
      const trunk=h==="healthy"?"#5A3820":"#9A8060";
      const leaf=h==="healthy"?"#2E7D10":"#7A6A15";
      const bloom=stage>=3&&h==="healthy";
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          {stage>=1&&<rect x="37" y={52+stage} width={8-stage} height={20-stage} rx="3" fill={trunk}/>}
          {stage===0&&<line x1="40" y1="58" x2="40" y2="46" stroke={leaf} strokeWidth="3" strokeLinecap="round"/>}
          <ellipse cx="40" cy={46-stage*3} rx={12+stage*5} ry={9+stage*4} fill={leaf} opacity=".9"/>
          {stage>=2&&<ellipse cx={26-stage} cy={50-stage} rx={8+stage*2} ry={6+stage} fill={h==="healthy"?"#1b5e20":"#6A4525"} opacity=".85"/>}
          {stage>=2&&<ellipse cx={54+stage} cy={50-stage} rx={8+stage*2} ry={6+stage} fill={h==="healthy"?"#1b5e20":"#6A4525"} opacity=".85"/>}
          {stage>=3&&<ellipse cx="40" cy={28-stage} rx={13+stage*2} ry={10+stage} fill={leaf} opacity=".88"/>}
          {stage===0&&<circle cx="40" cy="43" r="9" fill={leaf} opacity=".9"/>}
          {bloom&&[{x:20,y:24},{x:54,y:18},{x:38,y:12},{x:48,y:34},{x:28,y:31}].map((p,i)=>(
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="5" fill="#FFB7C5" opacity=".9"/>
              <circle cx={p.x} cy={p.y} r="2" fill="#FF69B4" opacity=".8"/>
            </g>
          ))}
          {bloom&&[{x:30,y:45},{x:50,y:42},{x:15,y:43},{x:63,y:41}].map((p,i)=>(
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#FFB7C5" opacity=".7"/>
          ))}
        </svg>
      );
    }
    if(plantType==="apple"){
      const trunk="#6B3A2A";
      const leaf=h==="healthy"?"#2E7D32":"#8B7820";
      const hasApple=stage>=3&&h==="healthy";
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          {stage>=1&&<rect x="37" y={52+stage} width={8-stage} height={20-stage} rx="3" fill={trunk}/>}
          {stage===0&&<line x1="40" y1="58" x2="40" y2="46" stroke={leaf} strokeWidth="3" strokeLinecap="round"/>}
          <ellipse cx="40" cy={44-stage*3} rx={13+stage*5} ry={10+stage*4} fill={leaf} opacity=".9"/>
          {stage>=2&&<ellipse cx="26" cy="48" rx="9" ry="7" fill={h==="healthy"?"#1b5e20":"#6A4525"} opacity=".85"/>}
          {stage>=2&&<ellipse cx="54" cy="48" rx="9" ry="7" fill={h==="healthy"?"#1b5e20":"#6A4525"} opacity=".85"/>}
          {stage>=3&&<ellipse cx="40" cy="26" rx="14" ry="11" fill={leaf} opacity=".88"/>}
          {stage===0&&<circle cx="40" cy="43" r="9" fill={leaf} opacity=".9"/>}
          {hasApple&&[{x:22,y:36},{x:56,y:30},{x:40,y:20},{x:28,y:46},{x:52,y:44}].map((p,i)=>(
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="5" fill="#E53935" opacity=".95"/>
              <ellipse cx={p.x-1} cy={p.y-2} rx="1.5" ry="2" fill="#EF9A9A" opacity=".6"/>
              <line x1={p.x} y1={p.y-5} x2={p.x} y2={p.y-8} stroke="#4CAF50" strokeWidth="1.5"/>
            </g>
          ))}
        </svg>
      );
    }
    if(plantType==="pine"){
      const trunk=h==="healthy"?"#5D4037":"#9A8060";
      const c1=h==="healthy"?"#1B5E20":"#7A6A15";
      const c2=h==="healthy"?"#2E7D32":"#8B7820";
      const c3=h==="healthy"?"#388E3C":"#9B8A30";
      const hasSnow=stage>=4;
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          <rect x="37" y="60" width="6" height="15" rx="2" fill={trunk}/>
          {stage>=1&&<polygon points="40,42 28,60 52,60" fill={c1} opacity=".9"/>}
          {stage>=2&&<polygon points="40,30 26,52 54,52" fill={c2} opacity=".9"/>}
          {stage>=3&&<polygon points="40,18 27,42 53,42" fill={c3} opacity=".9"/>}
          {stage>=4&&<polygon points="40,8 29,30 51,30" fill={c3} opacity=".9"/>}
          {stage===0&&<polygon points="40,42 32,58 48,58" fill={c1} opacity=".9"/>}
          {hasSnow&&[{x:40,y:10},{x:34,y:20},{x:46,y:22},{x:30,y:32},{x:50,y:30}].map((p,i)=>(
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" opacity=".9"/>
          ))}
        </svg>
      );
    }
    if(plantType==="maple"){
      const trunk=h==="healthy"?"#5D4037":"#9A8060";
      const leafC=h==="healthy"?(stage>=3?"#E53935":"#E65100"):"#7A5535";
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          {stage>=1&&<rect x="37" y={52+stage} width={7-stage} height={20-stage} rx="3" fill={trunk}/>}
          {stage===0&&<line x1="40" y1="58" x2="40" y2="46" stroke={leafC} strokeWidth="3" strokeLinecap="round"/>}
          {stage>=1&&(
            <g>
              <polygon points="40,20 35,30 25,28 30,36 20,38 30,42 28,52 40,48 52,52 50,42 60,38 50,36 55,28 45,30" fill={leafC} opacity=".9" transform={`scale(${0.5+stage*0.15}) translate(${40*(1-0.5-stage*0.15)},${20*(1-0.5-stage*0.15)})`}/>
            </g>
          )}
          {stage===0&&<circle cx="40" cy="43" r="9" fill={leafC} opacity=".9"/>}
          {stage>=3&&h==="healthy"&&[{x:18,y:30},{x:62,y:28},{x:40,y:12},{x:22,y:48},{x:58,y:46}].map((p,i)=>(
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#FFD54F" opacity=".8"/>
          ))}
        </svg>
      );
    }
    if(plantType==="bamboo"){
      const c=h==="healthy"?"#558B2F":"#7A6A15";
      const lc=h==="healthy"?"#33691E":"#6A5A10";
      const segs=Math.min(5,stage+1);
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          {[0,1,2].map(col=>{
            const x=32+col*8;
            const heightPct=[0.6,1,0.75][col];
            const totalH=55*heightPct;
            const y=72-totalH;
            return(
              <g key={col}>
                {Array.from({length:Math.ceil(segs*heightPct)}).map((_,i)=>{
                  const segH=totalH/Math.ceil(segs*heightPct);
                  const sy=y+i*segH;
                  return(
                    <g key={i}>
                      <rect x={x} y={sy} width="5" height={segH-1} rx="2" fill={c} opacity=".9"/>
                      <rect x={x} y={sy+segH-2} width="5" height="2" fill={lc} opacity=".9"/>
                      {i%2===0&&stage>=2&&<ellipse cx={x+(col===1?-8:8)} cy={sy+segH/2} rx="6" ry="3" fill={c} opacity=".7" transform={`rotate(${col===1?-20:20},${x+(col===1?-8:8)},${sy+segH/2})`}/>}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      );
    }
    // Flowers
    if(plantType==="rose"){
      const stem=h==="healthy"?"#2E7D32":"#7A6A15";
      const petal=h==="healthy"?"#E91E8C":"#AD5A7A";
      const bloomed=stage>=2&&h==="healthy";
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          <line x1="40" y1="70" x2="40" y2={bloomed?30:50} stroke={stem} strokeWidth="3"/>
          {stage>=1&&<ellipse cx="32" cy="55" rx="7" ry="4" fill={stem} opacity=".7" transform="rotate(-30,32,55)"/>}
          {stage>=2&&<ellipse cx="48" cy="48" rx="7" ry="4" fill={stem} opacity=".7" transform="rotate(30,48,48)"/>}
          {bloomed?(
            <>
              {[0,60,120,180,240,300].map((deg,i)=>(
                <ellipse key={i} cx={40+Math.cos(deg*Math.PI/180)*8} cy={30+Math.sin(deg*Math.PI/180)*8} rx="6" ry="4" fill={petal} opacity=".85" transform={`rotate(${deg},${40+Math.cos(deg*Math.PI/180)*8},${30+Math.sin(deg*Math.PI/180)*8})`}/>
              ))}
              <circle cx="40" cy="30" r="5" fill="#FFD700" opacity=".9"/>
              {stage>=4&&[{x:20,y:25},{x:60,y:20},{x:40,y:12},{x:55,y:35}].map((p,i)=>(
                <g key={i}>
                  {[0,60,120,180,240,300].map((deg,j)=>(
                    <ellipse key={j} cx={p.x+Math.cos(deg*Math.PI/180)*5} cy={p.y+Math.sin(deg*Math.PI/180)*5} rx="4" ry="3" fill={petal} opacity=".75" transform={`rotate(${deg},${p.x+Math.cos(deg*Math.PI/180)*5},${p.y+Math.sin(deg*Math.PI/180)*5})`}/>
                  ))}
                  <circle cx={p.x} cy={p.y} r="3" fill="#FFD700" opacity=".8"/>
                </g>
              ))}
            </>
          ):(
            <circle cx="40" cy={bloomed?30:50} r={stage*3+4} fill={petal} opacity=".8"/>
          )}
        </svg>
      );
    }
    if(plantType==="sunflower"){
      const stem=h==="healthy"?"#388E3C":"#7A6A15";
      const petal=h==="healthy"?"#FDD835":"#B8860B";
      const bloomed=stage>=2&&h==="healthy";
      const cy=bloomed?25:45;
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          <line x1="40" y1="72" x2="40" y2={cy+10} stroke={stem} strokeWidth="4"/>
          {stage>=1&&<ellipse cx="30" cy="55" rx="9" ry="5" fill={stem} opacity=".6" transform="rotate(-25,30,55)"/>}
          {stage>=3&&<ellipse cx="50" cy="45" rx="9" ry="5" fill={stem} opacity=".6" transform="rotate(25,50,45)"/>}
          {bloomed?(
            <>
              {[0,45,90,135,180,225,270,315].map((deg,i)=>(
                <ellipse key={i} cx={40+Math.cos(deg*Math.PI/180)*13} cy={cy+Math.sin(deg*Math.PI/180)*13} rx="7" ry="4" fill={petal} opacity=".9" transform={`rotate(${deg},${40+Math.cos(deg*Math.PI/180)*13},${cy+Math.sin(deg*Math.PI/180)*13})`}/>
              ))}
              <circle cx="40" cy={cy} r="9" fill="#5D4037" opacity=".9"/>
              <circle cx="40" cy={cy} r="6" fill="#3E2723" opacity=".7"/>
              {stage>=4&&[{x:15,y:20},{x:65,y:18},{x:40,y:8}].map((p,i)=>(
                <g key={i}>
                  {[0,45,90,135,180,225,270,315].map((deg,j)=>(
                    <ellipse key={j} cx={p.x+Math.cos(deg*Math.PI/180)*8} cy={p.y+Math.sin(deg*Math.PI/180)*8} rx="5" ry="3" fill={petal} opacity=".8" transform={`rotate(${deg},${p.x+Math.cos(deg*Math.PI/180)*8},${p.y+Math.sin(deg*Math.PI/180)*8})`}/>
                  ))}
                  <circle cx={p.x} cy={p.y} r="5" fill="#5D4037" opacity=".85"/>
                </g>
              ))}
            </>
          ):(
            <circle cx="40" cy={cy} r={stage*4+5} fill={petal} opacity=".8"/>
          )}
        </svg>
      );
    }
    if(plantType==="tulip"){
      const stem=h==="healthy"?"#2E7D32":"#7A6A15";
      const petal=h==="healthy"?"#E91E63":"#AD5A7A";
      const bloomed=stage>=2&&h==="healthy";
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          <line x1="40" y1="72" x2="40" y2={bloomed?30:48} stroke={stem} strokeWidth="3.5"/>
          {stage>=1&&<ellipse cx="31" cy="58" rx="8" ry="4" fill={stem} opacity=".6" transform="rotate(-30,31,58)"/>}
          {stage>=3&&<ellipse cx="49" cy="50" rx="8" ry="4" fill={stem} opacity=".6" transform="rotate(30,49,50)"/>}
          {bloomed?(
            <>
              <ellipse cx="33" cy="32" rx="7" ry="12" fill={petal} opacity=".85" transform="rotate(-15,33,32)"/>
              <ellipse cx="47" cy="32" rx="7" ry="12" fill={petal} opacity=".85" transform="rotate(15,47,32)"/>
              <ellipse cx="40" cy="28" rx="6" ry="13" fill={`${petal}cc`} opacity=".9"/>
              <ellipse cx="40" cy="38" rx="8" ry="6" fill={petal} opacity=".7"/>
              {stage>=4&&[{x:18,y:22},{x:62,y:20},{x:55,y:38}].map((p,i)=>(
                <g key={i}>
                  <ellipse cx={p.x-4} cy={p.y+3} rx="5" ry="9" fill={petal} opacity=".75" transform={`rotate(-15,${p.x-4},${p.y+3})`}/>
                  <ellipse cx={p.x+4} cy={p.y+3} rx="5" ry="9" fill={petal} opacity=".75" transform={`rotate(15,${p.x+4},${p.y+3})`}/>
                  <ellipse cx={p.x} cy={p.y} rx="4" ry="10" fill={`${petal}cc`} opacity=".8"/>
                </g>
              ))}
            </>
          ):(
            <ellipse cx="40" cy={bloomed?30:50} rx={5+stage*2} ry={8+stage*2} fill={petal} opacity=".8"/>
          )}
        </svg>
      );
    }
    if(plantType==="lavender"){
      const stem=h==="healthy"?"#558B2F":"#7A6A15";
      const petal=h==="healthy"?"#7C3AED":"#9C6BC0";
      const bloomed=stage>=2&&h==="healthy";
      const stems=bloomed?[{x:35,y:25},{x:40,y:20},{x:45,y:23},{x:30,y:30},{x:50,y:28}]:[];
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          <line x1="40" y1="72" x2="40" y2="50" stroke={stem} strokeWidth="3"/>
          {stage>=1&&<line x1="40" y1="62" x2="30" y2="55" stroke={stem} strokeWidth="2.5"/>}
          {stage>=1&&<line x1="40" y1="62" x2="50" y2="55" stroke={stem} strokeWidth="2.5"/>}
          {bloomed&&stems.map((p,i)=>(
            <g key={i}>
              <line x1="40" y1="50" x2={p.x} y2={p.y+15} stroke={stem} strokeWidth="2"/>
              {[0,4,8,12,16].map((dy,j)=>(
                <ellipse key={j} cx={p.x} cy={p.y+15-dy} rx="3" ry="2" fill={petal} opacity={.6+dy*.02}/>
              ))}
            </g>
          ))}
          {!bloomed&&<ellipse cx="40" cy="45" rx={5+stage*2} ry={8+stage*2} fill={petal} opacity=".7"/>}
        </svg>
      );
    }
    if(plantType==="daisy"){
      const stem=h==="healthy"?"#388E3C":"#7A6A15";
      const petal=h==="healthy"?"#FFF9C4":"#C8B860";
      const center=h==="healthy"?"#FFD54F":"#B8A030";
      const bloomed=stage>=2&&h==="healthy";
      return(
        <svg viewBox="0 0 80 80" style={{width:"100%",height:"100%",filter}}>
          <line x1="40" y1="72" x2="40" y2={bloomed?30:48} stroke={stem} strokeWidth="3.5"/>
          {stage>=1&&<ellipse cx="31" cy="60" rx="8" ry="4" fill={stem} opacity=".6" transform="rotate(-25,31,60)"/>}
          {stage>=3&&<ellipse cx="50" cy="52" rx="8" ry="4" fill={stem} opacity=".6" transform="rotate(25,50,52)"/>}
          {bloomed?(
            <>
              {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg,i)=>(
                <ellipse key={i} cx={40+Math.cos(deg*Math.PI/180)*12} cy={30+Math.sin(deg*Math.PI/180)*12} rx="5" ry="3" fill={petal} opacity=".9" transform={`rotate(${deg},${40+Math.cos(deg*Math.PI/180)*12},${30+Math.sin(deg*Math.PI/180)*12})`}/>
              ))}
              <circle cx="40" cy="30" r="7" fill={center} opacity=".95"/>
              {stage>=4&&[{x:16,y:20},{x:64,y:18},{x:40,y:8},{x:60,y:36}].map((p,i)=>(
                <g key={i}>
                  {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg,j)=>(
                    <ellipse key={j} cx={p.x+Math.cos(deg*Math.PI/180)*8} cy={p.y+Math.sin(deg*Math.PI/180)*8} rx="4" ry="2.5" fill={petal} opacity=".8" transform={`rotate(${deg},${p.x+Math.cos(deg*Math.PI/180)*8},${p.y+Math.sin(deg*Math.PI/180)*8})`}/>
                  ))}
                  <circle cx={p.x} cy={p.y} r="4" fill={center} opacity=".85"/>
                </g>
              ))}
            </>
          ):(
            <circle cx="40" cy={bloomed?30:50} r={stage*4+5} fill={petal} opacity=".8"/>
          )}
        </svg>
      );
    }
    return null;
  };

  const plant=PLANT_TYPES.find(p=>p.id===plantType)||PLANT_TYPES[0];
  const labels2=["🌱 Тариалж байна","🌿 Ургаж байна","🌳 Хөгжиж байна","🌲 Цэцэглэж байна","✨ Хамгийн дээд!"];
  return(
    <div style={{textAlign:"center"}}>
      <div style={{width:95,height:95,margin:"0 auto",position:"relative",transform:`scale(${sz})`,transition:"transform .5s"}}>
        {renderPlant()}
      </div>
      <div style={{fontSize:11,fontWeight:700,color:miss===0?"#2e7d32":miss===1?"#e65100":"#c62828",marginTop:4}}>
        {miss>=3?"💀 Унасан... шинээр эхэл":miss>=1?missLabels[miss]:(_plant_labels[stage]||"✨ Хамгийн дээд!")}
      </div>
      <div style={{fontSize:10,color:"#888",marginTop:2}}>{miss>=3?"💪 Дахин чармай":`🔥 ${streak}/6 streak`}</div>
    </div>
  );
}

function StatCards({streak,grammarLearned,grammarTotal,learnedVocab,totalVocab,present,sessions,accent,card}){
  const items=[
    [streak,"🔥 Streak",accent],
    [`${grammarLearned}/${grammarTotal}`,"📖 Дүрэм",accent],
    [`${learnedVocab}/${totalVocab}`,"📚 Үг",accent],
    [`${present}/${sessions}`,"✅ Ирц",accent],
  ];
  return(
    <div style={{display:"flex",gap:6,marginTop:10}}>
      {items.map(item=>(
        <div key={item[1]} style={{flex:1,textAlign:"center",background:card,borderRadius:9,padding:"6px 3px"}}>
          <div style={{fontSize:15,fontWeight:800,color:item[2]}}>{item[0]}</div>
          <div style={{fontSize:9,color:"#888"}}>{item[1]}</div>
        </div>
      ))}
    </div>
  );
}

function AttendanceStats({present,total,allPresent,card}){
  const pct=total>0?Math.round(present/total*100):0;
  const color=pct>=80?"#2e7d32":pct>=60?"#e65100":"#c62828";
  return(
    <div style={{marginTop:6,display:"flex",gap:6}}>
      <div style={{flex:1,background:card,borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:800,color}}>{pct}%</div>
        <div style={{fontSize:9,color:"#888"}}>Энэ сарын ирц</div>
      </div>
      <div style={{flex:1,background:card,borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#555"}}>{allPresent}</div>
        <div style={{fontSize:9,color:"#888"}}>Нийт ирсэн</div>
      </div>
      <div style={{flex:1,background:card,borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:800,color:total-present>0?"#e65100":"#2e7d32"}}>{total-present}</div>
        <div style={{fontSize:9,color:"#888"}}>Ирцгүй</div>
      </div>
    </div>
  );
}

function Leaderboard({students,myId,classColor}){
  const sorted=[...students].sort((a,b)=>(b.xp||0)-(a.xp||0));
  const myRank=sorted.findIndex(s=>s.id===myId)+1;
  const top3=sorted.slice(0,3);
  const rest=sorted.slice(3);
  // podiumOrder: display positions [2nd-left, 1st-center, 3rd-right]
  const displayOrder=[1,0,2]; // indices into top3
  const podiumHeights=[75,95,55]; // heights for 2nd, 1st, 3rd
  const medals=["🥇","🥈","🥉"];
  const podiumColors=["#FFD700","#C0C0C0","#CD7F32"]; // 1st=gold, 2nd=silver, 3rd=bronze
  return(
    <div>
      {myRank>0&&<div style={{textAlign:"center",marginBottom:8,fontSize:12,color:"#888"}}>Таны байр: <b style={{color:classColor}}>#{myRank}</b> / {students.length}</div>}
      {top3.length>0&&(
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:8,marginBottom:18}}>
          {displayOrder.map((top3Idx,displayPos)=>{
            if(!top3[top3Idx])return <div key={displayPos} style={{flex:1}}/>;
            const s=top3[top3Idx];
            const rank=top3Idx+1; // actual rank: 1, 2, or 3
            const t2=getT(s.theme_id);
            const isMe=s.id===myId;
            const lvl=getLvl(s.xp||0);
            const pColor=podiumColors[top3Idx]; // color by actual rank
            const pHeight=podiumHeights[displayPos]; // height by display position
            return(
              <div key={s.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{position:"relative",marginBottom:5}}>
                  <div style={{width:rank===1?56:42,height:rank===1?56:42,borderRadius:"50%",border:`3px solid ${pColor}`,background:t2.soft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:rank===1?22:16,boxShadow:isMe?`0 0 0 3px ${classColor}`:rank===1?`0 0 10px ${pColor}88`:"none"}}>
                    {s.photo_url?<img src={s.photo_url} style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover"}} alt=""/>:t2.emoji}
                  </div>
                  <div style={{position:"absolute",top:-8,right:-8,fontSize:rank===1?18:13}}>{medals[top3Idx]}</div>
                </div>
                <div style={{fontSize:10,fontWeight:700,color:isMe?classColor:"#333",textAlign:"center",maxWidth:64,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name.split(" ")[0]}</div>
                <div style={{fontSize:9,color:"#888",marginBottom:3}}>⚡{s.xp||0} · Lv.{lvl.level}</div>
                <div style={{width:"100%",height:pHeight,background:pColor,borderRadius:"7px 7px 0 0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:rank===1?"#7c3a00":"#fff",opacity:.95}}>{rank}</div>
              </div>
            );
          })}
        </div>
      )}
      {rest.map((s,i)=>{
        const rank=i+4;
        const t2=getT(s.theme_id);
        const isMe=s.id===myId;
        const lvl=getLvl(s.xp||0);
        return(
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 10px",borderRadius:11,marginBottom:5,background:isMe?"#f0f0ff":"#f8f8f8",border:isMe?`1.5px solid ${classColor}`:"1px solid #eee"}}>
            <div style={{width:22,textAlign:"center",fontWeight:700,fontSize:12,color:"#bbb"}}>#{rank}</div>
            <div style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${t2.accent}`,background:t2.soft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>
              {s.photo_url?<img src={s.photo_url} style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover"}} alt=""/>:t2.emoji}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:12,color:isMe?classColor:"#333",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name.split(" ")[0]}{isMe?" (Та)":""}</div>
              <div style={{fontSize:9,color:"#888"}}>Lv.{lvl.level} {lvl.name}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:11,color:classColor}}>⚡{s.xp||0}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── VOCAB TAB ─────────────────────────────────────────
function VocabTab({vocabEntries,t}){
  const [selMonth,setSelMonth]=useState("all");
  const months=["all",...[...new Set(vocabEntries.map(v=>v.month))].sort().reverse()];
  const filtered=selMonth==="all"?vocabEntries:vocabEntries.filter(v=>v.month===selMonth);
  const vocabs=filtered.filter(v=>v.type==="vocab");
  const grammars=filtered.filter(v=>v.type==="grammar");
  return(
    <div style={{background:t.card,borderRadius:18,padding:16,border:`2px solid ${t.border}`}}>
      <div style={{fontWeight:700,fontSize:14,color:t.text,marginBottom:10}}>📚 Үгс & Дүрэм</div>
      {/* Month selector */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
        {months.map(mo=>(
          <button key={mo} onClick={()=>setSelMonth(mo)}
            style={bs(selMonth===mo?t.accent:"#f0f0f0",selMonth===mo?"#fff":"#555",undefined,true)}>
            {mo==="all"?"Бүгд":mo}
          </button>
        ))}
      </div>
      {/* Stats */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1,textAlign:"center",background:t.soft,borderRadius:9,padding:"6px 4px"}}>
          <div style={{fontSize:16,fontWeight:800,color:t.accent}}>{vocabs.length}</div>
          <div style={{fontSize:9,color:"#888"}}>Үг</div>
        </div>
        <div style={{flex:1,textAlign:"center",background:t.soft,borderRadius:9,padding:"6px 4px"}}>
          <div style={{fontSize:16,fontWeight:800,color:"#7c3aed"}}>{grammars.length}</div>
          <div style={{fontSize:9,color:"#888"}}>Дүрэм</div>
        </div>
      </div>
      {/* Vocab list */}
      {vocabs.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:t.accent,marginBottom:7}}>📚 Үгс ({vocabs.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {vocabs.map(v=>(
              <div key={v.id} onClick={()=>speakKr(v.word)} className="k-press"
                style={{background:t.soft,borderRadius:9,padding:"7px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"transform .15s",borderLeft:`3px solid ${t.accent}`}}
                title="Дуудлага сонсох">
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:13,color:t.text}}>{v.word}</div>
                  <div style={{fontSize:10,color:t.text,opacity:.65,marginTop:1}}>{v.meaning}</div>
                </div>
                <span style={{fontSize:11,opacity:.5,marginLeft:6}}>🔊</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Grammar list */}
      {grammars.length>0&&(
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#7c3aed",marginBottom:7}}>📖 Дүрэм ({grammars.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {grammars.map(v=>(
              <div key={v.id} onClick={()=>speakKr(v.word)} className="k-press"
                style={{background:"#f5f0ff",borderRadius:9,padding:"8px 12px",border:"1px solid #c5b8ff",cursor:"pointer",transition:"transform .15s",display:"flex",alignItems:"center",gap:8}}
                title="Дуудлага сонсох">
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:13,color:"#7c3aed",marginBottom:2}}>{v.word}</div>
                  <div style={{fontSize:11,color:"#555"}}>{v.meaning}</div>
                </div>
                <span style={{fontSize:11,opacity:.5}}>🔊</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {vocabs.length===0&&grammars.length===0&&(
        <div style={{textAlign:"center",padding:"20px 0",color:"#aaa",fontSize:13}}>Үг/дүрэм байхгүй байна</div>
      )}
    </div>
  );
}

// ── DAILY CALENDAR TAB ────────────────────────────────
// Сурагч өдрөөр ангилсан үг, дүрмээ харах
function DailyCalendarTab({vocabEntries,t,classDays}){
  const [viewMonth,setViewMonth]=useState(NOW_MONTH);
  const [selectedDate,setSelectedDate]=useState(TODAY);

  const calData=useMemo(()=>{
    const [y,m]=viewMonth.split("-").map(Number);
    const firstDay=new Date(y,m-1,1);
    const lastDay=new Date(y,m,0);
    const dim=lastDay.getDate();
    let startDow=firstDay.getDay();
    startDow=startDow===0?6:startDow-1;
    const days=[];
    for(let i=0;i<startDow;i++)days.push(null);
    for(let d=1;d<=dim;d++){
      const dateStr=`${viewMonth}-${String(d).padStart(2,"0")}`;
      // date багана байвал тэрийг ашиглана, эс бөгөөс month-ийн бүх эх хүснэгтийг өдрийн 1-нд харуулна
      const dayItems=vocabEntries.filter(v=>{
        if(v.date)return v.date===dateStr;
        if(v.month===viewMonth&&d===1)return true;
        return false;
      });
      const vocabs=dayItems.filter(v=>v.type==="vocab");
      const grammars=dayItems.filter(v=>v.type==="grammar");
      const dow=new Date(y,m-1,d).getDay();
      const mappedDow=dow===0?7:dow;
      const isLessonDay=(classDays||[]).includes(mappedDow);
      days.push({day:d,date:dateStr,vocabs,grammars,total:dayItems.length,isLessonDay,isToday:dateStr===TODAY});
    }
    return days;
  },[viewMonth,vocabEntries,classDays]);

  const selectedItems=vocabEntries.filter(v=>{
    if(v.date)return v.date===selectedDate;
    if(selectedDate.endsWith("-01")&&v.month===selectedDate.slice(0,7))return true;
    return false;
  });
  const selVocabs=selectedItems.filter(v=>v.type==="vocab");
  const selGrammars=selectedItems.filter(v=>v.type==="grammar");

  const changeMonth=(delta)=>{
    const [y,m]=viewMonth.split("-").map(Number);
    const d=new Date(y,m-1+delta,1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  };

  const monthStats=useMemo(()=>{
    const items=vocabEntries.filter(v=>{
      if(v.date)return v.date.startsWith(viewMonth);
      return v.month===viewMonth;
    });
    const dates=items.filter(v=>v.date).map(v=>v.date);
    return{
      vocab:items.filter(v=>v.type==="vocab").length,
      grammar:items.filter(v=>v.type==="grammar").length,
      days:[...new Set(dates)].length
    };
  },[viewMonth,vocabEntries]);

  return(
    <div className="k-fade" style={{background:t.card,borderRadius:18,padding:14,border:`2px solid ${t.border}`}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={()=>changeMonth(-1)} className="k-btn k-press"
          style={{background:t.soft,border:"none",borderRadius:10,padding:"6px 11px",cursor:"pointer",fontSize:14,color:t.accent,fontWeight:700}}>◀</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:800,fontSize:14,color:t.text}}>📅 {viewMonth}</div>
          <div style={{fontSize:10,color:t.text,opacity:.55}}>{monthStats.vocab} үг · {monthStats.grammar} дүрэм{monthStats.days>0?` · ${monthStats.days} өдөр`:""}</div>
        </div>
        <button onClick={()=>changeMonth(1)} className="k-btn k-press"
          style={{background:t.soft,border:"none",borderRadius:10,padding:"6px 11px",cursor:"pointer",fontSize:14,color:t.accent,fontWeight:700}}>▶</button>
      </div>

      {/* Calendar grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:14}}>
        {["Да","Мя","Лх","Пү","Ба","Бя","Ня"].map(d=>(
          <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:t.text,opacity:.5,padding:4}}>{d}</div>
        ))}
        {calData.map((day,i)=>{
          if(!day)return <div key={`empty-${i}`}/>;
          const isSelected=day.date===selectedDate;
          const hasContent=day.total>0;
          let bg=t.card,col=t.text,opacity=.5;
          if(day.isLessonDay&&!hasContent){bg=t.soft;col=t.text;opacity=.7;}
          if(hasContent){bg=t.soft;col=t.accent;opacity=1;}
          if(day.isToday){bg=t.accent;col="#fff";opacity=1;}
          if(isSelected&&!day.isToday){bg=t.card;col=t.accent;}
          return(
            <div key={day.date} onClick={()=>setSelectedDate(day.date)} className="k-press"
              style={{aspectRatio:"1",borderRadius:9,background:bg,
                border:isSelected?`2px solid ${t.accent}`:`1px solid ${t.border}`,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                cursor:"pointer",position:"relative",transition:"all .2s ease",
                transform:isSelected?"scale(1.05)":"none",
                boxShadow:day.isToday?`0 3px 10px ${t.accent}66`:isSelected?`0 2px 8px ${t.accent}44`:"none",
                opacity}}>
              <span style={{fontSize:12,fontWeight:hasContent?800:600,color:col}}>{day.day}</span>
              {hasContent&&(
                <div style={{display:"flex",gap:2,marginTop:1}}>
                  {day.vocabs.length>0&&<div style={{width:4,height:4,borderRadius:"50%",background:day.isToday?"#fff":t.accent}}/>}
                  {day.grammars.length>0&&<div style={{width:4,height:4,borderRadius:"50%",background:day.isToday?"#fff":"#7c3aed"}}/>}
                </div>
              )}
              {hasContent&&day.total>0&&(
                <div style={{position:"absolute",top:1,right:2,fontSize:8,fontWeight:800,
                  background:day.isToday?"rgba(255,255,255,.3)":t.accent,
                  color:"#fff",borderRadius:6,padding:"0 4px",lineHeight:1.3}}>{day.total}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected day detail */}
      <div key={selectedDate} className="k-slide" style={{background:t.soft,borderRadius:14,padding:13}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:t.accent,opacity:.7,textTransform:"uppercase"}}>
              {selectedDate===TODAY?"📍 Өнөөдөр":"📅 Сонгосон өдөр"}
            </div>
            <div style={{fontWeight:800,fontSize:15,color:t.text}}>{fmtDate(selectedDate)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,fontWeight:700,color:t.accent}}>{selVocabs.length} үг</div>
            <div style={{fontSize:11,fontWeight:700,color:"#7c3aed"}}>{selGrammars.length} дүрэм</div>
          </div>
        </div>

        {selVocabs.length===0&&selGrammars.length===0&&(
          <div style={{textAlign:"center",padding:"20px 0",color:t.text,opacity:.45,fontSize:13}}>
            <div style={{fontSize:30,marginBottom:6,opacity:.5}}>🌙</div>
            Тухайн өдөр шинэ зүйл үзээгүй
          </div>
        )}

        {selVocabs.length>0&&(
          <div style={{marginBottom:selGrammars.length>0?10:0}}>
            <div style={{fontSize:11,fontWeight:800,color:t.accent,marginBottom:6,display:"flex",alignItems:"center",gap:5}}>
              📚 Үгс <span style={{background:t.card,borderRadius:8,padding:"1px 7px",fontSize:10}}>{selVocabs.length}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {selVocabs.map((v,i)=>(
                <div key={v.id} onClick={()=>speakKr(v.word)} className="k-press"
                  style={{background:t.card,borderRadius:10,padding:"7px 10px",
                    borderLeft:`3px solid ${t.accent}`,cursor:"pointer",
                    animation:`kSlideIn .3s ease ${i*0.04}s both`,
                    transition:"transform .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.transform="translateX(3px)"}
                  onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontWeight:800,fontSize:14,color:t.text}}>{v.word}</div>
                    <span style={{fontSize:10,opacity:.5}}>🔊</span>
                  </div>
                  <div style={{fontSize:10,color:t.text,opacity:.6,marginTop:1}}>{v.meaning}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selGrammars.length>0&&(
          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#7c3aed",marginBottom:6,display:"flex",alignItems:"center",gap:5}}>
              📖 Дүрэм <span style={{background:t.card,borderRadius:8,padding:"1px 7px",fontSize:10}}>{selGrammars.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {selGrammars.map((v,i)=>(
                <div key={v.id}
                  style={{background:"#f5f0ff",borderRadius:10,padding:"8px 11px",
                    border:"1px solid #d4b8ff",
                    animation:`kSlideIn .3s ease ${(selVocabs.length+i)*0.04}s both`,
                    transition:"transform .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.transform="translateX(3px)"}
                  onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                  <div style={{fontWeight:800,fontSize:14,color:"#7c3aed"}}>{v.word}</div>
                  <div style={{fontSize:10,color:"#555",marginTop:1}}>{v.meaning}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TOAST ──────────────────────────────────────────────
function Toast({msg,type,onDone}){
  useEffect(()=>{
    if(!msg)return;
    const t=setTimeout(onDone,2500);
    return()=>clearTimeout(t);
  },[msg,onDone]);
  if(!msg)return null;
  const colors={success:["#43a047","#fff"],error:["#e53935","#fff"],info:["#1976d2","#fff"],warning:["#f57c00","#fff"]};
  const [bg,col]=colors[type||"success"]||colors.success;
  return(
    <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:bg,color:col,padding:"12px 22px",borderRadius:12,fontWeight:700,fontSize:13,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",zIndex:9999,animation:"kSlideUp .3s ease",maxWidth:"90vw"}}>
      {msg}
    </div>
  );
}

// ── BULK ATTENDANCE — НЭГ ДОРООС ИРЦ АВАХ ─────────────
// Багш бүх сурагчдын ирцийг тухайн өдрөөр нэг дороос авах
function BulkAttendance({students,classDays,setStudents,onClose,onToast}){
  const [date,setDate]=useState(TODAY);
  const [saving,setSaving]=useState(false);
  // Тухайн өдөр ирсэн сурагчдын ID-ийн жагсаалт
  const [present,setPresent]=useState(()=>{
    const s=new Set();
    students.forEach(st=>{if((st.attendance||{})[date])s.add(st.id);});
    return s;
  });

  // Огноо өөрчлөгдөхөд present-ийг шинэчлэх
  useEffect(()=>{
    const s=new Set();
    students.forEach(st=>{if((st.attendance||{})[date])s.add(st.id);});
    setPresent(s);
  },[date,students]);

  // Сонгосон өдөр хичээлийн өдөр уу гэдгийг шалгах
  const isLessonDay=useMemo(()=>{
    if(!classDays||!classDays.length)return true;
    const dow=new Date(date).getDay();
    const mapped=dow===0?7:dow;
    return classDays.includes(mapped);
  },[date,classDays]);

  const toggle=(sid)=>{
    setPresent(prev=>{
      const next=new Set(prev);
      if(next.has(sid))next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const allOn=()=>setPresent(new Set(students.map(s=>s.id)));
  const allOff=()=>setPresent(new Set());

  const save=async()=>{
    setSaving(true);
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"};
    const updates=[];
    for(const st of students){
      const prevAtt=(st.attendance||{})[date]||false;
      const newAtt=present.has(st.id);
      if(prevAtt===newAtt)continue;
      const att={...(st.attendance||{}),[date]:newAtt};
      // Ирц шинээр тэмдэглэвэл +20 XP
      const xpDelta=newAtt&&!prevAtt?20:(!newAtt&&prevAtt?-20:0);
      const patch={attendance:att,xp:Math.max(0,(st.xp||0)+xpDelta)};
      _db.students=_db.students.map(x=>x.id===st.id?{...x,...patch}:x);
      updates.push({id:st.id,...patch});
      // Supabase patch
      try{
        await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${st.id}`,{method:"PATCH",headers:h,body:JSON.stringify(patch)});
      }catch(e){console.error("Att sync err",e);}
    }
    if(updates.length>0){
      setStudents(prev=>prev.map(s=>{
        const u=updates.find(x=>x.id===s.id);
        return u?{...s,...u}:s;
      }));
      onToast&&onToast(`✅ ${updates.length} сурагчийн ирц шинэчлэгдлээ`);
    }else{
      onToast&&onToast("ℹ️ Өөрчлөлт байхгүй","info");
    }
    setSaving(false);
    onClose();
  };

  return(
    <Overlay onClose={onClose} maxW={440}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div>
          <div style={{fontWeight:800,fontSize:16,color:"#1a1a2e"}}>📋 Хурдан ирц</div>
          <div style={{fontSize:11,color:"#888",marginTop:2}}>Нэг дороос ирц тэмдэглэх</div>
        </div>
      </div>

      {/* Date picker */}
      <div style={{background:"#f0f0ff",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
        <div style={{fontSize:11,color:"#7c3aed",fontWeight:700,marginBottom:4}}>📅 Огноо</div>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} max={TODAY}
          style={{...INP,fontSize:13,padding:"7px 10px",background:"#fff",fontWeight:600}}/>
        {!isLessonDay&&(
          <div style={{fontSize:11,color:"#e65100",marginTop:6}}>⚠️ Энэ өдөр хичээлгүй (зөвхөн ангийн өдрөөр сонгох зөв)</div>
        )}
      </div>

      {/* Bulk actions */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button onClick={allOn} className="k-btn k-press" style={bs("#e8f5e9","#2e7d32","#a5d6a7",true)}>✓ Бүгд ирсэн</button>
        <button onClick={allOff} className="k-btn k-press" style={bs("#fce4ec","#c62828","#f48fb1",true)}>✗ Цэвэрлэх</button>
        <div style={{flex:1,textAlign:"right",alignSelf:"center",fontSize:12,fontWeight:700,color:"#7c3aed"}}>
          {present.size}/{students.length}
        </div>
      </div>

      {/* Student list */}
      <div style={{maxHeight:"45vh",overflowY:"auto",marginBottom:14,marginLeft:-4,marginRight:-4}}>
        {students.length===0?(
          <div style={{textAlign:"center",padding:"30px 0",color:"#aaa",fontSize:13}}>Сурагч байхгүй</div>
        ):(
          students.map(st=>{
            const t2=getT(st.theme_id);
            const isOn=present.has(st.id);
            return(
              <div key={st.id} onClick={()=>toggle(st.id)} className="k-press"
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:11,marginBottom:6,
                  background:isOn?"#e8f5e9":"#fafafa",
                  border:isOn?"2px solid #66bb6a":"2px solid #eee",
                  cursor:"pointer",transition:"all .15s"}}>
                {/* Avatar */}
                <div style={{width:36,height:36,borderRadius:"50%",overflow:"hidden",
                  border:`2px solid ${t2.accent}`,background:t2.soft,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>
                  {st.photo_url?<img src={st.photo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:t2.emoji}
                </div>
                {/* Name */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#1a1a2e",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.name}</div>
                  <div style={{fontSize:10,color:"#888",marginTop:1}}>
                    {TOPIK[st.level||0]} · ⚡{st.xp||0}
                  </div>
                </div>
                {/* Toggle */}
                <div style={{
                  width:28,height:28,borderRadius:"50%",flexShrink:0,
                  background:isOn?"#43a047":"#fff",
                  border:isOn?"2px solid #43a047":"2px solid #ddd",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:14,color:"#fff",fontWeight:800,
                  transition:"all .15s",
                  boxShadow:isOn?"0 3px 8px rgba(67,160,71,0.3)":"none"}}>
                  {isOn?"✓":""}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Save button */}
      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} className="k-btn" style={{...bs("#fff","#333","#e0e0e0"),flex:1,justifyContent:"center"}}>Болих</button>
        <button onClick={save} disabled={saving} className="k-btn k-press"
          style={{...bs("#2e7d32","#fff"),flex:2,justifyContent:"center",fontWeight:800,opacity:saving?.6:1}}>
          {saving?"⏳ Хадгалж байна...":`✅ Хадгалах (${present.size})`}
        </button>
      </div>
    </Overlay>
  );
}

// ════════════════════════════════════════════════════════════════
// 🎓 PRACTICE STUDIO — Солонгос хэлээ бэлдэх
// 6 төрлийн дасгал, Duolingo маягийн UI
// ════════════════════════════════════════════════════════════════

function PracticeStudio({ vocabs, grammars, t, level, onClose, onComplete, mode = "free", title }) {
  // mode: "free" | "homework" | "exam"
  // vocabs/grammars: тухайн дасгалд оруулах үгс
  // onComplete(score) — дассан үед дуудна
  const [stage, setStage] = useState("menu"); // menu | exercise | done
  const [exerciseType, setExerciseType] = useState(null);
  const [items, setItems] = useState([]); // Дасгалын items
  const [currentIdx, setCurrentIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [streak, setStreak] = useState(0); // Дараалан зөв
  const [maxStreak, setMaxStreak] = useState(0);
  const [showResult, setShowResult] = useState(null); // null | "correct" | "wrong"
  const [userAnswer, setUserAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [startTime, setStartTime] = useState(null);

  // Бүх үг (vocab+grammar)
  const allWords = useMemo(() => {
    const v = (vocabs || []).filter(x => x.word && x.meaning);
    const g = (grammars || []).filter(x => x.word && x.meaning);
    return [...v, ...g];
  }, [vocabs, grammars]);

  // Эмодиго pool — зурагтай дасгалд
  const emojiMap = {
    "сургууль": "🏫", "найз": "👫", "багш": "👩‍🏫", "ном": "📖",
    "хоол": "🍚", "ус": "💧", "сүү": "🥛", "талх": "🍞",
    "ээж": "👩", "аав": "👨", "хүүхэд": "👶", "гэр бүл": "👨‍👩‍👧",
    "нохой": "🐶", "муур": "🐱", "шувуу": "🐦", "загас": "🐟",
    "өнөөдөр": "📅", "маргааш": "⏭️", "өчигдөр": "⏮️",
    "сайн уу": "👋", "баярлалаа": "🙏", "уучлаарай": "🙇",
    "нэг": "1️⃣", "хоёр": "2️⃣", "гурав": "3️⃣", "дөрөв": "4️⃣", "тав": "5️⃣",
    "цаг": "🕐", "өдөр": "☀️", "шөнө": "🌙", "өглөө": "🌅", "орой": "🌆",
    "усанд орох": "🛁", "идэх": "🍴", "уух": "🥤", "унтах": "😴",
  };
  const getEmoji = (meaning) => {
    const m = (meaning || "").toLowerCase().trim();
    for (const k of Object.keys(emojiMap)) {
      if (m.includes(k) || k.includes(m)) return emojiMap[k];
    }
    return "✨";
  };

  // ═══ Дасгал эхлүүлэх ═══
  const startExercise = (type) => {
    if (allWords.length < 1) return;
    setExerciseType(type);
    setCurrentIdx(0);
    setCorrectCount(0);
    setWrongCount(0);
    setStreak(0);
    setMaxStreak(0);
    setShowResult(null);
    setUserAnswer("");
    setShowHint(false);
    setStartTime(Date.now());

    // Дасгалын items үүсгэх
    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    const itemCount = Math.min(allWords.length, type === "matching" ? 6 : 10);
    const selected = shuffled.slice(0, itemCount);

    if (type === "matching") {
      // Matching — нэг round, олон үг
      setItems([{
        words: selected,
        // shuffled meanings
        meanings: [...selected].sort(() => Math.random() - 0.5).map(w => w.meaning),
      }]);
    } else if (type === "multiple_choice") {
      // 4 сонголттой
      setItems(selected.map(target => {
        const distractors = shuffled.filter(w => w.word !== target.word).slice(0, 3);
        const options = [...distractors.map(d => d.meaning), target.meaning].sort(() => Math.random() - 0.5);
        return { target, options };
      }));
    } else if (type === "reverse_choice") {
      // Монгол → Солонгос (4 сонголт)
      setItems(selected.map(target => {
        const distractors = shuffled.filter(w => w.word !== target.word).slice(0, 3);
        const options = [...distractors.map(d => d.word), target.word].sort(() => Math.random() - 0.5);
        return { target, options };
      }));
    } else if (type === "spelling") {
      // Солонгосоор бичих
      setItems(selected.map(target => ({ target })));
    } else if (type === "listening") {
      // Дуудлагаар сонсож бичих
      setItems(selected.map(target => ({ target })));
    } else if (type === "emoji") {
      // Эмодигоор таних
      setItems(selected.map(target => ({
        target,
        emoji: getEmoji(target.meaning),
      })));
    } else if (type === "flashcard") {
      setItems(selected.map(target => ({ target, flipped: false })));
    }

    setStage("exercise");
  };

  // ═══ Хариулт шалгах ═══
  const submitAnswer = (answer, correct) => {
    const isRight = String(answer).trim().toLowerCase() === String(correct).trim().toLowerCase();
    setShowResult(isRight ? "correct" : "wrong");
    if (isRight) {
      setCorrectCount(c => c + 1);
      setStreak(s => {
        const ns = s + 1;
        setMaxStreak(m => Math.max(m, ns));
        return ns;
      });
      // Tactile + sound
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
    } else {
      setWrongCount(c => c + 1);
      setStreak(0);
      try { if (navigator.vibrate) navigator.vibrate([30, 30, 30]); } catch (e) {}
    }
    setTimeout(() => {
      setShowResult(null);
      setUserAnswer("");
      setShowHint(false);
      if (currentIdx + 1 >= items.length) {
        finishExercise(correctCount + (isRight ? 1 : 0));
      } else {
        setCurrentIdx(i => i + 1);
      }
    }, isRight ? 800 : 1500);
  };

  // ═══ Дасгал дуусгах ═══
  const finishExercise = (finalCorrect) => {
    const total = items.length;
    const score = total > 0 ? Math.round((finalCorrect / total) * 100) : 0;
    setStage("done");
    if (onComplete) {
      const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
      onComplete({ score, correct: finalCorrect, total, exerciseType, elapsed, maxStreak });
    }
  };

  // ═══ Header ═══
  const Header = ({ subtitle }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "0 4px" }}>
      <button onClick={() => stage === "menu" ? onClose() : setStage("menu")}
        className="k-btn k-press"
        style={{ background: "#fff", color: t.text, border: `2px solid ${t.border}`, borderRadius: 12, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        {stage === "menu" ? "← Хаах" : "← Цэс"}
      </button>
      <div style={{ flex: 1, textAlign: "center", padding: "0 8px" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{title || "Бэлдэх"}</div>
        {subtitle && <div style={{ fontSize: 10, color: t.text, opacity: .65 }}>{subtitle}</div>}
      </div>
      <div style={{ minWidth: 60, textAlign: "right" }}>
        {stage === "exercise" && (
          <div style={{ fontSize: 13, fontWeight: 800, color: t.accent }}>{currentIdx + 1}/{items.length}</div>
        )}
      </div>
    </div>
  );

  // ═══ Progress bar ═══
  const ProgressBar = () => {
    const pct = items.length > 0 ? ((currentIdx) / items.length) * 100 : 0;
    return (
      <div style={{ height: 8, background: t.soft, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${t.accent}, ${t.accent}cc)`, transition: "width .4s ease", borderRadius: 6 }} />
      </div>
    );
  };

  // ═══ Streak indicator ═══
  const StreakBadge = () => streak >= 3 ? (
    <div className="k-pop" style={{ position: "absolute", top: 10, right: 10, background: "linear-gradient(135deg,#ff9800,#f57c00)", color: "#fff", padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800, boxShadow: "0 4px 12px rgba(245,124,0,0.4)" }}>
      🔥 {streak}
    </div>
  ) : null;

  // ═══ Result feedback ═══
  const ResultFeedback = () => {
    if (!showResult) return null;
    const isOk = showResult === "correct";
    return (
      <div className="k-pop" style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: isOk ? "linear-gradient(180deg, #c8e6c9 0%, #a5d6a7 100%)" : "linear-gradient(180deg, #ffcdd2 0%, #ef9a9a 100%)",
        padding: "18px 20px",
        zIndex: 1000,
        textAlign: "center",
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        boxShadow: "0 -10px 30px rgba(0,0,0,0.15)",
      }}>
        <div style={{ fontSize: 36, marginBottom: 4 }}>{isOk ? "🎉" : "💔"}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: isOk ? "#1b5e20" : "#b71c1c" }}>
          {isOk ? "Зөв! +5 XP" : `Уучлаарай. Зөв хариу: ${items[currentIdx]?.target?.meaning || items[currentIdx]?.target?.word || ""}`}
        </div>
      </div>
    );
  };

  // ═══ MENU (Дасгалын төрөл сонгох) ═══
  if (stage === "menu") {
    const exerciseTypes = [
      { id: "flashcard", emoji: "🎴", title: "Flashcard", desc: "Үг харах, эргүүлж шалгах", color: "#42a5f5" },
      { id: "multiple_choice", emoji: "✅", title: "Сонголт", desc: "4 хариунаас зөвийг сонго", color: "#66bb6a" },
      { id: "reverse_choice", emoji: "🔄", title: "Монгол → Солонгос", desc: "Эсрэг чиглэлд таних", color: "#ab47bc" },
      { id: "spelling", emoji: "⌨️", title: "Үсэглэх", desc: "Солонгосоор бичих", color: "#ff7043" },
      { id: "listening", emoji: "👂", title: "Сонсох", desc: "Дуудлагыг сонсож бичих", color: "#ec407a" },
      { id: "emoji", emoji: "🎨", title: "Зурагтай", desc: "Эмодигоор таних", color: "#26a69a" },
    ];

    return (
      <div style={{ minHeight: "100vh", background: t.bg, padding: 14, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto" }}>
        <Header subtitle={`${allWords.length} үг бэлэн`} />

        {/* Welcome card */}
        <div className="k-fade" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`, color: "#fff", borderRadius: 18, padding: 18, marginBottom: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ fontSize: 28, marginBottom: 4 }} className="k-bouncy">🌸</div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Сайн уу!</div>
          <div style={{ fontSize: 13, opacity: 0.95, marginTop: 3 }}>Ямар дасгалаар бэлдмээр байна?</div>
          <div style={{ position: "absolute", top: -20, right: -20, fontSize: 100, opacity: 0.15 }}>📚</div>
        </div>

        {/* Дасгалын төрөл grid */}
        {allWords.length === 0 ? (
          <div style={{ background: t.card, borderRadius: 16, padding: 30, textAlign: "center", border: `2px dashed ${t.border}` }}>
            <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.5 }}>📭</div>
            <div style={{ fontSize: 14, color: t.text, fontWeight: 700 }}>Үг байхгүй байна</div>
            <div style={{ fontSize: 11, color: t.text, opacity: 0.6, marginTop: 4 }}>Багш үг нэмсний дараа бэлдэх боломжтой</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {exerciseTypes.map((ex, i) => (
              <div key={ex.id} onClick={() => startExercise(ex.id)}
                className="k-card-hover"
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: 14,
                  border: `2px solid ${ex.color}33`,
                  borderTop: `4px solid ${ex.color}`,
                  cursor: "pointer",
                  animation: `kSlideUp .35s ease ${i * 0.05}s both`,
                  textAlign: "center",
                }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>{ex.emoji}</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#1a1a2e" }}>{ex.title}</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 2, lineHeight: 1.3 }}>{ex.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: t.text, opacity: 0.5 }}>
          화이팅! 🌸 Чадна!
        </div>
      </div>
    );
  }

  // ═══ DONE (Үр дүн) ═══
  if (stage === "done") {
    const total = items.length;
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
    const isGreat = score >= 80;
    const isGood = score >= 60;

    return (
      <div style={{ minHeight: "100vh", background: t.bg, padding: 14, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto" }}>
        <div className="k-pop" style={{ background: "#fff", borderRadius: 22, padding: 24, textAlign: "center", border: `2px solid ${t.border}`, marginTop: 20 }}>
          <div className="k-bouncy" style={{ fontSize: 70, marginBottom: 10 }}>
            {isGreat ? "🏆" : isGood ? "🎉" : "💪"}
          </div>
          <div style={{ fontWeight: 900, fontSize: 22, color: t.accent, marginBottom: 4 }}>
            {isGreat ? "Гайхалтай!" : isGood ? "Сайн хийсэн!" : "Үргэлжлүүл!"}
          </div>
          <div style={{ fontSize: 13, color: t.text, opacity: 0.7, marginBottom: 18 }}>
            {isGreat ? "Тогтоосон даалгавраа гайхалтай хийсэн!" : isGood ? "Сайн ажиллалаа, илүү дадлагалъя!" : "Бууж өгөхгүй, дахин оролд!"}
          </div>

          {/* Score */}
          <div style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
            <div style={{ color: "#fff", fontSize: 14, opacity: 0.9, fontWeight: 700 }}>ОНОО</div>
            <div style={{ color: "#fff", fontSize: 44, fontWeight: 900, lineHeight: 1, marginTop: 4 }}>{score}<span style={{ fontSize: 22 }}>/100</span></div>
            <div style={{ color: "#fff", fontSize: 12, opacity: 0.9, marginTop: 6 }}>{correctCount} зөв / {total} нийт</div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ background: t.soft, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: t.text, opacity: 0.7, fontWeight: 700 }}>🔥 MAX STREAK</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: t.accent }}>{maxStreak}</div>
            </div>
            <div style={{ background: t.soft, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: t.text, opacity: 0.7, fontWeight: 700 }}>⏱️ ХУГАЦАА</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: t.accent }}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStage("menu")} className="k-btn k-press"
              style={{ flex: 1, background: "#fff", color: t.accent, border: `2px solid ${t.accent}`, borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              🔄 Дахин
            </button>
            <button onClick={onClose} className="k-btn k-press"
              style={{ flex: 1, background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: `0 4px 0 ${t.border}` }}>
              ✅ Дуусгах
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ EXERCISES ═══
  const current = items[currentIdx];
  if (!current) return null;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, padding: 14, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <Header />
      <ProgressBar />
      <div style={{ position: "relative" }}>
        <StreakBadge />

        {/* ── FLASHCARD ── */}
        {exerciseType === "flashcard" && (
          <FlashcardExercise current={current} t={t} speakKr={speakKr}
            onNext={(known) => {
              if (known) setCorrectCount(c => c + 1);
              else setWrongCount(c => c + 1);
              if (currentIdx + 1 >= items.length) {
                finishExercise(correctCount + (known ? 1 : 0));
              } else {
                setCurrentIdx(i => i + 1);
              }
            }} />
        )}

        {/* ── MULTIPLE CHOICE (Solongos → Mongol) ── */}
        {exerciseType === "multiple_choice" && (
          <MCExercise current={current} t={t} speakKr={speakKr}
            questionKey="word" answerKey="meaning"
            label="Энэ үгийн утгыг сонго:"
            showResult={showResult}
            onSubmit={(ans) => submitAnswer(ans, current.target.meaning)} />
        )}

        {/* ── REVERSE CHOICE (Mongol → Solongos) ── */}
        {exerciseType === "reverse_choice" && (
          <MCExercise current={current} t={t} speakKr={speakKr}
            questionKey="meaning" answerKey="word"
            label="Дараах монгол үгэнд тохирох солонгос үгийг сонго:"
            noAudio={true}
            showResult={showResult}
            onSubmit={(ans) => submitAnswer(ans, current.target.word)} />
        )}

        {/* ── SPELLING (Үсэглэх) ── */}
        {exerciseType === "spelling" && (
          <SpellingExercise current={current} t={t} speakKr={speakKr}
            userAnswer={userAnswer} setUserAnswer={setUserAnswer}
            showHint={showHint} setShowHint={setShowHint}
            showResult={showResult}
            onSubmit={() => submitAnswer(userAnswer, current.target.word)} />
        )}

        {/* ── LISTENING (Сонсох) ── */}
        {exerciseType === "listening" && (
          <ListeningExercise current={current} t={t} speakKr={speakKr}
            userAnswer={userAnswer} setUserAnswer={setUserAnswer}
            showResult={showResult}
            onSubmit={() => submitAnswer(userAnswer, current.target.word)} />
        )}

        {/* ── EMOJI ── */}
        {exerciseType === "emoji" && (
          <EmojiExercise current={current} t={t}
            allWords={allWords}
            showResult={showResult}
            onSubmit={(ans) => submitAnswer(ans, current.target.meaning)} />
        )}
      </div>

      <ResultFeedback />
    </div>
  );
}

// ═══ Дэд компонентууд ═══

function FlashcardExercise({ current, t, speakKr, onNext }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="k-pop" key={current.target.word} style={{ animation: "kPop .35s cubic-bezier(0.34,1.56,0.64,1)" }}>
      <div onClick={() => setFlipped(f => !f)} style={{
        background: flipped ? t.accent : "#fff",
        color: flipped ? "#fff" : t.text,
        borderRadius: 22,
        padding: "40px 24px",
        textAlign: "center",
        cursor: "pointer",
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: `3px solid ${t.border}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        transition: "all 0.4s ease",
      }}>
        <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
          {flipped ? "ХАРИУ" : "ҮГ"}
        </div>
        <div style={{ fontSize: flipped ? 30 : 44, fontWeight: 900, marginBottom: 14, lineHeight: 1.2 }}>
          {flipped ? current.target.meaning : current.target.word}
        </div>
        {!flipped && (
          <button onClick={(e) => { e.stopPropagation(); speakKr(current.target.word); }}
            className="k-btn k-press"
            style={{ background: t.soft, color: t.accent, border: "none", borderRadius: 12, padding: "8px 14px", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>
            🔊 Сонсох
          </button>
        )}
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 16, fontWeight: 600 }}>
          {flipped ? "Дахин дарж эргүүл" : "👆 Дарж эргүүл"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => onNext(false)} className="k-btn k-press"
          style={{ flex: 1, background: "#ffcdd2", color: "#c62828", border: "none", borderRadius: 14, padding: "14px", fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 0 #ef9a9a" }}>
          😅 Мэдэхгүй
        </button>
        <button onClick={() => onNext(true)} className="k-btn k-press"
          style={{ flex: 1, background: "#c8e6c9", color: "#2e7d32", border: "none", borderRadius: 14, padding: "14px", fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 0 #a5d6a7" }}>
          ✅ Мэднэ
        </button>
      </div>
    </div>
  );
}

function MCExercise({ current, t, speakKr, questionKey, answerKey, label, noAudio, showResult, onSubmit }) {
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
        <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: t.text, marginBottom: 12, lineHeight: 1.2 }}>
          {current.target[questionKey]}
        </div>
        {!noAudio && (
          <button onClick={() => speakKr(current.target.word)} className="k-btn k-press"
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
                background: bg, color: col,
                border: `2px solid ${border}`,
                borderRadius: 14, padding: "16px 12px",
                fontSize: 15, fontWeight: 700,
                textAlign: "center",
                cursor: selected !== null ? "default" : "pointer",
                transition: "all 0.2s",
                animation: `kSlideUp .3s ease ${i * 0.05}s both`,
              }}>
              {opt}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpellingExercise({ current, t, speakKr, userAnswer, setUserAnswer, showHint, setShowHint, showResult, onSubmit }) {
  return (
    <div key={current.target.word}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "30px 20px", textAlign: "center", marginBottom: 14, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>МОНГОЛООР</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: t.text, marginBottom: 14, lineHeight: 1.2 }}>
          {current.target.meaning}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, color: t.text }}>👇 Солонгос үгээ бичнэ үү</div>
      </div>

      <input
        type="text"
        value={userAnswer}
        onChange={e => setUserAnswer(e.target.value)}
        onKeyDown={e => e.key === "Enter" && userAnswer.trim() && onSubmit()}
        placeholder="한국어"
        disabled={!!showResult}
        autoFocus
        style={{
          width: "100%",
          padding: "16px 20px",
          borderRadius: 14,
          border: `2px solid ${t.border}`,
          fontSize: 22,
          fontWeight: 700,
          textAlign: "center",
          outline: "none",
          marginBottom: 12,
          background: "#fff",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShowHint(true)} className="k-btn k-press"
          style={{ background: t.soft, color: t.accent, border: "none", borderRadius: 12, padding: "12px", fontWeight: 700, fontSize: 12, cursor: "pointer", flex: 1 }}>
          💡 Сэжүүр
        </button>
        <button onClick={onSubmit} disabled={!userAnswer.trim() || !!showResult} className="k-btn k-press"
          style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", flex: 2, opacity: userAnswer.trim() ? 1 : 0.5, boxShadow: `0 4px 0 ${t.border}` }}>
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

function ListeningExercise({ current, t, speakKr, userAnswer, setUserAnswer, showResult, onSubmit }) {
  useEffect(() => {
    // автоматаар сонсуулна
    const tm = setTimeout(() => speakKr(current.target.word), 300);
    return () => clearTimeout(tm);
  }, [current]);

  return (
    <div key={current.target.word}>
      <div style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`, color: "#fff", borderRadius: 22, padding: "50px 20px", textAlign: "center", marginBottom: 14, position: "relative" }}>
        <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>СОНСООД БИЧИХ</div>
        <button onClick={() => speakKr(current.target.word)} className="k-btn k-press"
          style={{ background: "#fff", color: t.accent, border: "none", borderRadius: "50%", width: 80, height: 80, fontSize: 36, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
          🔊
        </button>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 14, fontWeight: 600 }}>👆 Дахин сонсох</div>
      </div>

      <input
        type="text"
        value={userAnswer}
        onChange={e => setUserAnswer(e.target.value)}
        onKeyDown={e => e.key === "Enter" && userAnswer.trim() && onSubmit()}
        placeholder="Сонссон үгээ бичнэ үү..."
        disabled={!!showResult}
        autoFocus
        style={{
          width: "100%",
          padding: "16px 20px",
          borderRadius: 14,
          border: `2px solid ${t.border}`,
          fontSize: 20,
          fontWeight: 700,
          textAlign: "center",
          outline: "none",
          marginBottom: 12,
          background: "#fff",
        }}
      />

      <button onClick={onSubmit} disabled={!userAnswer.trim() || !!showResult} className="k-btn k-press"
        style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, fontSize: 14, cursor: "pointer", width: "100%", opacity: userAnswer.trim() ? 1 : 0.5, boxShadow: `0 4px 0 ${t.border}` }}>
        ✓ Шалгах
      </button>
    </div>
  );
}

function EmojiExercise({ current, t, allWords, showResult, onSubmit }) {
  const [selected, setSelected] = useState(null);
  // 4 сонголт
  const options = useMemo(() => {
    const others = allWords.filter(w => w.word !== current.target.word).sort(() => Math.random() - 0.5).slice(0, 3);
    return [...others.map(o => o.meaning), current.target.meaning].sort(() => Math.random() - 0.5);
  }, [current]);
  useEffect(() => { setSelected(null); }, [current]);

  const handleClick = (opt) => {
    if (selected !== null || showResult) return;
    setSelected(opt);
    setTimeout(() => onSubmit(opt), 200);
  };

  return (
    <div key={current.target.word}>
      <div style={{ background: "#fff", borderRadius: 22, padding: "40px 20px", textAlign: "center", marginBottom: 14, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 80, marginBottom: 10 }} className="k-float">{current.emoji}</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: t.text }}>{current.target.word}</div>
        <div style={{ fontSize: 11, opacity: 0.7, color: t.text, marginTop: 8, fontWeight: 700 }}>Энэ үгийн утгыг сонго</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {options.map((opt, i) => {
          const isSel = selected === opt;
          const isCorrect = showResult && opt === current.target.meaning;
          const isWrong = showResult === "wrong" && isSel;
          let bg = "#fff", col = t.text, border = t.border;
          if (isCorrect) { bg = "#c8e6c9"; col = "#1b5e20"; border = "#66bb6a"; }
          else if (isWrong) { bg = "#ffcdd2"; col = "#b71c1c"; border = "#e57373"; }
          else if (isSel) { bg = t.soft; col = t.accent; border = t.accent; }
          return (
            <div key={i} onClick={() => handleClick(opt)} className="k-press"
              style={{
                background: bg, color: col,
                border: `2px solid ${border}`,
                borderRadius: 14, padding: "14px 10px",
                fontSize: 14, fontWeight: 700,
                textAlign: "center",
                cursor: selected !== null ? "default" : "pointer",
                transition: "all 0.2s",
                animation: `kSlideUp .3s ease ${i * 0.05}s both`,
              }}>
              {opt}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 📝 HOMEWORK & EXAM SYSTEM
// ════════════════════════════════════════════════════════════════

// ── Date helper ────────────────────────────────────────
const _fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
};

// ════════════════════════════════════════════════════════════════
// 📝 BAGSH — Даалгавар үүсгэх
// ════════════════════════════════════════════════════════════════
function CreateHomeworkModal({ cls, vocabEntries, students, teacherId, onClose, onCreated, onToast }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  });
  const [scopeDate, setScopeDate] = useState(TODAY); // Тухайн өдрийн үгсээс
  const [xpReward, setXpReward] = useState(30);
  const [saving, setSaving] = useState(false);

  // scopeDate-ийн үгс
  const scopeVocabs = vocabEntries.filter(v => v.date === scopeDate);
  const availableDates = useMemo(() => {
    const dates = [...new Set(vocabEntries.filter(v => v.date).map(v => v.date))].sort().reverse();
    return dates;
  }, [vocabEntries]);

  const submit = async () => {
    if (!title.trim()) {
      onToast && onToast("❌ Гарчиг шаардлагатай", "error");
      return;
    }
    if (scopeVocabs.length === 0) {
      onToast && onToast("❌ Тухайн өдөр үг байхгүй байна", "error");
      return;
    }
    setSaving(true);
    const hw = {
      id: `hw${Date.now()}`,
      class_id: cls.id,
      teacher_id: teacherId,
      title: title.trim(),
      description: description.trim() || null,
      file_url: fileUrl.trim() || null,
      file_name: fileName.trim() || null,
      vocab_ids: scopeVocabs.map(v => v.id),
      due_date: dueDate,
      xp_reward: xpReward,
    };
    try {
      const h = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };
      const r = await fetch(`${SUPA_URL}/rest/v1/homeworks`, { method: "POST", headers: h, body: JSON.stringify(hw) });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t.slice(0, 100));
      }
      onCreated && onCreated(hw);
      onToast && onToast("✅ Даалгавар өгсөн", "success");
      onClose();
    } catch (e) {
      console.error("HW create err", e);
      onToast && onToast("❌ Алдаа гарлаа: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose} maxW={420}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 24 }}>📝</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>Гэрийн даалгавар өгөх</div>
          <div style={{ fontSize: 11, color: "#888" }}>{cls.name} · {students.length} сурагч</div>
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>📌 ГАРЧИГ</div>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Жишээ нь: Сарын 16-ны үгсээ цээжлэх"
          style={INP} />
      </div>

      {/* Scope date */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>📅 ҮГИЙН ХАМРАХ ӨДӨР</div>
        {availableDates.length === 0 ? (
          <div style={{ background: "#fff3cd", border: "1px solid #ffe082", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#b8860b" }}>
            ⚠️ Үг нэмээгүй байна
          </div>
        ) : (
          <select value={scopeDate} onChange={e => setScopeDate(e.target.value)}
            style={{ ...INP, cursor: "pointer" }}>
            {availableDates.map(d => {
              const cnt = vocabEntries.filter(v => v.date === d).length;
              return <option key={d} value={d}>{d} — {cnt} үг</option>;
            })}
          </select>
        )}
        {scopeVocabs.length > 0 && (
          <div style={{ marginTop: 6, background: "#f5f0ff", borderRadius: 10, padding: 8, fontSize: 11, color: "#7c3aed" }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>🎯 {scopeVocabs.length} үг/дүрэм оруулна:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {scopeVocabs.slice(0, 10).map(v => (
                <span key={v.id} style={{ background: "#fff", borderRadius: 6, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>
                  {v.word}
                </span>
              ))}
              {scopeVocabs.length > 10 && <span style={{ fontSize: 10, opacity: 0.7 }}>+{scopeVocabs.length - 10}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Due date */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>⏰ ДУУСАХ ХУГАЦАА</div>
        <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          style={INP} />
      </div>

      {/* Description */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>📋 ЗААВАРЧИЛГАА (заавал биш)</div>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Жишээ: 30 минут хичээллээрэй, бүх үгээ зөв болгоорой..."
          rows={3}
          style={{ ...INP, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      {/* File URL (optional) */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>📎 ФАЙЛЫН ХОЛБООС (заавал биш)</div>
        <input value={fileUrl} onChange={e => setFileUrl(e.target.value)}
          placeholder="https://drive.google.com/... эсвэл бусад"
          style={INP} />
        {fileUrl && (
          <input value={fileName} onChange={e => setFileName(e.target.value)}
            placeholder="Файлын нэр (жишээ нь: Сонсох дасгал.mp3)"
            style={{ ...INP, marginTop: 6, fontSize: 12 }} />
        )}
      </div>

      {/* XP reward */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>⚡ XP ШАГНАЛ</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[20, 30, 50, 80, 100].map(x => (
            <button key={x} onClick={() => setXpReward(x)} className="k-btn k-press"
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 10,
                border: xpReward === x ? "2px solid #7c3aed" : "2px solid #e0e0e0",
                background: xpReward === x ? "#f5f0ff" : "#fff",
                color: xpReward === x ? "#7c3aed" : "#666",
                fontWeight: 800, fontSize: 13, cursor: "pointer"
              }}>
              +{x}
            </button>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} className="k-btn k-press"
          style={{ ...bs("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={submit} disabled={saving || !title.trim() || scopeVocabs.length === 0} className="k-btn k-press"
          style={{ ...bs("#7c3aed", "#fff"), flex: 2, justifyContent: "center", fontWeight: 800, opacity: (saving || !title.trim() || scopeVocabs.length === 0) ? 0.5 : 1, boxShadow: "0 4px 0 #5b21b6" }}>
          {saving ? "⏳ Илгээж байна..." : "📤 Даалгавар өгөх"}
        </button>
      </div>
    </Overlay>
  );
}

// ════════════════════════════════════════════════════════════════
// 📋 BAGSH — Даалгаваруудын жагсаалт + хэн хийсэн
// ════════════════════════════════════════════════════════════════
function HomeworkListModal({ cls, students, vocabEntries, homeworks, submissions, isSuperAdmin, currentTeacherId, onClose, onRefresh, onToast }) {
  const [selHw, setSelHw] = useState(null);

  // Тухайн ангид харьяалагдах даалгаврууд
  const classHws = homeworks.filter(hw => hw.class_id === cls.id).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Сонгосон даалгавар
  if (selHw) {
    const subs = submissions.filter(s => s.homework_id === selHw.id);
    const completedIds = new Set(subs.map(s => s.student_id));
    const completed = students.filter(s => completedIds.has(s.id));
    const pending = students.filter(s => !completedIds.has(s.id));
    const pct = students.length > 0 ? Math.round((completed.length / students.length) * 100) : 0;

    const deleteHw = async () => {
      if (!window.confirm("Энэ даалгаврыг устгах уу?")) return;
      try {
        const h = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` };
        await fetch(`${SUPA_URL}/rest/v1/homework_submissions?homework_id=eq.${selHw.id}`, { method: "DELETE", headers: h });
        await fetch(`${SUPA_URL}/rest/v1/homeworks?id=eq.${selHw.id}`, { method: "DELETE", headers: h });
        onRefresh && onRefresh();
        onToast && onToast("✅ Устгагдлаа", "success");
        setSelHw(null);
      } catch (e) {
        onToast && onToast("❌ Алдаа: " + e.message, "error");
      }
    };

    const isOwner = selHw.teacher_id === currentTeacherId || isSuperAdmin;
    const isOverdue = new Date(selHw.due_date) < new Date();

    return (
      <Overlay onClose={onClose} maxW={440}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setSelHw(null)} className="k-btn k-press" style={bs("#f0f0f0", "#555", undefined, true)}>← Буцах</button>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 14, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selHw.title}</div>
          {isOwner && (
            <button onClick={deleteHw} className="k-btn k-press" style={bs("#fff0f0", "#e53935", "#ffcdd2", true)}>🗑️</button>
          )}
        </div>

        {/* Info */}
        <div style={{ background: "#f5f0ff", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 6 }}>⏰ ДУУСАХ: {_fmtDateTime(selHw.due_date)}</div>
          <div style={{ fontSize: 11, color: "#7c3aed", marginBottom: 4 }}>⚡ XP: +{selHw.xp_reward || 30}</div>
          <div style={{ fontSize: 11, color: "#7c3aed" }}>📚 {(selHw.vocab_ids || []).length} үг/дүрэм</div>
          {selHw.description && (
            <div style={{ marginTop: 8, padding: 8, background: "#fff", borderRadius: 8, fontSize: 12, color: "#555", lineHeight: 1.5 }}>
              {selHw.description}
            </div>
          )}
          {selHw.file_url && (
            <a href={selHw.file_url} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 8, padding: "6px 10px", background: "#fff", borderRadius: 8, fontSize: 11, color: "#7c3aed", fontWeight: 700, textDecoration: "none", border: "1px solid #d4b8ff" }}>
              📎 {selHw.file_name || "Файл татах"}
            </a>
          )}
        </div>

        {/* Progress */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 12, marginBottom: 12, border: "2px solid #e0e0e0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#1a1a2e" }}>📊 Гүйцэтгэл</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#43a047" }}>{completed.length}/{students.length} ({pct}%)</div>
          </div>
          <div style={{ height: 10, background: "#f0f0f0", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,#66bb6a,#43a047)`, transition: "width .6s ease" }} />
          </div>
        </div>

        {/* Lists */}
        <div style={{ maxHeight: "40vh", overflowY: "auto", marginLeft: -4, marginRight: -4 }}>
          {completed.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#43a047", marginBottom: 6, paddingLeft: 4 }}>✅ ХИЙСЭН ({completed.length})</div>
              {completed.map(s => {
                const sub = subs.find(x => x.student_id === s.id);
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, background: "#e8f5e9", borderRadius: 10, marginBottom: 4 }}>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#1b5e20" }}>{s.name}</div>
                    {sub?.score != null && <div style={{ fontSize: 12, fontWeight: 800, color: "#1b5e20" }}>{sub.score}%</div>}
                    {sub?.on_time === false && <div style={{ fontSize: 10, color: "#e65100", fontWeight: 700 }}>(хоцорсон)</div>}
                  </div>
                );
              })}
            </div>
          )}
          {pending.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: isOverdue ? "#c62828" : "#888", marginBottom: 6, paddingLeft: 4 }}>
                {isOverdue ? "❌ ХОЦОРСОН" : "⏳ ХҮЛЭЭГДЭЖ БУЙ"} ({pending.length})
              </div>
              {pending.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, background: isOverdue ? "#fff0f0" : "#fafafa", borderRadius: 10, marginBottom: 4 }}>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>📝 Даалгаврууд</div>
          <div style={{ fontSize: 11, color: "#888" }}>{classHws.length} даалгавар · {cls.name}</div>
        </div>
      </div>

      {classHws.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#aaa", fontSize: 13 }}>
          <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.5 }}>📭</div>
          Даалгавар байхгүй байна
        </div>
      ) : (
        <div style={{ maxHeight: "60vh", overflowY: "auto", marginLeft: -4, marginRight: -4 }}>
          {classHws.map(hw => {
            const subs = submissions.filter(s => s.homework_id === hw.id);
            const pct = students.length > 0 ? Math.round((subs.length / students.length) * 100) : 0;
            const isOverdue = new Date(hw.due_date) < new Date();
            return (
              <div key={hw.id} onClick={() => setSelHw(hw)} className="k-card-hover"
                style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 6, border: `2px solid ${isOverdue ? "#ffcdd2" : "#e0e0e0"}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontWeight: 800, fontSize: 14, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hw.title}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: pct >= 70 ? "#43a047" : pct >= 40 ? "#f57c00" : "#c62828" }}>{pct}%</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#888" }}>
                  <span>⏰ {_fmtDateTime(hw.due_date)}</span>
                  {isOverdue && <span style={{ background: "#fff0f0", color: "#c62828", padding: "1px 6px", borderRadius: 6, fontWeight: 700 }}>Дууссан</span>}
                </div>
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

// ════════════════════════════════════════════════════════════════
// 🎓 SURAGCH — Даалгавар хийх (нэг даалгавар сонгох)
// ════════════════════════════════════════════════════════════════
function StudentHomeworkCard({ hw, vocabEntries, isCompleted, submission, t, onStart }) {
  const isOverdue = new Date(hw.due_date) < new Date();
  const hwVocabs = vocabEntries.filter(v => (hw.vocab_ids || []).includes(v.id));

  let bg = t.card, borderC = t.border, status = null;
  if (isCompleted) {
    bg = "#e8f5e9"; borderC = "#66bb6a"; status = { text: "✅ Хийсэн", color: "#1b5e20" };
  } else if (isOverdue) {
    bg = "#ffebee"; borderC = "#ef9a9a"; status = { text: "⏰ Хоцорсон", color: "#c62828" };
  } else {
    status = { text: "🎯 Хийх", color: t.accent };
  }

  return (
    <div onClick={() => !isCompleted && !isOverdue && onStart(hw, hwVocabs)} className="k-card-hover"
      style={{ background: bg, borderRadius: 14, padding: 12, marginBottom: 8, border: `2px solid ${borderC}`, cursor: (isCompleted || isOverdue) ? "default" : "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 14, color: t.text }}>{hw.title}</div>
        {status && <div style={{ fontSize: 11, fontWeight: 800, color: status.color, background: "#fff", borderRadius: 8, padding: "2px 8px" }}>{status.text}</div>}
      </div>
      {hw.description && (
        <div style={{ fontSize: 11, color: t.text, opacity: 0.75, marginBottom: 6, lineHeight: 1.4 }}>
          {hw.description.length > 100 ? hw.description.slice(0, 100) + "..." : hw.description}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, color: t.text, opacity: 0.7 }}>
        <span>⏰ {_fmtDateTime(hw.due_date)}</span>
        <span>📚 {hwVocabs.length} үг</span>
        <span style={{ color: t.accent, fontWeight: 700 }}>⚡ +{hw.xp_reward || 30} XP</span>
      </div>
      {hw.file_url && (
        <a href={hw.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          style={{ display: "inline-block", marginTop: 8, padding: "5px 10px", background: "#fff", borderRadius: 8, fontSize: 11, color: t.accent, fontWeight: 700, textDecoration: "none", border: `1px solid ${t.border}` }}>
          📎 {hw.file_name || "Файл харах"}
        </a>
      )}
      {isCompleted && submission && (
        <div style={{ marginTop: 6, padding: 6, background: "#fff", borderRadius: 8, fontSize: 11, color: "#1b5e20" }}>
          Оноо: <b>{submission.score}%</b> · +{hw.xp_reward || 30} XP авсан
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 🏆 BAGSH — Шалгалт үүсгэх
// ════════════════════════════════════════════════════════════════
function CreateExamModal({ cls, vocabEntries, teacherId, onClose, onCreated, onToast }) {
  const [title, setTitle] = useState(`Шалгалт ${new Date().toLocaleDateString("mn-MN")}`);
  const [questionCount, setQuestionCount] = useState(10);
  const [duration, setDuration] = useState(10);
  const [selectedDates, setSelectedDates] = useState([TODAY]);
  const [creating, setCreating] = useState(false);

  const availableDates = useMemo(() => {
    return [...new Set(vocabEntries.filter(v => v.date).map(v => v.date))].sort().reverse();
  }, [vocabEntries]);

  const toggleDate = (d) => {
    setSelectedDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const scopedVocabs = vocabEntries.filter(v => selectedDates.includes(v.date));

  const submit = async () => {
    if (scopedVocabs.length < 3) {
      onToast && onToast("❌ Дор хаяж 3 үг сонгоно уу", "error");
      return;
    }
    setCreating(true);
    const exam = {
      id: `ex${Date.now()}`,
      class_id: cls.id,
      teacher_id: teacherId,
      title: title.trim() || "Шалгалт",
      question_count: questionCount,
      duration_minutes: duration,
      status: "pending",
      vocab_scope_dates: selectedDates,
      xp_per_correct: 5,
    };
    try {
      const h = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };
      const r = await fetch(`${SUPA_URL}/rest/v1/exams`, { method: "POST", headers: h, body: JSON.stringify(exam) });
      if (!r.ok) throw new Error(await r.text());
      onCreated && onCreated(exam);
      onToast && onToast("✅ Шалгалт бэлдсэн. 'Эхлүүлэх' дарж шалгалтыг эхлүүлээрэй.", "success");
      onClose();
    } catch (e) {
      onToast && onToast("❌ Алдаа: " + e.message, "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Overlay onClose={onClose} maxW={420}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 26 }}>🏆</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a2e" }}>Шалгалт бэлдэх</div>
          <div style={{ fontSize: 11, color: "#888" }}>AI асуулт автомат үүсгэнэ</div>
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📌 ГАРЧИГ</div>
        <input value={title} onChange={e => setTitle(e.target.value)} style={INP} />
      </div>

      {/* Vocab scope */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>📅 ҮГИЙН ХАМРАХ ӨДРҮҮД</div>
        {availableDates.length === 0 ? (
          <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 14 }}>Үг байхгүй байна</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 120, overflowY: "auto", padding: 6, background: "#fafafa", borderRadius: 10 }}>
            {availableDates.map(d => {
              const isSel = selectedDates.includes(d);
              const cnt = vocabEntries.filter(v => v.date === d).length;
              return (
                <button key={d} onClick={() => toggleDate(d)} className="k-press"
                  style={{
                    background: isSel ? "#7c3aed" : "#fff",
                    color: isSel ? "#fff" : "#555",
                    border: isSel ? "2px solid #7c3aed" : "2px solid #e0e0e0",
                    borderRadius: 8, padding: "5px 10px",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>
                  {d.slice(5)} ({cnt})
                </button>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 11, color: scopedVocabs.length >= 3 ? "#43a047" : "#c62828", fontWeight: 700 }}>
          {scopedVocabs.length >= 3 ? `✓ ${scopedVocabs.length} үг сонгогдсон` : `⚠️ Дор хаяж 3 үг хэрэгтэй (одоо ${scopedVocabs.length})`}
        </div>
      </div>

      {/* Question count */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>❓ АСУУЛТЫН ТОО ({questionCount})</div>
        <input type="range" min={5} max={30} value={questionCount} onChange={e => setQuestionCount(+e.target.value)}
          style={{ width: "100%", accentColor: "#7c3aed" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginTop: 2 }}>
          <span>5</span><span>30</span>
        </div>
      </div>

      {/* Duration */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 5 }}>⏱️ ХУГАЦАА (МИНУТ)</div>
        <div style={{ display: "flex", gap: 5 }}>
          {[5, 10, 15, 20, 30].map(m => (
            <button key={m} onClick={() => setDuration(m)} className="k-btn k-press"
              style={{
                flex: 1, padding: "8px", borderRadius: 10,
                border: duration === m ? "2px solid #7c3aed" : "2px solid #e0e0e0",
                background: duration === m ? "#f5f0ff" : "#fff",
                color: duration === m ? "#7c3aed" : "#666",
                fontWeight: 800, fontSize: 13, cursor: "pointer"
              }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} className="k-btn k-press"
          style={{ ...bs("#fff", "#333", "#e0e0e0"), flex: 1, justifyContent: "center" }}>Болих</button>
        <button onClick={submit} disabled={creating || scopedVocabs.length < 3} className="k-btn k-press"
          style={{ ...bs("#7c3aed", "#fff"), flex: 2, justifyContent: "center", fontWeight: 800, opacity: (creating || scopedVocabs.length < 3) ? 0.5 : 1, boxShadow: "0 4px 0 #5b21b6" }}>
          {creating ? "⏳ Бэлдэж байна..." : "✨ Үүсгэх"}
        </button>
      </div>
    </Overlay>
  );
}

// ════════════════════════════════════════════════════════════════
// 🔥 EXAM ROOM — Шалгалтын өрөө (багшид: эхлүүлэх, харах, үр дүн)
// ════════════════════════════════════════════════════════════════
function ExamRoomModal({ exam, cls, students, vocabEntries, examSubmissions, isOwner, onClose, onRefresh, onToast }) {
  const [starting, setStarting] = useState(false);

  const startExam = async () => {
    if (!window.confirm(`"${exam.title}" шалгалтыг ОДОО эхлүүлэх үү?\n${exam.duration_minutes} минут хүртэл өгнө.`)) return;
    setStarting(true);
    const updates = {
      status: "active",
      started_at: new Date().toISOString(),
    };
    try {
      const h = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" };
      await fetch(`${SUPA_URL}/rest/v1/exams?id=eq.${exam.id}`, { method: "PATCH", headers: h, body: JSON.stringify(updates) });
      onRefresh && onRefresh();
      onToast && onToast("🚀 Шалгалт эхэллээ! Сурагчдад автомат харагдана.", "success");
    } catch (e) {
      onToast && onToast("❌ Алдаа: " + e.message, "error");
    } finally {
      setStarting(false);
    }
  };

  const endExam = async () => {
    if (!window.confirm("Шалгалтыг дуусгах уу?")) return;
    try {
      const h = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" };
      await fetch(`${SUPA_URL}/rest/v1/exams?id=eq.${exam.id}`, {
        method: "PATCH", headers: h,
        body: JSON.stringify({ status: "finished", ended_at: new Date().toISOString() })
      });
      onRefresh && onRefresh();
      onToast && onToast("✅ Шалгалт дууслаа", "success");
    } catch (e) {
      onToast && onToast("❌ Алдаа: " + e.message, "error");
    }
  };

  const deleteExam = async () => {
    if (!window.confirm("Шалгалтыг устгах уу? Бүх үр дүн алга болно.")) return;
    try {
      const h = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` };
      await fetch(`${SUPA_URL}/rest/v1/exam_submissions?exam_id=eq.${exam.id}`, { method: "DELETE", headers: h });
      await fetch(`${SUPA_URL}/rest/v1/exams?id=eq.${exam.id}`, { method: "DELETE", headers: h });
      onRefresh && onRefresh();
      onToast && onToast("✅ Устгагдлаа", "success");
      onClose();
    } catch (e) {
      onToast && onToast("❌ Алдаа: " + e.message, "error");
    }
  };

  // Үр дүн
  const submissions = examSubmissions.filter(s => s.exam_id === exam.id);
  const sortedSubs = [...submissions].sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <Overlay onClose={onClose} maxW={440}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 26 }}>🏆</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a2e" }}>{exam.title}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{exam.question_count} асуулт · {exam.duration_minutes} минут</div>
        </div>
        {isOwner && exam.status !== "active" && (
          <button onClick={deleteExam} className="k-btn k-press" style={bs("#fff0f0", "#e53935", "#ffcdd2", true)}>🗑️</button>
        )}
      </div>

      {/* Status badge */}
      <div style={{ marginBottom: 12 }}>
        {exam.status === "pending" && (
          <div style={{ background: "#fff3cd", color: "#b8860b", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
            ⏳ Эхлүүлэхийг хүлээж байна
          </div>
        )}
        {exam.status === "active" && (
          <div style={{ background: "#e8f5e9", color: "#1b5e20", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: "center", animation: "kPulse 2s ease-in-out infinite" }}>
            🔥 ИДЭВХТЭЙ — {submissions.length}/{students.length} өгсөн
          </div>
        )}
        {exam.status === "finished" && (
          <div style={{ background: "#e3f2fd", color: "#1565c0", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
            🏁 Дууссан
          </div>
        )}
      </div>

      {/* Action buttons */}
      {isOwner && exam.status === "pending" && (
        <button onClick={startExam} disabled={starting} className="k-btn k-press"
          style={{ ...bs("#43a047", "#fff"), width: "100%", justifyContent: "center", padding: 14, fontWeight: 800, fontSize: 14, marginBottom: 12, boxShadow: "0 4px 0 #2e7d32" }}>
          {starting ? "⏳ Эхлүүлж байна..." : "🚀 ШАЛГАЛТ ЭХЛҮҮЛЭХ"}
        </button>
      )}
      {isOwner && exam.status === "active" && (
        <button onClick={endExam} className="k-btn k-press"
          style={{ ...bs("#e53935", "#fff"), width: "100%", justifyContent: "center", padding: 14, fontWeight: 800, fontSize: 14, marginBottom: 12, boxShadow: "0 4px 0 #b71c1c" }}>
          🏁 ЭРТ ДУУСГАХ
        </button>
      )}

      {/* Leaderboard (finished/active) */}
      {(exam.status === "active" || exam.status === "finished") && sortedSubs.length > 0 && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#1a1a2e", marginBottom: 8 }}>🏆 Тэргүүн жагсаалт</div>
          {/* Top 3 medal */}
          {sortedSubs.length >= 1 && exam.status === "finished" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-end", justifyContent: "center" }}>
              {sortedSubs[1] && (
                <PodiumCard rank={2} sub={sortedSubs[1]} students={students} color="#9e9e9e" emoji="🥈" />
              )}
              {sortedSubs[0] && (
                <PodiumCard rank={1} sub={sortedSubs[0]} students={students} color="#ffc107" emoji="🥇" big />
              )}
              {sortedSubs[2] && (
                <PodiumCard rank={3} sub={sortedSubs[2]} students={students} color="#bf8957" emoji="🥉" />
              )}
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

      {/* Pending students */}
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
    </Overlay>
  );
}

function PodiumCard({ rank, sub, students, color, emoji, big }) {
  const st = students.find(x => x.id === sub.student_id);
  return (
    <div className="k-pop" style={{
      flex: 1, maxWidth: big ? 130 : 100,
      background: `linear-gradient(180deg, ${color}33, ${color}11)`,
      border: `2px solid ${color}`,
      borderRadius: 14,
      padding: big ? 12 : 8,
      textAlign: "center",
      height: big ? 130 : 100,
      display: "flex", flexDirection: "column", justifyContent: "center",
    }}>
      <div style={{ fontSize: big ? 32 : 24, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontWeight: 800, fontSize: big ? 13 : 11, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st?.name || "—"}</div>
      <div style={{ fontSize: big ? 18 : 14, fontWeight: 900, color: color }}>{sub.score}%</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 🧪 SURAGCH — Шалгалт өгөх (бодит цаг)
// ════════════════════════════════════════════════════════════════
function StudentExamScreen({ exam, vocabEntries, student, t, onComplete, onToast }) {
  const [stage, setStage] = useState("loading"); // loading | exam | done
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [remainingSec, setRemainingSec] = useState((exam.duration_minutes || 10) * 60);
  const [result, setResult] = useState(null);
  const [showTranslate, setShowTranslate] = useState({}); // {wordKey: true}

  // Тухайн шалгалтын vocab
  const examVocabs = useMemo(() => {
    const dates = exam.vocab_scope_dates || [];
    return vocabEntries.filter(v => dates.includes(v.date));
  }, [exam, vocabEntries]);

  // Recent vocabs (бусад өдрөөс)
  const recentVocabs = useMemo(() => {
    const dates = exam.vocab_scope_dates || [];
    return vocabEntries.filter(v => v.date && !dates.includes(v.date)).slice(0, 15);
  }, [exam, vocabEntries]);

  // Асуултуудыг үүсгэх
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vocabs = examVocabs.filter(v => v.type !== "grammar");
      const grammars = examVocabs.filter(v => v.type === "grammar");
      try {
        const qs = await generateExamQuestions({
          vocabs,
          grammars,
          count: exam.question_count || 10,
          level: student.level || 0,
          recentVocabs,
        });
        if (cancelled) return;
        if (!qs || qs.length === 0) {
          // Fallback — гар хийц асуулт үүсгэе
          const fallback = generateFallbackQuestions(vocabs, exam.question_count || 10);
          setQuestions(fallback);
        } else {
          setQuestions(qs);
        }
        setStage("exam");
      } catch (e) {
        const fallback = generateFallbackQuestions(vocabs, exam.question_count || 10);
        setQuestions(fallback);
        setStage("exam");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Timer
  useEffect(() => {
    if (stage !== "exam") return;
    const interval = setInterval(() => {
      setRemainingSec(s => {
        if (s <= 1) {
          clearInterval(interval);
          submitExam(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const setAnswer = (val) => {
    const q = questions[currentIdx];
    setAnswers(prev => ({ ...prev, [currentIdx]: val }));
  };

  const next = () => {
    if (currentIdx + 1 >= questions.length) submitExam(false);
    else setCurrentIdx(i => i + 1);
  };

  const submitExam = async (timeOut) => {
    let correct = 0;
    const total = questions.length;
    questions.forEach((q, i) => {
      const a = (answers[i] || "").toString().trim().toLowerCase();
      const c = (q.correct || "").toString().trim().toLowerCase();
      if (a === c) {
        correct++;
      } else if (Array.isArray(q.alternatives)) {
        const alts = q.alternatives.map(x => x.toString().trim().toLowerCase());
        if (alts.includes(a)) correct++;
      }
    });
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const xpEarned = correct * (exam.xp_per_correct || 5);

    const submission = {
      id: `es${Date.now()}`,
      exam_id: exam.id,
      student_id: student.id,
      answers,
      correct_count: correct,
      total_count: total,
      score,
      xp_earned: xpEarned,
    };
    try {
      const h = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };
      await fetch(`${SUPA_URL}/rest/v1/exam_submissions`, { method: "POST", headers: h, body: JSON.stringify(submission) });
      // Student xp шинэчилэх
      const newXp = (student.xp || 0) + xpEarned;
      await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${student.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ xp: newXp }) });
      _db.students = _db.students.map(s => s.id === student.id ? { ...s, xp: newXp } : s);
    } catch (e) {
      console.error("Exam submit err", e);
    }
    setResult({ correct, total, score, xpEarned, timeOut });
    setStage("done");
    if (onComplete) onComplete({ score, xpEarned });
  };

  // ═══ LOADING ═══
  if (stage === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui" }}>
        <div className="k-bouncy" style={{ fontSize: 80, marginBottom: 16 }}>📚</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: t.text, marginBottom: 6 }}>Асуултууд бэлдэж байна...</div>
        <div style={{ fontSize: 12, color: t.text, opacity: 0.6 }}>AI-аар асуулт үүсгэж байна, түр хүлээнэ үү</div>
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: t.accent, animation: `kBounce 1s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
      </div>
    );
  }

  // ═══ DONE ═══
  if (stage === "done" && result) {
    const isGreat = result.score >= 80;
    const isGood = result.score >= 60;
    return (
      <div style={{ minHeight: "100vh", background: t.bg, padding: 16, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto" }}>
        <div className="k-pop" style={{ background: "#fff", borderRadius: 22, padding: 26, textAlign: "center", border: `2px solid ${t.border}`, marginTop: 30 }}>
          <div className="k-bouncy" style={{ fontSize: 80, marginBottom: 12 }}>
            {isGreat ? "🏆" : isGood ? "🎉" : "💪"}
          </div>
          <div style={{ fontWeight: 900, fontSize: 24, color: t.accent, marginBottom: 6 }}>
            {isGreat ? "Гайхалтай!" : isGood ? "Сайн!" : "Хичээ!"}
          </div>
          {result.timeOut && <div style={{ background: "#fff3cd", color: "#b8860b", padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, display: "inline-block", marginBottom: 10 }}>⏰ Хугацаа дууссан</div>}
          <div style={{ fontSize: 14, color: t.text, opacity: 0.7, marginBottom: 18 }}>Шалгалт амжилттай өгсөн</div>
          <div style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`, borderRadius: 16, padding: 20, marginBottom: 14 }}>
            <div style={{ color: "#fff", fontSize: 13, opacity: 0.9, fontWeight: 700 }}>ОНОО</div>
            <div style={{ color: "#fff", fontSize: 50, fontWeight: 900, lineHeight: 1, marginTop: 4 }}>{result.score}<span style={{ fontSize: 24 }}>/100</span></div>
            <div style={{ color: "#fff", fontSize: 13, opacity: 0.9, marginTop: 8 }}>{result.correct} зөв / {result.total} нийт</div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, marginTop: 10, background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 12px", display: "inline-block" }}>
              +{result.xpEarned} XP
            </div>
          </div>
          <div style={{ fontSize: 12, color: t.text, opacity: 0.6 }}>Үр дүн ангид автомат харагдана</div>
        </div>
      </div>
    );
  }

  // ═══ EXAM ═══
  if (stage !== "exam" || questions.length === 0) return null;
  const q = questions[currentIdx];
  const userAns = answers[currentIdx] || "";
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const lowTime = remainingSec < 60;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto", padding: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>📚 {currentIdx + 1}/{questions.length}</div>
        <div className={lowTime ? "k-bouncy" : ""} style={{ background: lowTime ? "#ffcdd2" : t.soft, color: lowTime ? "#c62828" : t.accent, padding: "5px 12px", borderRadius: 10, fontWeight: 800, fontSize: 14 }}>
          ⏱️ {mins}:{String(secs).padStart(2, "0")}
        </div>
      </div>

      {/* Progress */}
      <div style={{ height: 6, background: t.soft, borderRadius: 3, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${(currentIdx / questions.length) * 100}%`, background: t.accent, transition: "width .4s ease" }} />
      </div>

      {/* Question */}
      <div className="k-fade" key={currentIdx} style={{ background: "#fff", borderRadius: 18, padding: 18, marginBottom: 14, border: `2px solid ${t.border}` }}>
        <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, marginBottom: 8, letterSpacing: 1 }}>{getQuestionTypeLabel(q.type)}</div>
        <div style={{ fontSize: 14, color: t.text, marginBottom: 12, lineHeight: 1.5 }}>{q.question || q.label}</div>

        {/* Audio play if available */}
        {q.audio && (
          <button onClick={() => speakKr(q.audio)} className="k-btn k-press"
            style={{ background: t.accent, color: "#fff", border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            🔊 Сонсох
          </button>
        )}

        {/* For fill_blank/sentence with translation */}
        {q.sentence && (
          <div style={{ background: t.soft, borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 18, fontWeight: 800, color: t.text, textAlign: "center" }}>
            {q.sentence}
          </div>
        )}
        {q.prompt_text && (
          <div style={{ background: t.soft, borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 22, fontWeight: 800, color: t.text, textAlign: "center" }}>
            {q.prompt_text}
          </div>
        )}

        {/* Answer area */}
        {q.type === "multiple_choice" || q.type === "fill_blank" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(q.options || []).map((opt, i) => {
              const isSel = userAns === opt;
              return (
                <div key={i} onClick={() => setAnswer(opt)} className="k-press"
                  style={{
                    background: isSel ? t.soft : "#fff",
                    color: isSel ? t.accent : t.text,
                    border: isSel ? `2px solid ${t.accent}` : `2px solid ${t.border}`,
                    borderRadius: 12, padding: "12px 8px",
                    fontSize: 14, fontWeight: 700,
                    textAlign: "center", cursor: "pointer",
                    transition: "all .15s",
                  }}>
                  {opt}
                </div>
              );
            })}
          </div>
        ) : (
          <input value={userAns} onChange={e => setAnswer(e.target.value)} placeholder="Хариугаа бичнэ үү..."
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 16, fontWeight: 600, outline: "none", textAlign: "center", boxSizing: "border-box" }} />
        )}

        {/* Translation help (хэрэв sentence-тэй бол) */}
        {q.translation && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setShowTranslate(s => ({ ...s, [currentIdx]: !s[currentIdx] }))} className="k-btn k-press"
              style={{ background: "#fff", color: t.accent, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              💡 {showTranslate[currentIdx] ? "Нуух" : "Утга харах"}
            </button>
            {showTranslate[currentIdx] && (
              <div style={{ marginTop: 6, padding: 8, background: "#fff8e1", borderRadius: 8, fontSize: 12, color: "#b8860b" }}>
                {q.translation}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Next button */}
      <button onClick={next} disabled={!userAns}
        className="k-btn k-press"
        style={{
          width: "100%", padding: 14, borderRadius: 14, border: "none",
          background: userAns ? t.accent : "#e0e0e0",
          color: "#fff", fontWeight: 800, fontSize: 14, cursor: userAns ? "pointer" : "default",
          boxShadow: userAns ? `0 4px 0 ${t.border}` : "none",
        }}>
        {currentIdx + 1 >= questions.length ? "🏁 Дуусгах" : "Дараагийн →"}
      </button>
    </div>
  );
}

function getQuestionTypeLabel(type) {
  return ({
    multiple_choice: "🔘 СОНГОЛТ",
    translate_kr_mn: "🇰🇷 → 🇲🇳 ОРЧУУЛАХ",
    translate_mn_kr: "🇲🇳 → 🇰🇷 ОРЧУУЛАХ",
    fill_blank: "✏️ ХООСОН ЗАЙГ ГҮЙЦЭЭ",
  })[type] || "АСУУЛТ";
}

// Fallback асуулт үүсгэгч (Gemini API ажиллахгүй үед)
function generateFallbackQuestions(vocabs, count) {
  if (!vocabs || vocabs.length < 2) return [];
  const list = [...vocabs].sort(() => Math.random() - 0.5).slice(0, count);
  return list.map(target => {
    const others = vocabs.filter(v => v.word !== target.word).sort(() => Math.random() - 0.5).slice(0, 3);
    return {
      type: "multiple_choice",
      question: `${target.word}-ийн утга юу вэ?`,
      audio: target.word,
      options: [...others.map(o => o.meaning), target.meaning].sort(() => Math.random() - 0.5),
      correct: target.meaning,
    };
  });
}

function AuthScreen({onAuth}){

  const [mode,setMode]=useState("teacher");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [rd,setRd]=useState("");
  const [confirmPass,setConfirmPass]=useState("");
  const [err,setErr]=useState("");
  const [regDone,setRegDone]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const [fEmail,setFEmail]=useState("");
  const [fRd,setFRd]=useState("");
  const [fResult,setFResult]=useState(null);

  const clearForm=()=>{setEmail("");setPass("");setName("");setPhone("");setRd("");setConfirmPass("");setFEmail("");setFRd("");setFResult(null);setErr("");};

  const [loading2,setLoading2]=useState(false);

  const loginTeacher=async()=>{
    setErr("");
    setLoading2(true);
    try{
      let t2=_teachers.find(x=>x.email.toLowerCase()===email.trim().toLowerCase()&&x.password===pass);
      if(!t2){
        const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
        const em=encodeURIComponent(email.trim().toLowerCase());
        const r=await fetch(`${SUPA_URL}/rest/v1/teachers?email=eq.${em}&select=*`,{headers:h});
        const rows=await r.json();
        if(rows&&rows.length>0&&rows[0].password===pass){
          t2=rows[0];
          if(!_teachers.find(x=>x.id===t2.id))_teachers.push(t2);
        }
      }
      setLoading2(false);
      if(t2) onAuth({id:t2.id,role:"teacher",isSuperAdmin:t2.role==="superadmin",displayName:t2.name,class_ids:t2.class_ids||null});
      else setErr("И-мэйл эсвэл нууц үг буруу байна.");
    }catch(e){
      setLoading2(false);
      setErr("Холболтын алдаа гарлаа. Дахин оролдоно уу.");
    }
  };

  const loginStudent=async()=>{
    setErr("");
    setLoading2(true);
    try{
      const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
      const em=email.trim().toLowerCase();
      const r=await fetch(`${SUPA_URL}/rest/v1/students?select=*`,{headers:h});
      const rows=await r.json();
      if(!Array.isArray(rows)){
        setLoading2(false);
        setErr("Холболтын алдаа. Дахин оролдоно уу.");
        return;
      }
      const st=rows.find(s=>s.email&&s.email.toLowerCase()===em&&s.password===pass);
      if(st){
        // Бүх хэрэгтэй өгөгдлийг татна
        const [rc,rv,rp]=await Promise.all([
          fetch(`${SUPA_URL}/rest/v1/classes?select=*`,{headers:h}),
          fetch(`${SUPA_URL}/rest/v1/vocab_entries?select=*`,{headers:h}),
          fetch(`${SUPA_URL}/rest/v1/payments?select=*`,{headers:h}),
        ]);
        const [cls,voc,pays]=await Promise.all([rc.json(),rv.json(),rp.json()]);
        _db.classes=Array.isArray(cls)?cls:[];
        _db.vocab_entries=Array.isArray(voc)?voc:[];
        _db.payments=Array.isArray(pays)?pays:[];
        _db.students=rows.map(s=>({
          ...s,
          badges:Array.isArray(s.badges)?s.badges:[],
          weak_words:Array.isArray(s.weak_words)?s.weak_words:(s.weak_words?JSON.parse(s.weak_words):[]),
          attendance:s.attendance&&typeof s.attendance==="object"?s.attendance:{},
        }));
        setLoading2(false);
        onAuth({id:st.id,role:"student",displayName:st.name});
        return;
      }
      // Pending шалгана
      const r2=await fetch(`${SUPA_URL}/rest/v1/pending_students?select=*`,{headers:h});
      const prows=await r2.json();
      const pend=Array.isArray(prows)?prows.find(p=>p.email&&p.email.toLowerCase()===em):null;
      setLoading2(false);
      if(pend) setErr("Таны бүртгэл багшийн зөвшөөрлийг хүлээж байна. ⏳");
      else setErr("И-мэйл эсвэл нууц үг буруу байна.");
    }catch(e){
      setLoading2(false);
      setErr("Холболтын алдаа. Дахин оролдоно уу.");
    }
  };

  const register=async()=>{
    setErr("");
    if(!name.trim()){setErr("Нэрээ оруулна уу.");return;}
    if(!email.trim()||!email.includes("@")){setErr("И-мэйл хаяг буруу байна.");return;}
    if(!rd.trim()){setErr("Регистрийн дугаараа оруулна уу.");return;}
    if(pass.length<6){setErr("Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");return;}
    if(pass!==confirmPass){setErr("Нууц үг таарахгүй байна.");return;}
    const em=email.trim().toLowerCase();
    if(_db.students.find(s=>s.email&&s.email.toLowerCase()===em)){setErr("Энэ и-мэйл аль хэдийн бүртгэлтэй байна.");return;}
    const existIdx=_pending.findIndex(p=>p.email===em);
    const entry={id:`pnd${Date.now()}`,name:name.trim(),email:em,password:pass,rd:rd.trim().toUpperCase(),phone:phone.trim(),registered_at:TODAY};
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=representation"};
    await fetch(`${SUPA_URL}/rest/v1/pending_students`,{method:"POST",headers:h,body:JSON.stringify(entry)});
    if(existIdx>=0)_pending[existIdx]=entry;else _pending.push(entry);
    setRegDone(true);
  };

  const forgotCheck=()=>{
    setErr("");setFResult(null);
    const em=fEmail.trim().toLowerCase();
    const st=_db.students.find(s=>s.email&&s.email.toLowerCase()===em);
    if(!st){setErr("Энэ и-мэйлтэй бүртгэл олдсонгүй.");return;}
    if(!st.rd){setErr("Таны бүртгэлд РД хадгалагдаагүй. Багштайгаа холбоо барина уу.");return;}
    if(st.rd.toUpperCase()!==fRd.trim().toUpperCase()){setErr("Регистрийн дугаар буруу байна.");return;}
    setFResult({name:st.name,password:st.password});
  };

  if(regDone) return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#81c784 0%,#43a047 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",padding:16,position:"relative",overflow:"hidden"}}>
      {/* Floating background emoji */}
      <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
        {[
          {e:"🌱",x:10,y:20,size:40,delay:0,dur:6},
          {e:"🍀",x:85,y:15,size:36,delay:1,dur:5},
          {e:"🌿",x:80,y:75,size:42,delay:2,dur:7},
          {e:"✨",x:15,y:80,size:28,delay:0.5,dur:8},
          {e:"🎉",x:75,y:45,size:34,delay:1.5,dur:6},
          {e:"🌟",x:20,y:50,size:30,delay:3,dur:5},
        ].map((p,i)=>(
          <div key={i} style={{position:"absolute",left:`${p.x}%`,top:`${p.y}%`,fontSize:p.size,opacity:.5,animation:`kFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,filter:"drop-shadow(0 4px 8px rgba(0,0,0,0.1))"}}>{p.e}</div>
        ))}
      </div>
      <div className="k-pop" style={{background:"#fff",borderRadius:28,padding:"36px 28px",width:"100%",maxWidth:360,textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,.25)",position:"relative",zIndex:1}}>
        <div className="k-bouncy" style={{fontSize:72,marginBottom:14,display:"inline-block",filter:"drop-shadow(0 8px 16px rgba(67,160,71,0.3))"}}>🎉</div>
        <div style={{fontSize:22,fontWeight:900,color:"#2e7d32",marginBottom:10}}>Бүртгэл амжилттай!</div>
        <div style={{fontSize:13,color:"#555",marginBottom:8,lineHeight:1.6}}>
          Багш таны бүртгэлийг<br/>зөвшөөрсний дараа<br/>нэвтрэх боломжтой болно.
        </div>
        <div style={{background:"linear-gradient(135deg,#e8f5e9,#c8e6c9)",border:"2px dashed #66bb6a",borderRadius:14,padding:"12px 16px",marginBottom:22,fontSize:13,color:"#2e7d32",fontWeight:700,wordBreak:"break-all"}}>
          📧 {email}
        </div>
        <button onClick={()=>{setRegDone(false);setMode("student");clearForm();}} className="k-btn k-press"
          style={{...bs("#43a047","#fff"),width:"100%",justifyContent:"center",padding:"14px",fontWeight:800,fontSize:14,boxShadow:"0 4px 0 #2e7d32",letterSpacing:.5}}>
          ← Нэвтрэх хуудас руу
        </button>
      </div>
    </div>
  );

  // ── KAWAII INPUT STYLE ─────────────────────────────
  const kInp={
    width:"100%",
    padding:"13px 16px",
    borderRadius:14,
    border:"2px solid #e9e3ff",
    fontSize:14,
    outline:"none",
    boxSizing:"border-box",
    background:"#faf8ff",
    transition:"all .2s ease",
    fontWeight:500,
  };
  const kLabel={fontSize:11,color:"#7c3aed",fontWeight:700,marginBottom:5,letterSpacing:.5,textTransform:"uppercase"};

  // Mode-аас хамаарсан өнгө
  const modeColors={
    teacher:{primary:"#7c3aed",secondary:"#a78bfa",bg1:"#a78bfa",bg2:"#7c3aed",emoji:"👩‍🏫",title:"Багшийн нэвтрэх",sub:"Та өөрийн ангиа удирдана"},
    student:{primary:"#e91e8c",secondary:"#f48cb1",bg1:"#f48cb1",bg2:"#e91e8c",emoji:"🌸",title:"Сурагч нэвтрэх",sub:"Өнөөдрийн хичээлээ хүлээж байна!"},
    register:{primary:"#43a047",secondary:"#81c784",bg1:"#81c784",bg2:"#43a047",emoji:"🌱",title:"Шинээр эхэлье!",sub:"Солонгос хэлний аялалд тавтай морил"},
    forgot:{primary:"#f57c00",secondary:"#ffb74d",bg1:"#ffb74d",bg2:"#f57c00",emoji:"🔑",title:"Нууц үг сэргээх",sub:"Бүү ай — туслана!"},
  };
  const mc=modeColors[mode]||modeColors.student;

  return(
    <div style={{
      minHeight:"100vh",
      background:`linear-gradient(135deg,${mc.bg1} 0%,${mc.bg2} 100%)`,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"system-ui",padding:16,
      position:"relative",overflow:"hidden",
      transition:"background 0.6s ease",
    }}>
      {/* ── Хөвөгч background эмодиго ── */}
      <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
        {[
          {e:"🌸",x:8,y:15,size:40,delay:0,dur:6},
          {e:"⭐",x:85,y:10,size:28,delay:1,dur:5},
          {e:"🌟",x:90,y:60,size:34,delay:2,dur:7},
          {e:"🍀",x:5,y:75,size:32,delay:0.5,dur:8},
          {e:"💫",x:75,y:85,size:30,delay:1.5,dur:6},
          {e:"✨",x:15,y:45,size:24,delay:3,dur:5},
          {e:"🎀",x:80,y:40,size:26,delay:2.5,dur:7},
          {e:"📚",x:20,y:88,size:30,delay:0.8,dur:6.5},
          {e:"한",x:50,y:8,size:48,delay:1.2,dur:9},
          {e:"국",x:55,y:92,size:42,delay:2.8,dur:8},
        ].map((p,i)=>(
          <div key={i} style={{
            position:"absolute",
            left:`${p.x}%`,top:`${p.y}%`,
            fontSize:p.size,
            opacity:p.e==="한"||p.e==="국"?0.25:0.45,
            color:p.e==="한"||p.e==="국"?"#fff":"inherit",
            fontWeight:p.e==="한"||p.e==="국"?900:400,
            animation:`kFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,
            filter:"drop-shadow(0 4px 8px rgba(0,0,0,0.1))",
            userSelect:"none",
          }}>{p.e}</div>
        ))}
        {/* Том blur тойргууд */}
        <div style={{position:"absolute",top:"-10%",right:"-10%",width:300,height:300,borderRadius:"50%",background:"rgba(255,255,255,0.15)",filter:"blur(40px)",animation:"kFloat 10s ease-in-out infinite"}}/>
        <div style={{position:"absolute",bottom:"-15%",left:"-10%",width:350,height:350,borderRadius:"50%",background:"rgba(255,255,255,0.12)",filter:"blur(50px)",animation:"kFloat 12s ease-in-out 2s infinite"}}/>
      </div>

      {/* ── Main card ── */}
      <div className="k-pop" style={{
        background:"#fff",
        borderRadius:28,
        padding:"28px 26px",
        width:"100%",maxWidth:380,
        boxShadow:"0 24px 80px rgba(0,0,0,.25), 0 0 0 1px rgba(255,255,255,0.5) inset",
        position:"relative",zIndex:1,
        backdropFilter:"blur(20px)",
      }}>
        {/* ── Header — mascot + title ── */}
        <div style={{textAlign:"center",marginBottom:20,position:"relative"}}>
          {/* Mascot */}
          <div className="k-bouncy" style={{
            fontSize:64,
            marginBottom:6,
            display:"inline-block",
            filter:"drop-shadow(0 8px 16px rgba(0,0,0,0.15))",
            transition:"all 0.4s ease",
          }}>{mc.emoji}</div>
          {/* Sparkle */}
          <div style={{position:"absolute",top:5,right:"30%",fontSize:18,animation:"kFloat 3s ease-in-out infinite",opacity:.8}}>✨</div>
          <div style={{position:"absolute",top:25,left:"28%",fontSize:14,animation:"kFloat 2.5s ease-in-out 0.5s infinite",opacity:.7}}>⭐</div>
          
          <div style={{
            fontSize:24,fontWeight:900,
            background:`linear-gradient(135deg,${mc.primary},${mc.secondary})`,
            WebkitBackgroundClip:"text",
            WebkitTextFillColor:"transparent",
            backgroundClip:"text",
            letterSpacing:-.5,
          }}>한국어 학원</div>
          <div style={{fontSize:11,color:"#888",fontWeight:600,marginTop:2,letterSpacing:1}}>КАНДУН СОЛОНГОС ХЭЛНИЙ СУРГУУЛЬ</div>
        </div>

        {/* ── Mode title ── */}
        <div className="k-fade" key={mode} style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:16,fontWeight:800,color:mc.primary,marginBottom:2}}>{mc.title}</div>
          <div style={{fontSize:11,color:"#888"}}>{mc.sub}</div>
        </div>

        {/* ── Tab selector — Дуолинго маягийн ── */}
        <div style={{display:"flex",gap:4,marginBottom:18,background:"#f5f3ff",borderRadius:14,padding:5,position:"relative"}}>
          {[["teacher","👩‍🏫","Багш"],["student","🎓","Сурагч"],["register","✏️","Бүртгүүлэх"]].map(item=>{
            const active=mode===item[0];
            return(
              <button key={item[0]} onClick={()=>{setMode(item[0]);clearForm();}} className="k-btn k-press"
                style={{
                  flex:1,padding:"9px 4px",borderRadius:10,border:"none",
                  background:active?"#fff":"transparent",
                  color:active?mc.primary:"#888",
                  fontWeight:active?800:600,
                  fontSize:11,cursor:"pointer",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                  boxShadow:active?`0 2px 8px ${mc.primary}33`:"none",
                  transition:"all .2s",
                }}>
                <span style={{fontSize:16}}>{item[1]}</span>
                <span>{item[2]}</span>
              </button>
            );
          })}
        </div>

        {/* ── FORGOT PASSWORD ── */}
        {mode==="forgot"&&(
          <div className="k-fade">
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <button onClick={()=>{setMode("student");clearForm();}} className="k-btn k-press" style={bs("#f0f0f0","#555",undefined,true)}>← Буцах</button>
              <span style={{fontWeight:800,fontSize:14,color:"#f57c00"}}>🔑 Нууц үг сэргээх</span>
            </div>
            {fResult?(
              <div className="k-pop" style={{textAlign:"center"}}>
                <div style={{fontSize:48,marginBottom:8}}>🎉</div>
                <div style={{fontSize:14,color:"#555",marginBottom:6}}>Сайн байна уу, <b>{fResult.name}</b>!</div>
                <div style={{fontSize:12,color:"#888",marginBottom:8}}>Таны нууц үг:</div>
                <div style={{fontSize:22,fontWeight:800,fontFamily:"monospace",background:"linear-gradient(135deg,#fff8e1,#fff3cd)",border:"2px solid #ffd54f",borderRadius:14,padding:"12px 18px",color:"#b8860b",letterSpacing:3,marginBottom:18}}>{fResult.password}</div>
                <button onClick={()=>{setMode("student");clearForm();}} className="k-btn k-press" style={{...bs("#e91e8c","#fff"),width:"100%",justifyContent:"center",padding:"13px",fontWeight:800,boxShadow:"0 4px 0 #ad1457",fontSize:14}}>Нэвтрэх →</button>
              </div>
            ):(
              <div>
                <div style={{fontSize:12,color:"#888",marginBottom:14,textAlign:"center",lineHeight:1.5}}>И-мэйл болон Регистрийн дугаараа<br/>оруулна уу 👇</div>
                <div style={{marginBottom:12}}>
                  <div style={kLabel}>📧 И-мэйл</div>
                  <input type="email" value={fEmail} onChange={e=>setFEmail(e.target.value)} placeholder="taны@email.com"
                    onFocus={e=>e.target.style.borderColor=mc.primary}
                    onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                    style={kInp}/>
                </div>
                <div style={{marginBottom:18}}>
                  <div style={kLabel}>🆔 Регистрийн дугаар</div>
                  <input value={fRd} onChange={e=>setFRd(e.target.value.toUpperCase())} placeholder="УБ12345678"
                    onFocus={e=>e.target.style.borderColor=mc.primary}
                    onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                    style={{...kInp,textTransform:"uppercase",letterSpacing:2,fontWeight:700}}/>
                </div>
                <button onClick={forgotCheck} className="k-btn k-press"
                  style={{...bs(mc.primary,"#fff"),width:"100%",justifyContent:"center",padding:"14px",fontWeight:800,fontSize:14,boxShadow:`0 4px 0 ${mc.bg2}`,letterSpacing:.5}}>
                  🔓 Нууц үг харах
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TEACHER LOGIN ── */}
        {mode==="teacher"&&(
          <div className="k-fade">
            <div style={{marginBottom:12}}>
              <div style={kLabel}>📧 И-мэйл</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginTeacher()} placeholder="admin@school.mn"
                onFocus={e=>e.target.style.borderColor="#7c3aed"}
                onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                style={kInp}/>
            </div>
            <div style={{marginBottom:18}}>
              <div style={kLabel}>🔒 Нууц үг</div>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginTeacher()} placeholder="••••••••"
                  onFocus={e=>e.target.style.borderColor="#7c3aed"}
                  onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                  style={{...kInp,paddingRight:42}}/>
                <span onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:16,opacity:.6}}>{showPass?"🙈":"👁"}</span>
              </div>
            </div>
            <button onClick={loginTeacher} disabled={loading2} className="k-btn k-press"
              style={{...bs("#7c3aed","#fff"),width:"100%",justifyContent:"center",padding:"14px",fontWeight:800,fontSize:14,opacity:loading2?.7:1,boxShadow:"0 4px 0 #5b21b6",letterSpacing:.5}}>
              {loading2?"⏳ Нэвтрэж байна...":"🚀 Багш болгож нэвтрэх"}
            </button>
          </div>
        )}

        {/* ── STUDENT LOGIN ── */}
        {mode==="student"&&(
          <div className="k-fade">
            <div style={{marginBottom:12}}>
              <div style={kLabel}>📧 И-мэйл</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginStudent()} placeholder="таны@email.com"
                onFocus={e=>e.target.style.borderColor="#e91e8c"}
                onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                style={kInp}/>
            </div>
            <div style={{marginBottom:6}}>
              <div style={kLabel}>🔒 Нууц үг</div>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginStudent()} placeholder="••••••••"
                  onFocus={e=>e.target.style.borderColor="#e91e8c"}
                  onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                  style={{...kInp,paddingRight:42}}/>
                <span onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:16,opacity:.6}}>{showPass?"🙈":"👁"}</span>
              </div>
            </div>
            <div style={{textAlign:"right",marginBottom:16,marginTop:6}}>
              <span onClick={()=>{setMode("forgot");clearForm();}} style={{fontSize:11,color:"#e91e8c",cursor:"pointer",fontWeight:700,padding:"4px 8px",borderRadius:6,transition:"all .15s"}}
                onMouseEnter={e=>e.target.style.background="#fce4ec"}
                onMouseLeave={e=>e.target.style.background="transparent"}>
                🤔 Нууц үгээ мартсан уу?
              </span>
            </div>
            <button onClick={loginStudent} disabled={loading2} className="k-btn k-press"
              style={{...bs("#e91e8c","#fff"),width:"100%",justifyContent:"center",padding:"14px",fontWeight:800,fontSize:14,opacity:loading2?.7:1,boxShadow:"0 4px 0 #ad1457",letterSpacing:.5}}>
              {loading2?"⏳ Нэвтрэж байна...":"🌸 Хичээлээ үргэлжлүүлэх"}
            </button>
            <div style={{marginTop:14,textAlign:"center",fontSize:12,color:"#888",padding:"10px",borderTop:"1px dashed #eee"}}>
              Шинэ сурагч уу?{" "}
              <span onClick={()=>{setMode("register");clearForm();}} style={{color:"#43a047",cursor:"pointer",fontWeight:800,padding:"3px 7px",borderRadius:6}}
                onMouseEnter={e=>e.target.style.background="#e8f5e9"}
                onMouseLeave={e=>e.target.style.background="transparent"}>
                🌱 Шинээр эхлэх →
              </span>
            </div>
          </div>
        )}

        {/* ── REGISTER ── */}
        {mode==="register"&&(
          <div className="k-fade">
            {[
              {label:"👤 Нэр",key:"name",type:"text",val:name,set:setName,ph:"Бүтэн нэрээ оруулна уу"},
              {label:"📧 И-мэйл",key:"email",type:"email",val:email,set:setEmail,ph:"таны@email.com"},
              {label:"🆔 Регистрийн дугаар",key:"rd",type:"text",val:rd,set:v=>setRd(v.toUpperCase()),ph:"УБ12345678",upper:true},
              {label:"📞 Утас (заавал биш)",key:"phone",type:"tel",val:phone,set:setPhone,ph:"+976 9999-9999"},
            ].map(item=>(
              <div key={item.key} style={{marginBottom:10}}>
                <div style={kLabel}>{item.label}</div>
                <input type={item.type} value={item.val} onChange={e=>item.set(e.target.value)} placeholder={item.ph}
                  onFocus={e=>e.target.style.borderColor="#43a047"}
                  onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                  style={{...kInp,...(item.upper?{textTransform:"uppercase",letterSpacing:2,fontWeight:700}:{})}}/>
              </div>
            ))}
            <div style={{marginBottom:10}}>
              <div style={kLabel}>🔒 Нууц үг</div>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} placeholder="хамгийн багадаа 6 тэмдэгт"
                  onFocus={e=>e.target.style.borderColor="#43a047"}
                  onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                  style={{...kInp,paddingRight:42}}/>
                <span onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:16,opacity:.6}}>{showPass?"🙈":"👁"}</span>
              </div>
            </div>
            <div style={{marginBottom:18}}>
              <div style={kLabel}>🔒 Нууц үг давтах</div>
              <input type="password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} placeholder="дахин бичнэ үү"
                onFocus={e=>e.target.style.borderColor="#43a047"}
                onBlur={e=>e.target.style.borderColor="#e9e3ff"}
                style={kInp}/>
            </div>
            <button onClick={register} className="k-btn k-press"
              style={{...bs("#43a047","#fff"),width:"100%",justifyContent:"center",padding:"14px",fontWeight:800,fontSize:14,boxShadow:"0 4px 0 #2e7d32",letterSpacing:.5}}>
              🌱 Бүртгүүлэх
            </button>
            <div style={{marginTop:14,textAlign:"center",fontSize:12,color:"#888",padding:"10px",borderTop:"1px dashed #eee"}}>
              Хэдийнэ бүртгэлтэй юу?{" "}
              <span onClick={()=>{setMode("student");clearForm();}} style={{color:"#e91e8c",cursor:"pointer",fontWeight:800,padding:"3px 7px",borderRadius:6}}
                onMouseEnter={e=>e.target.style.background="#fce4ec"}
                onMouseLeave={e=>e.target.style.background="transparent"}>
                🌸 Нэвтрэх →
              </span>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {err&&(
          <div className="k-pop" style={{
            marginTop:14,padding:"12px 16px",
            background:"linear-gradient(135deg,#fce4ec,#ffe0e0)",
            border:"2px solid #f48fb1",
            borderRadius:12,
            fontSize:12,color:"#c62828",
            fontWeight:600,
            display:"flex",alignItems:"center",gap:8,
          }}>
            <span style={{fontSize:18}}>😢</span>
            <span style={{flex:1}}>{err}</span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{position:"absolute",bottom:14,left:0,right:0,textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:600,zIndex:1,letterSpacing:.5}}>
        화이팅! 🌸 Амжилт хүсье!
      </div>
    </div>
  );
}

// ── CHANGE PASSWORD MODAL ─────────────────────────────
function ChangePasswordModal({onClose,teacherId,studentId}){
  const [oldPass,setOldPass]=useState("");
  const [newPass,setNewPass]=useState("");
  const [confirm,setConfirm]=useState("");
  const [err,setErr]=useState("");
  const [ok,setOk]=useState(false);
  const [showOld,setShowOld]=useState(false);
  const [showNew,setShowNew]=useState(false);

  const save=()=>{
    setErr("");
    if(teacherId){
      const t=_teachers.find(x=>x.id===teacherId);
      if(!t)return;
      if(oldPass!==t.password){setErr("Хуучин нууц үг буруу.");return;}
      if(newPass.length<6){setErr("Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");return;}
      if(newPass!==confirm){setErr("Нууц үг таарахгүй байна.");return;}
      const idx=_teachers.findIndex(x=>x.id===teacherId);
      _teachers[idx]={..._teachers[idx],password:newPass};
    } else {
      const st=_db.students.find(s=>s.id===studentId);
      if(!st)return;
      if(oldPass!==st.password){setErr("Хуучин нууц үг буруу.");return;}
      if(newPass.length<6){setErr("Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");return;}
      if(newPass!==confirm){setErr("Нууц үг таарахгүй байна.");return;}
      _db.students=_db.students.map(s=>s.id===studentId?{...s,password:newPass}:s);
    }
    setOk(true);
    setTimeout(onClose,1200);
  };

  return(
    <Overlay onClose={onClose}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>🔐 Нууц үг солих</div>
      {ok?(
        <div style={{textAlign:"center",padding:"20px 0",color:"#2e7d32",fontWeight:600}}>✅ Амжилттай солигдлоо!</div>
      ):(
        <div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"#888",marginBottom:3}}>Хуучин нууц үг</div>
            <div style={{position:"relative"}}>
              <input type={showOld?"text":"password"} value={oldPass} onChange={e=>setOldPass(e.target.value)} style={{...INP,paddingRight:36}}/>
              <span onClick={()=>setShowOld(p=>!p)} style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:13,opacity:.5}}>{showOld?"🙈":"👁"}</span>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"#888",marginBottom:3}}>Шинэ нууц үг</div>
            <div style={{position:"relative"}}>
              <input type={showNew?"text":"password"} value={newPass} onChange={e=>setNewPass(e.target.value)} style={{...INP,paddingRight:36}}/>
              <span onClick={()=>setShowNew(p=>!p)} style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:13,opacity:.5}}>{showNew?"🙈":"👁"}</span>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#888",marginBottom:3}}>Давтах</div>
            <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={INP}/>
          </div>
          {err&&<div style={{marginBottom:10,padding:"7px 11px",background:"#fce4ec",borderRadius:8,fontSize:12,color:"#c62828"}}>{err}</div>}
          <div style={{display:"flex",gap:7}}>
            <button onClick={onClose} style={bs("#fff","#333","#e0e0e0")}>Болих</button>
            <button onClick={save} style={{...bs("#7c3aed","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>Хадгалах</button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

function PlantConfirmModal({pendingPlant,isFirst,onConfirm,onBack}){
  const pObj=PLANT_TYPES.find(p=>p.id===pendingPlant);
  return(
    <Overlay onClose={onBack} maxW={320}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:8}}>{pObj?.name.split(" ")[0]}</div>
        <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>{pObj?.name}</div>
        <div style={{fontSize:12,color:"#555",marginBottom:12,lineHeight:1.6}}>
          <b>{pObj?.name}</b> тариалахдаа итгэлтэй байна уу?<br/>
          {isFirst?(
            <span style={{color:"#e65100"}}>⚠️ Суулгац хийсний дараа өөрчлөх боломжгүй.<br/>6 даалгавар хийж дуусгахад бүрэн ургана.</span>
          ):(
            <span style={{color:"#2e7d32"}}>✅ Шинэ ургамал тариалах гэж байна!</span>
          )}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onBack} style={{...bs("#fff","#333","#e0e0e0"),flex:1,justifyContent:"center"}}>← Буцах</button>
          <button onClick={onConfirm} style={{...bs("#2e7d32","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>✅ Тариалах!</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── PLANT SECTION ─────────────────────────────────────
function PlantSection({s,t,isAdmin,isStudent,upd,hideUI}){
  const streak=s.hw_streak||0;
  const miss=s.hw_miss||0;
  const plantHistory=Array.isArray(s.plant_history)?s.plant_history:[];
  const currentPlant=s.plant_type&&s.plant_type!=="null"?s.plant_type:null;
  const hasChosen=!!(s.plant_type&&s.plant_type!=="null");
  const completed=streak>=6&&miss<3;
  const canPlantNext=streak>=7&&miss<3;
  const [showSelect,setShowSelect]=useState(false);
  const [pendingPlant,setPendingPlant]=useState(null);
  const [showConfirm,setShowConfirm]=useState(false);
  const [showAdminLabels,setShowAdminLabels]=useState(false);
  const [labelList,setLabelList]=useState([..._plant_labels]);

  const plantObj=currentPlant?PLANT_TYPES.find(p=>p.id===currentPlant):null;

  const handleSelectPlant=(pid)=>{
    setPendingPlant(pid);
    setShowSelect(false);
    setShowConfirm(true);
  };

  const confirmPlant=()=>{
    const isReplant=!!currentPlant;
    const newHistory=isReplant?[...plantHistory,currentPlant]:plantHistory;
    // Дахин тариалахад л streak reset хийнэ, анх сонгохдоо хийхгүй
    const patch=isReplant
      ?{plant_type:pendingPlant,plant_history:newHistory,hw_streak:0,hw_miss:0}
      :{plant_type:pendingPlant,plant_history:newHistory};
    upd(patch);
    setShowConfirm(false);
    setPendingPlant(null);
  };

  return(
    <div style={{background:t.soft,borderRadius:14,padding:12,marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontWeight:700,fontSize:12,color:t.text}}>🏡 Гэрийн даалгаврын streak</div>
        {isAdmin&&!hideUI&&(
          <button onClick={()=>setShowAdminLabels(true)} style={{fontSize:9,background:"#f0f0ff",border:"none",borderRadius:6,padding:"2px 7px",cursor:"pointer",color:"#7c3aed"}}>✏️ Label засах</button>
        )}
      </div>

      {/* No plant selected yet */}
      {!currentPlant&&isStudent&&(
        <div style={{textAlign:"center",padding:"16px 0"}}>
          <div style={{fontSize:32,marginBottom:8}}>🌱</div>
          <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:4}}>Ургамал сонгоорой!</div>
          <div style={{fontSize:11,color:"#888",marginBottom:12}}>Суулгац хийсний дараа өөрчлөх боломжгүй.<br/>6 гэрийн даалгавар хийж дуусгахад бүрэн ургана.</div>
          <button onClick={()=>setShowSelect(true)} style={{...bs(t.accent,"#fff"),padding:"8px 20px",fontWeight:700}}>🌱 Ургамал сонгох</button>
        </div>
      )}

      {/* Has plant but show change button for student if not yet started (streak=0) */}
      {currentPlant&&isStudent&&streak===0&&miss===0&&(
        <div style={{textAlign:"center",marginBottom:8}}>
          <button onClick={()=>setShowSelect(true)} style={{fontSize:11,background:"#f0f0f0",border:"none",borderRadius:8,padding:"4px 12px",cursor:"pointer",color:"#555"}}>
            🔄 Ургамал солих (streak эхлээгүй)
          </button>
        </div>
      )}

      {/* Plant selected */}
      {currentPlant&&(
        <div>
          {/* Previous plants */}
          {plantHistory.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:"#888",marginBottom:5}}>🌟 Өмнөх ургамлууд</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {plantHistory.map((pt,i)=>{
                  const pObj=PLANT_TYPES.find(p=>p.id===pt);
                  return(
                    <div key={i} style={{textAlign:"center",opacity:.85}}>
                      <div style={{width:50,height:50}}>
                        <StreakTree streak={6} miss={0} plantType={pt} isStudent={false} showSelect={false} setShowSelect={()=>{}}/>
                      </div>
                      <div style={{fontSize:8,color:t.text,opacity:.7,marginTop:2}}>{pObj?.name||pt}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current plant */}
          <StreakTree streak={streak} miss={miss} plantType={currentPlant} isStudent={false} showSelect={false} setShowSelect={()=>{}}/>
          <div style={{textAlign:"center",fontSize:10,color:t.text,opacity:.5,marginTop:4}}>
            {plantObj?.name||currentPlant} · {streak}/6
            {isStudent&&streak<6&&<span> · {Math.max(0,6-streak)} streak үлдлээ</span>}
          </div>

          {/* Next plant prompt - student only */}
          {canPlantNext&&isStudent&&(
            <div style={{marginTop:10,background:"#e8f5e9",borderRadius:10,padding:"10px 12px",textAlign:"center",border:"2px solid #66bb6a"}}>
              <div style={{fontSize:14,marginBottom:4}}>🎉 Ургамал чинь бүрэн ургалаа!</div>
              <div style={{fontSize:11,color:"#555",marginBottom:8}}>Дараагийн ургамалыг тариалах уу?</div>
              <button onClick={()=>setShowSelect(true)} style={{...bs("#2e7d32","#fff"),fontWeight:700}}>🌱 Дараагийн ургамал</button>
            </div>
          )}
        </div>
      )}

      <StatCards streak={streak} grammarLearned={s.grammar_learned||0} grammarTotal={s.grammar_total||0}
        learnedVocab={0} totalVocab={0} present={0} sessions={0} accent={t.accent} card={t.card}/>

      {/* Plant selector modal */}
      {showSelect&&(
        <Overlay onClose={()=>setShowSelect(false)} maxW={360}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>🌱 Ургамал сонгох</div>
          <div style={{fontSize:11,color:"#e65100",background:"#fff8e1",borderRadius:8,padding:"6px 10px",marginBottom:12}}>
            ⚠️ Суулгац хийсний дараа өөрчлөх боломжгүй!<br/>Бүрэн ургасны дараа дараагийнхаа сонголт нээгдэнэ.
          </div>
          <div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:6}}>🌳 Мод</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:12}}>
            {PLANT_TYPES.filter(p=>p.type==="tree").map(p=>(
              <div key={p.id} onClick={()=>handleSelectPlant(p.id)}
                style={{background:"#f8f8f8",border:"2px solid #e0e0e0",borderRadius:12,padding:"10px 8px",cursor:"pointer",textAlign:"center",transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#2e7d32";e.currentTarget.style.background="#f1f8e9";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0e0e0";e.currentTarget.style.background="#f8f8f8";}}>
                <div style={{fontSize:22,marginBottom:4}}>{p.name.split(" ")[0]}</div>
                <div style={{fontSize:11,fontWeight:600}}>{p.name.split(" ").slice(1).join(" ")}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:6}}>🌸 Ургамал</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {PLANT_TYPES.filter(p=>p.type==="flower").map(p=>(
              <div key={p.id} onClick={()=>handleSelectPlant(p.id)}
                style={{background:"#f8f8f8",border:"2px solid #e0e0e0",borderRadius:12,padding:"10px 8px",cursor:"pointer",textAlign:"center",transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#e91e8c";e.currentTarget.style.background="#fff0f5";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#e0e0e0";e.currentTarget.style.background="#f8f8f8";}}>
                <div style={{fontSize:22,marginBottom:4}}>{p.name.split(" ")[0]}</div>
                <div style={{fontSize:11,fontWeight:600}}>{p.name.split(" ").slice(1).join(" ")}</div>
              </div>
            ))}
          </div>
        </Overlay>
      )}

      {/* Confirm plant modal */}
      {showConfirm&&pendingPlant&&<PlantConfirmModal
        pendingPlant={pendingPlant}
        isFirst={!currentPlant||plantHistory.length===0}
        onConfirm={confirmPlant}
        onBack={()=>{setShowConfirm(false);setShowSelect(true);}}
      />}

      {/* Admin label editor */}
      {showAdminLabels&&(
        <Overlay onClose={()=>setShowAdminLabels(false)} maxW={340}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>✏️ Ургамлын label засах</div>
          {labelList.map((lbl,i)=>(
            <div key={i} style={{marginBottom:8}}>
              <div style={{fontSize:10,color:"#888",marginBottom:2}}>Үе шат {i+1}</div>
              <input value={lbl} onChange={e=>{const u=[...labelList];u[i]=e.target.value;setLabelList(u);}}
                style={{...INP,fontSize:12,padding:"5px 9px"}}/>
            </div>
          ))}
          <button onClick={()=>{_plant_labels=[...labelList];setShowAdminLabels(false);}} style={{...bs("#7c3aed","#fff"),width:"100%",justifyContent:"center",marginTop:4}}>✓ Хадгалах</button>
        </Overlay>
      )}
    </div>
  );
}

// ── CARD CONTENT ──────────────────────────────────────
function CardContent({s,t,isAdmin,isSuperAdmin,upd,attMonth,setAttMonth,classDays,vocabEntries,sessions,present,learnedVocab,totalVocab,onToggleAtt,hideUI,setShowPay,setEditNotes,editNotes,notes,setNotes,weakSearch,setWeakSearch,showWeakDD,setShowWeakDD,homeworks,homeworkSubs,exams,examSubs}){
  const balance=(s.total_fee||0)-(s.total_paid||0);
  const overdue=!!(s.next_due&&s.next_due<TODAY);
  const showPayment=isSuperAdmin||(!isAdmin);

  const filteredVocab=useMemo(()=>{
    if(!weakSearch.trim())return[];
    const q=weakSearch.toLowerCase();
    const allV=vocabEntries.filter(v=>v.type==="vocab");
    return allV.filter(v=>(v.word.toLowerCase().includes(q)||v.meaning.toLowerCase().includes(q))&&!(s.weak_words||[]).find(w=>w.word===v.word)).slice(0,8);
  },[weakSearch,vocabEntries,s.weak_words]);

  const grammarByMonth=useMemo(()=>{
    const months=[...new Set(vocabEntries.filter(v=>v.type==="grammar").map(v=>v.month))].sort();
    return months.map(mo=>({mo,items:vocabEntries.filter(v=>v.type==="grammar"&&v.month===mo)}));
  },[vocabEntries]);

  const weakSorted=[...(s.weak_words||[])].sort((a,b)=>(b.miss||0)-(a.miss||0));
  const allPresent=Object.values(s.attendance||{}).filter(Boolean).length;

  return(
    <div style={{background:t.card,borderRadius:22,padding:16,border:`2px solid ${t.border}`}}>
      {/* Header */}
      <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:80,height:80,borderRadius:16,overflow:"hidden",border:`3px solid ${t.accent}`,background:t.soft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>
            {s.photo_url?<img src={s.photo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:t.emoji}
          </div>
          {isAdmin&&!hideUI&&(
            <label title="Зураг оруулах" style={{position:"absolute",bottom:-4,right:-4,width:22,height:22,borderRadius:"50%",background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,color:"#fff",boxShadow:"0 1px 4px #0003"}}>
              📷
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                const file=e.target.files&&e.target.files[0];
                if(!file)return;
                const reader=new FileReader();
                reader.onload=ev=>upd({photo_url:ev.target.result});
                reader.readAsDataURL(file);
              }}/>
            </label>
          )}
          {isAdmin&&!hideUI&&s.photo_url&&(
            <span onClick={()=>upd({photo_url:null})} title="Зураг устгах" style={{position:"absolute",top:-4,right:-4,width:18,height:18,borderRadius:"50%",background:"#e53935",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9,color:"#fff"}}>✕</span>
          )}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:17,fontWeight:800,color:t.text,marginBottom:5}}>{s.name}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:5}}>
            <span style={bdg(t.accent+"22",t.accent)}>{TOPIK[s.level||0]}</span>
            <span style={bdg(t.soft,t.text)}>📅 {fmtDate(s.enroll_date)}</span>
            {s.phone&&<span style={bdg(t.soft,t.text)}>📞 {s.phone}</span>}
            {showPayment&&(balance>0?<span style={bdg("#fce4ec","#c62828")}>💸 {fmt(balance)} дутуу</span>:<span style={bdg("#e8f5e9","#2e7d32")}>✅ Бүрэн</span>)}
            {showPayment&&s.next_due&&<span style={bdg(overdue?"#fce4ec":"#fff8e1",overdue?"#c62828":"#e65100")}>{overdue?"⚠️":"📆"} {s.next_due}</span>}
          </div>
          {(s.badges||[]).length>0&&(
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {(s.badges||[]).map(bid=>{
                const bd=_db.badge_defs.find(b=>b.id===bid);
                return bd?<span key={bid} style={bdg("#fff3cd","#b8860b")}>{bd.label}</span>:null;
              })}
            </div>
          )}
        </div>
      </div>

      {/* XP + TOPIK */}
      <XPBar xp={s.xp||0} accent={t.accent}/>
      <div style={{display:"flex",gap:3,marginBottom:10}}>
        {TOPIK.map((_,i)=>(
          <div key={i} title={TOPIK[i]} onClick={()=>isAdmin&&upd({level:i})}
            style={{flex:1,height:7,borderRadius:3,background:i<=(s.level||0)?t.accent:t.soft,cursor:isAdmin?"pointer":"default"}}/>
        ))}
      </div>

      {/* Streak + Plant */}
      <PlantSection s={s} t={t} isAdmin={isAdmin} isStudent={!isAdmin} upd={upd} hideUI={hideUI}/>

      {/* Attendance */}
      <div style={{background:t.soft,borderRadius:14,padding:12,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:5}}>
          <div style={{fontWeight:700,fontSize:12,color:t.text}}>📅 Ирц</div>
          <input type="month" value={attMonth} onChange={e=>setAttMonth(e.target.value)}
            style={{padding:"3px 7px",borderRadius:7,border:`1px solid ${t.border}`,fontSize:11,background:t.card,color:t.text,outline:"none"}}/>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {sessions.map(item=>{
            const ok=(s.attendance||{})[item.date]||false;
            const dow=new Date(item.date).getDay();
            return(
              <div key={item.date} onClick={()=>onToggleAtt(item.date)} title={item.date}
                style={{width:33,height:33,borderRadius:7,background:ok?t.accent:t.card,border:`1px solid ${t.border}`,cursor:isAdmin?"pointer":"default",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontSize:10,color:ok?"#fff":t.text,opacity:ok?1:.55,fontWeight:600,flexShrink:0}}>
                <span>{item.day}</span>
                <span style={{fontSize:7,opacity:.7}}>{WDAYS[dow]}</span>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:5,fontSize:10,color:t.text,opacity:.5,textAlign:"right"}}>{present}/{sessions.length} ирсэн</div>
        {sessions.length>0&&<AttendanceStats present={present} total={sessions.length} allPresent={allPresent} card={t.card}/>}
      </div>

      {/* Гэрийн даалгавар + Шалгалт статистик */}
      {(homeworks||exams)&&(() => {
        const myClassId=s.class_id;
        const myHws=(homeworks||[]).filter(h=>h.class_id===myClassId);
        const mySubs=(homeworkSubs||[]).filter(hs=>hs.student_id===s.id);
        const submittedIds=new Set(mySubs.map(x=>x.homework_id));
        const completedHws=myHws.filter(h=>submittedIds.has(h.id)).length;
        const pendingHws=myHws.filter(h=>!submittedIds.has(h.id)&&new Date(h.due_date)>new Date()).length;
        const myExSubs=(examSubs||[]).filter(es=>es.student_id===s.id);
        const avgExScore=myExSubs.length>0?Math.round(myExSubs.reduce((a,b)=>a+(b.score||0),0)/myExSubs.length):0;
        const totalXpFromExams=myExSubs.reduce((a,b)=>a+(b.xp_earned||0),0);
        if(myHws.length===0&&myExSubs.length===0)return null;
        return(
          <div style={{background:t.soft,borderRadius:14,padding:12,marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:12,color:t.text,marginBottom:8}}>🎓 Сургалтын идэвх</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
              <div style={{textAlign:"center",background:t.card,borderRadius:9,padding:"7px 4px"}}>
                <div style={{fontSize:15,fontWeight:800,color:t.accent}}>{completedHws}<span style={{fontSize:10,opacity:.6}}>/{myHws.length}</span></div>
                <div style={{fontSize:9,color:"#888",fontWeight:700}}>📝 Даалгавар</div>
                {pendingHws>0&&<div style={{fontSize:8,color:"#e65100",fontWeight:700,marginTop:1}}>⏳ {pendingHws} хүлээгдэж</div>}
              </div>
              <div style={{textAlign:"center",background:t.card,borderRadius:9,padding:"7px 4px"}}>
                <div style={{fontSize:15,fontWeight:800,color:"#43a047"}}>{myExSubs.length}</div>
                <div style={{fontSize:9,color:"#888",fontWeight:700}}>🏆 Шалгалт</div>
                {myExSubs.length>0&&<div style={{fontSize:8,color:"#43a047",fontWeight:700,marginTop:1}}>дундаж {avgExScore}%</div>}
              </div>
              <div style={{textAlign:"center",background:t.card,borderRadius:9,padding:"7px 4px"}}>
                <div style={{fontSize:15,fontWeight:800,color:"#7c3aed"}}>+{totalXpFromExams}</div>
                <div style={{fontSize:9,color:"#888",fontWeight:700}}>⚡ XP оноо</div>
                <div style={{fontSize:8,color:"#7c3aed",fontWeight:700,marginTop:1}}>шалгалтаас</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Payment - superadmin болон сурагч өөрөө л харна */}
      {showPayment&&(
        <div style={{background:t.soft,borderRadius:14,padding:12,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:12,color:t.text}}>💳 Төлбөр</div>
            {isAdmin&&isSuperAdmin&&!hideUI&&<button onClick={()=>setShowPay(true)} style={bs(t.accent,"#fff",undefined,true)}>+ Нэмэх</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:6}}>
            {[["Төлсөн",fmt(s.total_paid||0),t.accent],["Нийт",fmt(s.total_fee||0),"#888"],["Үлдэгдэл",balance>0?"-"+fmt(balance):"✓",balance>0?"#e53935":"#43a047"]].map(item=>(
              <div key={item[0]} style={{textAlign:"center",background:t.card,borderRadius:9,padding:"6px 4px"}}>
                <div style={{fontSize:12,fontWeight:700,color:item[2]}}>{item[1]}</div>
                <div style={{fontSize:9,color:t.text,opacity:.6}}>{item[0]}</div>
              </div>
            ))}
          </div>
          <div style={{height:5,background:t.card,borderRadius:5,marginBottom:6}}>
            <div style={{height:5,background:t.accent,borderRadius:5,width:`${s.total_fee?Math.min(100,(s.total_paid||0)/s.total_fee*100):0}%`}}/>
          </div>
          {s.next_due&&<div style={{background:overdue?"#fce4ec":"#fff8e1",borderRadius:8,padding:"5px 10px",marginBottom:5,fontSize:11,color:overdue?"#c62828":"#e65100",fontWeight:500}}>{overdue?"⚠️":"📆"} {s.next_due}</div>}
          {_db.payments.filter(p=>p.student_id===s.id).slice(0,3).map((p,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:t.text,padding:"3px 0",borderBottom:`1px solid ${t.border}`,opacity:.8}}>
              <span>{p.paid_at}</span>
              <span style={{fontWeight:600}}>{fmt(p.amount)}</span>
              <span style={{opacity:.5}}>{p.note||""}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grammar */}
      {grammarByMonth.length>0&&(
        <div style={{background:t.soft,borderRadius:14,padding:12,marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:12,color:t.text,marginBottom:8}}>📖 Дүрэм</div>
          {grammarByMonth.map(gm=>(
            <div key={gm.mo} style={{marginBottom:7}}>
              <div style={{fontSize:10,color:t.accent,fontWeight:600,marginBottom:4}}>📅 {gm.mo}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {gm.items.map(v=>(
                  <div key={v.id} style={{background:t.card,border:`1px solid ${t.accent}44`,borderRadius:7,padding:"3px 8px",fontSize:11}}>
                    <span style={{fontWeight:600,color:t.text}}>{v.word}</span>
                    <span style={{color:t.text,opacity:.5,fontSize:10,marginLeft:4}}>{v.meaning}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weak words */}
      <div style={{background:t.soft,borderRadius:14,padding:12,marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:12,color:t.text,marginBottom:4}}>
          ⚠️ Анхаарах үгс<span style={{fontSize:10,color:"#888",marginLeft:6}}>({learnedVocab}/{totalVocab} цээжилсэн)</span>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
          {weakSorted.map((w,i)=>{
            const c=w.miss>=3?"#c62828":w.miss>=1?"#e65100":"#2e7d32";
            const typeColor=w.wtype==="grammar"?"#7c3aed":"#e65100";
            return(
              <div key={i} style={{background:c+"15",border:`1px solid ${c}`,borderRadius:16,padding:"3px 9px",fontSize:11,color:c,display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontWeight:600}}>{w.word}</span>
                {w.meaning&&<span style={{opacity:.6,fontSize:10}}>{w.meaning}</span>}
                {w.wtype&&<span style={{fontSize:9,background:typeColor+"20",color:typeColor,borderRadius:8,padding:"1px 5px"}}>{w.wtype==="grammar"?"дүрэм":"үг"}</span>}
                <span style={{fontSize:9,opacity:.7}}>✕{w.miss}</span>
                {isAdmin&&!hideUI&&(
                  <span style={{display:"inline-flex",gap:2}}>
                    <span onClick={()=>{const arr=(s.weak_words||[]).map((x,j)=>j===i?{...x,miss:(x.miss||1)+1}:x);upd({weak_words:arr});}} style={{cursor:"pointer",fontSize:9,opacity:.55}}>+</span>
                    <span onClick={()=>upd({weak_words:(s.weak_words||[]).filter((_,j)=>j!==i)})} style={{cursor:"pointer",fontSize:9,opacity:.5}}>✕</span>
                  </span>
                )}
              </div>
            );
          })}
          {!weakSorted.length&&<div style={{fontSize:11,color:t.text,opacity:.4}}>Анхаарах үг байхгүй 🎉</div>}
        </div>
        {(isAdmin||!isAdmin)&&(
          <div style={{position:"relative"}}>
            <input value={weakSearch} onChange={e=>{setWeakSearch(e.target.value);setShowWeakDD(true);}} onFocus={()=>setShowWeakDD(true)}
              placeholder="Ойлгохгүй үг/дүрэм хайх..." style={{...INP,fontSize:12,padding:"6px 10px"}}/>
            {showWeakDD&&filteredVocab.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1px solid #e0e0e0",borderRadius:10,boxShadow:"0 4px 16px #0002",zIndex:100,maxHeight:180,overflowY:"auto"}}>
                {filteredVocab.map(v=>(
                  <div key={v.id} style={{padding:"8px 12px",cursor:"pointer",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #f5f5f5"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f5f0ff"}
                    onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                    <div>
                      <span style={{fontWeight:600}}>{v.word}</span>
                      <span style={{color:"#888",fontSize:11,marginLeft:6}}>{v.meaning}</span>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>{upd({weak_words:[...(s.weak_words||[]),{word:v.word,meaning:v.meaning,miss:1,wtype:"vocab"}]});setWeakSearch("");setShowWeakDD(false);}}
                        style={{fontSize:10,padding:"2px 7px",borderRadius:6,border:"1px solid #e65100",background:"#fff8f0",color:"#e65100",cursor:"pointer"}}>эргэлзэж буй үг</button>
                      {v.type==="grammar"&&<button onClick={()=>{upd({weak_words:[...(s.weak_words||[]),{word:v.word,meaning:v.meaning,miss:1,wtype:"grammar"}]});setWeakSearch("");setShowWeakDD(false);}}
                        style={{fontSize:10,padding:"2px 7px",borderRadius:6,border:"1px solid #7c3aed",background:"#f5f0ff",color:"#7c3aed",cursor:"pointer"}}>эргэлзэж буй дүрэм</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Teacher notes */}
      <div style={{background:t.soft,borderRadius:14,padding:12}}>
        <div style={{fontWeight:700,fontSize:12,color:t.text,marginBottom:6}}>📝 Багшийн тэмдэглэл</div>
        {isAdmin?(
          editNotes?(
            <div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${t.border}`,fontSize:12,resize:"none",background:t.card,color:t.text,outline:"none"}}/>
              <div style={{display:"flex",gap:5,justifyContent:"flex-end",marginTop:4}}>
                <button onClick={()=>setEditNotes(false)} style={bs(t.soft,t.text,t.border,true)}>Болих</button>
                <button onClick={()=>{upd({teacher_notes:notes});setEditNotes(false);}} style={bs(t.accent,"#fff",undefined,true)}>💾</button>
              </div>
            </div>
          ):(
            <div onClick={()=>!hideUI&&setEditNotes(true)} style={{fontSize:12,color:t.text,minHeight:30,cursor:hideUI?"default":"pointer",opacity:.85}}>
              {s.teacher_notes||<span style={{opacity:.4}}>Дарж нэмнэ үү...</span>}
            </div>
          )
        ):(
          <div style={{fontSize:12,color:t.text,opacity:.8,minHeight:30}}>{s.teacher_notes||"—"}</div>
        )}
      </div>
    </div>
  );
}

// ── STUDENT VIEW ──────────────────────────────────────
function StudentView({s,setStudents,goBack,attMonth,setAttMonth,classDays,vocabEntries,classmates,classColor,homeworks,homeworkSubs,exams,examSubs,refreshAll}){
  const [tab,setTab]=useState("card");
  const [attM,setAttM]=useState(attMonth);
  const [showChangePw,setShowChangePw]=useState(false);
  const [showThemes,setShowThemes]=useState(false);
  const [showEditStart,setShowEditStart]=useState(false);
  const [startDate,setStartDate]=useState(s.enroll_date||"");
  const [weakSearch,setWeakSearch]=useState("");
  const [showWeakDD,setShowWeakDD]=useState(false);
  const [showPractice,setShowPractice]=useState(false);
  const [activeHw,setActiveHw]=useState(null);
  const [activeExam,setActiveExam]=useState(null);
  const [examFinishToast,setExamFinishToast]=useState(null);
  const t=getT(s.theme_id);
  const sessions=getSessions(classDays,attM);
  const present=sessions.filter(item=>(s.attendance||{})[item.date]).length;
  const allVocab=vocabEntries.filter(v=>v.type==="vocab");
  const learnedVocab=Math.max(0,allVocab.length-(s.weak_words||[]).length);
  const filteredVocab=useMemo(()=>{
    if(!weakSearch.trim())return[];
    const q=weakSearch.toLowerCase();
    return vocabEntries.filter(v=>(v.word.toLowerCase().includes(q)||v.meaning.toLowerCase().includes(q))&&!(s.weak_words||[]).find(w=>w.word===v.word)).slice(0,8);
  },[weakSearch,vocabEntries,s.weak_words]);
  const printRef=useRef();

  const upd=useCallback(async patch=>{
    _db.students=_db.students.map(x=>x.id===s.id?{...x,...patch}:x);
    setStudents(p=>p.map(x=>x.id===s.id?{...x,...patch}:x));
    try{
      const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"};
      await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${s.id}`,{method:"PATCH",headers:h,body:JSON.stringify(patch)});
    }catch(e){console.error("Sync err",e);}
  },[s.id,setStudents]);

  return(
    <div style={{minHeight:"100vh",background:t.bg,fontFamily:"system-ui",maxWidth:480,margin:"0 auto",padding:14,overflowX:"hidden",boxSizing:"border-box"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={()=>{
          if(window.confirm("Системээс гарах уу? Дахин нэвтрэхэд и-мэйл, нууц үгээ оруулах хэрэгтэй.")){
            goBack();
          }
        }} style={bs(t.card,t.text,t.border,true)}>← Гарах</button>
        <div style={{flex:1,fontWeight:700,fontSize:15,color:t.text,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
        <button onClick={()=>setShowThemes(true)} style={bs(t.soft,t.accent,t.border,true)}>🎨</button>
        <button onClick={()=>setShowChangePw(true)} style={bs(t.soft,t.accent,t.border,true)}>🔐</button>
        <button onClick={()=>{
          const el=printRef.current;if(!el)return;
          const w=window.open("","_blank");
          w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${s.name}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:${t.bg};font-family:system-ui;padding:14px;max-width:600px;margin:0 auto}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>${el.innerHTML}</body></html>`);
          w.document.close();setTimeout(()=>{w.focus();w.print();},300);
        }} style={bs(t.accent,"#fff",undefined,true)}>🖨️</button>
      </div>
      {showChangePw&&<ChangePasswordModal onClose={()=>setShowChangePw(false)} studentId={s.id}/>}
      {showThemes&&(
        <Overlay onClose={()=>setShowThemes(false)} maxW={360}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>🎨 Өөрийн theme сонгох</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
            {THEMES.map(tm=>(
              <div key={tm.id} onClick={()=>{upd({theme_id:tm.id});setShowThemes(false);}}
                style={{background:tm.card,border:`2px solid ${s.theme_id===tm.id?tm.accent:tm.border}`,borderRadius:11,padding:"8px 4px",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{tm.emoji}</div>
                <div style={{fontSize:9,color:tm.text,fontWeight:500}}>{tm.name.split(" ").slice(1).join(" ")}</div>
              </div>
            ))}
          </div>
        </Overlay>
      )}
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",background:t.soft,borderRadius:12,padding:"8px 12px"}}>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:50,height:50,borderRadius:"50%",overflow:"hidden",border:`2px solid ${t.accent}`,background:t.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
            {s.photo_url?<img src={s.photo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:t.emoji}
          </div>
          <label style={{position:"absolute",bottom:-2,right:-2,width:18,height:18,borderRadius:"50%",background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9,color:"#fff"}}>
            📷<input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const file=e.target.files&&e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>upd({photo_url:ev.target.result});reader.readAsDataURL(file);}}/>
          </label>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:t.text}}>{s.name}</div>
          <div style={{fontSize:10,color:t.text,opacity:.6,display:"flex",alignItems:"center",gap:4}}>
            📅 {s.enroll_date||"—"}
            <span onClick={()=>setShowEditStart(true)} style={{cursor:"pointer",fontSize:9,opacity:.6}}>✏️</span>
          </div>
        </div>
        {s.photo_url&&<span onClick={()=>upd({photo_url:null})} style={{fontSize:10,color:"#e53935",cursor:"pointer"}}>✕</span>}
      </div>
      {showEditStart&&(
        <Overlay onClose={()=>setShowEditStart(false)} maxW={300}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📅 Эхлэх огноо засах</div>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={INP}/>
          <div style={{display:"flex",gap:7,marginTop:12}}>
            <button onClick={()=>setShowEditStart(false)} style={bs("#fff","#333","#e0e0e0")}>Болих</button>
            <button onClick={()=>{upd({enroll_date:startDate});setShowEditStart(false);}} style={{...bs(t.accent,"#fff"),flex:1,justifyContent:"center"}}>Хадгалах</button>
          </div>
        </Overlay>
      )}
      {/* ── ИДЭВХТЭЙ ШАЛГАЛТЫН POPUP ── */}
      {(() => {
        const myClassExams=(exams||[]).filter(e=>e.class_id===s.class_id&&e.status==="active");
        const mySubsIds=new Set((examSubs||[]).filter(es=>es.student_id===s.id).map(es=>es.exam_id));
        const upcomingExam=myClassExams.find(e=>!mySubsIds.has(e.id));
        if(!upcomingExam||activeExam)return null;
        return(
          <div className="k-pop" style={{
            background:`linear-gradient(135deg,#ff5722,#e64a19)`,
            color:"#fff",borderRadius:18,padding:18,marginBottom:14,
            boxShadow:"0 8px 24px rgba(229,57,53,0.35)",
            border:"3px solid #fff",
            animation:"kPulse 2s ease-in-out infinite",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div className="k-bouncy" style={{fontSize:36}}>🏆</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,opacity:.9,letterSpacing:1}}>ИДЭВХТЭЙ ШАЛГАЛТ</div>
                <div style={{fontSize:16,fontWeight:900}}>{upcomingExam.title}</div>
              </div>
            </div>
            <div style={{fontSize:12,opacity:.95,marginBottom:10}}>
              ⏱️ {upcomingExam.duration_minutes} минут · {upcomingExam.question_count} асуулт
            </div>
            <button onClick={()=>setActiveExam(upcomingExam)} className="k-btn k-press"
              style={{width:"100%",background:"#fff",color:"#e64a19",border:"none",borderRadius:12,padding:"12px",fontWeight:900,fontSize:14,cursor:"pointer",boxShadow:"0 4px 0 rgba(0,0,0,0.2)"}}>
              🚀 ШАЛГАЛТ ӨГӨХ
            </button>
          </div>
        );
      })()}

      {/* ── СОЛОНГОС ХЭЛЭЭ БЭЛДЭХ ТОВЧ ── */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={()=>setShowPractice(true)} className="k-btn k-press"
          style={{
            flex:1,background:`linear-gradient(135deg,${t.accent},${t.accent}cc)`,
            color:"#fff",border:"none",borderRadius:14,padding:"12px",
            fontWeight:800,fontSize:13,cursor:"pointer",
            boxShadow:`0 4px 0 ${t.border}`,
            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
          }}>
          🎓 Солонгос хэлээ бэлдэх
        </button>
      </div>

      <div style={{display:"flex",gap:5,marginBottom:14,background:t.soft,borderRadius:12,padding:4,overflowX:"auto"}}>
        {[["card","📋"],["daily","📅"],["homework","📝"],["vocab","📚"],["weak","⚠️"],["leaderboard","🏆"]].map(item=>{
          // Даалгавар tab дээр badge — хийгээгүй даалгаврын тоо
          const pendingHwCount=item[0]==="homework"?(() => {
            const myHws=(homeworks||[]).filter(h=>h.class_id===s.class_id);
            const submittedIds=new Set((homeworkSubs||[]).filter(hs=>hs.student_id===s.id).map(hs=>hs.homework_id));
            return myHws.filter(h=>!submittedIds.has(h.id)&&new Date(h.due_date)>new Date()).length;
          })():0;
          return(
            <button key={item[0]} onClick={()=>setTab(item[0])} className="k-press"
              style={{flex:1,minWidth:44,padding:"9px 2px",borderRadius:9,border:"none",position:"relative",
                background:tab===item[0]?t.card:"transparent",
                color:tab===item[0]?t.accent:t.text,
                fontWeight:tab===item[0]?700:500,
                fontSize:16,cursor:"pointer",transition:"all .15s",
                boxShadow:tab===item[0]?`0 2px 8px ${t.accent}33`:"none"}}>{item[1]}
              {pendingHwCount>0&&<span style={{position:"absolute",top:1,right:3,background:"#e53935",color:"#fff",borderRadius:8,padding:"0 4px",fontSize:9,fontWeight:800,minWidth:14,textAlign:"center"}}>{pendingHwCount}</span>}
            </button>
          );
        })}
      </div>
      {tab==="daily"&&<DailyCalendarTab vocabEntries={vocabEntries} t={t} classDays={classDays}/>}
      {tab==="leaderboard"&&<div className="k-fade" style={{background:t.card,borderRadius:18,padding:16,border:`2px solid ${t.border}`}}><div style={{fontWeight:700,fontSize:15,color:t.text,marginBottom:14,textAlign:"center"}}>🏆 Ангийн жагсаалт</div><Leaderboard students={classmates} myId={s.id} classColor={classColor||t.accent}/></div>}
      {tab==="vocab"&&<VocabTab vocabEntries={vocabEntries} t={t}/>}

      {/* ── ДААЛГАВАР TAB ── */}
      {tab==="homework"&&(() => {
        const myHws=(homeworks||[]).filter(h=>h.class_id===s.class_id).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));
        const mySubs=(homeworkSubs||[]).filter(hs=>hs.student_id===s.id);
        const subMap=Object.fromEntries(mySubs.map(sub=>[sub.homework_id,sub]));
        const pendingHws=myHws.filter(h=>!subMap[h.id]&&new Date(h.due_date)>new Date());
        const completedHws=myHws.filter(h=>subMap[h.id]);
        const overdueHws=myHws.filter(h=>!subMap[h.id]&&new Date(h.due_date)<=new Date());

        return(
          <div className="k-fade" style={{background:t.card,borderRadius:18,padding:14,border:`2px solid ${t.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:15,color:t.text}}>📝 Гэрийн даалгавар</div>
              <div style={{fontSize:11,color:t.text,opacity:.6}}>{myHws.length} нийт</div>
            </div>

            {myHws.length===0&&(
              <div style={{textAlign:"center",padding:"30px 0"}}>
                <div style={{fontSize:48,opacity:.4,marginBottom:8}}>🌙</div>
                <div style={{fontSize:13,color:t.text,opacity:.6}}>Даалгавар байхгүй байна</div>
              </div>
            )}

            {pendingHws.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:t.accent,marginBottom:6,letterSpacing:.5}}>🎯 ХҮЛЭЭГДЭЖ БУЙ ({pendingHws.length})</div>
                {pendingHws.map(hw=>(
                  <StudentHomeworkCard key={hw.id} hw={hw} vocabEntries={vocabEntries} t={t}
                    isCompleted={false} submission={null}
                    onStart={(h,vs)=>setActiveHw({hw:h,vocabs:vs})}/>
                ))}
              </div>
            )}

            {completedHws.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"#43a047",marginBottom:6,letterSpacing:.5}}>✅ ХИЙСЭН ({completedHws.length})</div>
                {completedHws.map(hw=>(
                  <StudentHomeworkCard key={hw.id} hw={hw} vocabEntries={vocabEntries} t={t}
                    isCompleted={true} submission={subMap[hw.id]}
                    onStart={()=>{}}/>
                ))}
              </div>
            )}

            {overdueHws.length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#c62828",marginBottom:6,letterSpacing:.5}}>❌ ХОЦОРСОН ({overdueHws.length})</div>
                {overdueHws.map(hw=>(
                  <StudentHomeworkCard key={hw.id} hw={hw} vocabEntries={vocabEntries} t={t}
                    isCompleted={false} submission={null}
                    onStart={()=>{}}/>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ШАЛГАЛТ ӨГӨХ ── */}
      {activeExam&&(
        <div style={{position:"fixed",inset:0,zIndex:5000,background:t.bg}}>
          <StudentExamScreen
            exam={activeExam}
            vocabEntries={vocabEntries}
            student={s}
            t={t}
            onComplete={({score,xpEarned})=>{
              // Card дээр XP автомат шинэчлэгдэнэ (loadAll-аар refresh болно)
              setTimeout(()=>{setActiveExam(null);refreshAll&&refreshAll();},3500);
            }}
            onToast={(msg,type)=>setExamFinishToast({msg,type:type||"success"})}/>
        </div>
      )}

      {/* ── ДААЛГАВАР ХИЙХ (Бэлдэх дасгал) ── */}
      {activeHw&&(
        <div style={{position:"fixed",inset:0,zIndex:5000}}>
          <PracticeStudio
            vocabs={activeHw.vocabs.filter(v=>v.type!=="grammar")}
            grammars={activeHw.vocabs.filter(v=>v.type==="grammar")}
            t={t}
            level={s.level||0}
            title={`📝 ${activeHw.hw.title}`}
            mode="homework"
            onClose={()=>setActiveHw(null)}
            onComplete={async({score,correct,total})=>{
              // Submission илгээх
              const sub={
                id:`hsub${Date.now()}`,
                homework_id:activeHw.hw.id,
                student_id:s.id,
                score:Math.round(score),
                on_time:new Date(activeHw.hw.due_date)>=new Date(),
              };
              try{
                const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
                await fetch(`${SUPA_URL}/rest/v1/homework_submissions`,{method:"POST",headers:h,body:JSON.stringify(sub)});
                // XP нэмэх
                const xpAdd=activeHw.hw.xp_reward||30;
                const newXp=(s.xp||0)+xpAdd;
                await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${s.id}`,{method:"PATCH",headers:h,body:JSON.stringify({xp:newXp})});
                _db.students=_db.students.map(x=>x.id===s.id?{...x,xp:newXp}:x);
                setStudents(p=>p.map(x=>x.id===s.id?{...x,xp:newXp}:x));
                refreshAll&&refreshAll();
              }catch(e){console.error("HW submit err",e);}
            }}/>
        </div>
      )}

      {/* ── СОЛОНГОС ХЭЛЭЭ БЭЛДЭХ ── */}
      {showPractice&&(
        <div style={{position:"fixed",inset:0,zIndex:5000}}>
          <PracticeStudio
            vocabs={vocabEntries.filter(v=>v.type!=="grammar")}
            grammars={vocabEntries.filter(v=>v.type==="grammar")}
            t={t}
            level={s.level||0}
            title="🌸 Хэлээ бэлдэх"
            mode="free"
            onClose={()=>setShowPractice(false)}
            onComplete={async({score,correct,total})=>{
              // Free practice — нэмэлт XP (5%)
              const xpAdd=Math.round((correct||0)*2);
              if(xpAdd>0){
                const newXp=(s.xp||0)+xpAdd;
                try{
                  const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"};
                  await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${s.id}`,{method:"PATCH",headers:h,body:JSON.stringify({xp:newXp})});
                  _db.students=_db.students.map(x=>x.id===s.id?{...x,xp:newXp}:x);
                  setStudents(p=>p.map(x=>x.id===s.id?{...x,xp:newXp}:x));
                }catch(e){console.error("XP update err",e);}
              }
            }}/>
        </div>
      )}

      {/* ── Exam finish toast ── */}
      <Toast msg={examFinishToast?.msg} type={examFinishToast?.type} onDone={()=>setExamFinishToast(null)}/>
      {tab==="weak"&&(
        <div style={{background:t.card,borderRadius:18,padding:16,border:`2px solid ${t.border}`}}>
          <div style={{fontWeight:700,fontSize:14,color:t.text,marginBottom:12}}>⚠️ Эргэлзэж буй үгс</div>
          {(s.weak_words||[]).length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#aaa"}}>🎉 Эргэлзэж буй үг байхгүй!</div>:(
            <div>
              {(s.weak_words||[]).filter(w=>w.wtype!=="grammar").length>0&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,color:"#e65100",marginBottom:7}}>📚 Үгс</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>{(s.weak_words||[]).filter(w=>w.wtype!=="grammar").map((w,i)=><div key={i} style={{background:"#fff8f0",border:"1px solid #ffcc80",borderRadius:9,padding:"7px 10px"}}><div style={{fontWeight:700,fontSize:13,color:"#e65100"}}>{w.word}</div><div style={{fontSize:11,color:"#888"}}>{w.meaning}</div></div>)}</div></div>}
              {(s.weak_words||[]).filter(w=>w.wtype==="grammar").length>0&&<div><div style={{fontSize:11,fontWeight:700,color:"#7c3aed",marginBottom:7}}>📖 Дүрэм</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>{(s.weak_words||[]).filter(w=>w.wtype==="grammar").map((w,i)=><div key={i} style={{background:"#f5f0ff",border:"1px solid #c5b8ff",borderRadius:9,padding:"7px 10px"}}><div style={{fontWeight:700,fontSize:13,color:"#7c3aed"}}>{w.word}</div><div style={{fontSize:11,color:"#888"}}>{w.meaning}</div></div>)}</div></div>}
            </div>
          )}
          <div style={{marginTop:12,borderTop:"1px solid #f0f0f0",paddingTop:12}}>
            <div style={{position:"relative"}}>
              <input value={weakSearch} onChange={e=>{setWeakSearch(e.target.value);setShowWeakDD(true);}} onFocus={()=>setShowWeakDD(true)} placeholder="Ойлгохгүй үг хайх..." style={{...INP,fontSize:12,padding:"6px 10px"}}/>
              {showWeakDD&&filteredVocab.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1px solid #e0e0e0",borderRadius:10,boxShadow:"0 4px 16px #0002",zIndex:100,maxHeight:160,overflowY:"auto"}}>
                  {filteredVocab.map(v=>(
                    <div key={v.id} style={{padding:"8px 12px",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #f5f5f5"}}>
                      <div><span style={{fontWeight:600}}>{v.word}</span><span style={{color:"#888",fontSize:11,marginLeft:6}}>{v.meaning}</span></div>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>{upd({weak_words:[...(s.weak_words||[]),{word:v.word,meaning:v.meaning,miss:1,wtype:"vocab"}]});setWeakSearch("");setShowWeakDD(false);}} style={{fontSize:10,padding:"2px 7px",borderRadius:6,border:"1px solid #e65100",background:"#fff8f0",color:"#e65100",cursor:"pointer"}}>үг</button>
                        {v.type==="grammar"&&<button onClick={()=>{upd({weak_words:[...(s.weak_words||[]),{word:v.word,meaning:v.meaning,miss:1,wtype:"grammar"}]});setWeakSearch("");setShowWeakDD(false);}} style={{fontSize:10,padding:"2px 7px",borderRadius:6,border:"1px solid #7c3aed",background:"#f5f0ff",color:"#7c3aed",cursor:"pointer"}}>дүрэм</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {tab==="card"&&(
        <div ref={printRef}>
          <CardContent s={s} t={t} isAdmin={false} isSuperAdmin={false} upd={upd}
            attMonth={attM} setAttMonth={setAttM} classDays={classDays}
            vocabEntries={vocabEntries} sessions={sessions} present={present}
            learnedVocab={learnedVocab} totalVocab={allVocab.length}
            onToggleAtt={()=>{}} hideUI={false}
            setShowPay={()=>{}} setEditNotes={()=>{}} editNotes={false}
            notes={s.teacher_notes||""} setNotes={()=>{}}
            homeworks={homeworks} homeworkSubs={homeworkSubs} exams={exams} examSubs={examSubs}
            weakSearch={weakSearch} setWeakSearch={setWeakSearch} showWeakDD={showWeakDD} setShowWeakDD={setShowWeakDD}/>
        </div>
      )}
    </div>
  );
}

// ── ADMIN STUDENT DETAIL ──────────────────────────────
function AdminStudentDetail({s,setStudents,goBack,attMonth,setAttMonth,classDays,vocabEntries,badgeDefs,setBadgeDefs,isSuperAdmin,homeworks,homeworkSubs,exams,examSubs}){
  const [showPay,setShowPay]=useState(false);
  const [payForm,setPayForm]=useState({total:"",amount:"",date:"",next_due:"",note:""});
  const [showThemes,setShowThemes]=useState(false);
  const [showBadges,setShowBadges]=useState(false);
  const [showLevels,setShowLevels]=useState(false);
  const [showXP,setShowXP]=useState(false);
  const [xpDay,setXpDay]=useState(null);
  const [xpForm,setXpForm]=useState({hw:false,hwXP:50,exam:false,examScore:""});
  const [editNotes,setEditNotes]=useState(false);
  const [notes,setNotes]=useState(s.teacher_notes||"");
  const [editMeta,setEditMeta]=useState(false);
  const [metaForm,setMetaForm]=useState({name:s.name,enroll_date:s.enroll_date||"",phone:s.phone||"",rd:s.rd||""});
  const [hideUI,setHideUI]=useState(false);
  const [weakSearch,setWeakSearch]=useState("");
  const [showWeakDD,setShowWeakDD]=useState(false);
  const [lvlList,setLvlList]=useState([..._levels]);
  const [showTransfer,setShowTransfer]=useState(false);
  const [transferCls,setTransferCls]=useState(s.class_id);
  const printRef=useRef();

  const t=getT(s.theme_id);
  const sessions=getSessions(classDays,attMonth);
  const present=sessions.filter(item=>(s.attendance||{})[item.date]).length;
  const allVocab=vocabEntries.filter(v=>v.type==="vocab");
  const learnedVocab=Math.max(0,allVocab.length-(s.weak_words||[]).length);

  const upd=useCallback(async patch=>{
    _db.students=_db.students.map(x=>x.id===s.id?{...x,...patch}:x);
    setStudents(p=>p.map(x=>x.id===s.id?{...x,...patch}:x));
    try{
      const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"};
      await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${s.id}`,{method:"PATCH",headers:h,body:JSON.stringify(patch)});
    }catch(e){console.error("Sync err",e);}
  },[s.id,setStudents]);

  const toggleAtt=(date)=>{
    const cur=(s.attendance||{})[date]||false;
    const newAtt={...(s.attendance||{}),[date]:!cur};
    if(!cur){setXpDay(date);setShowXP(true);}
    upd({attendance:newAtt,xp:Math.max(0,(s.xp||0)+(!cur?20:0))});
  };

  const applyXP=()=>{
    let extra=0,newStreak=s.hw_streak||0,newMiss=s.hw_miss||0;
    if(xpForm.hw){extra+=Number(xpForm.hwXP)||50;newStreak+=1;newMiss=0;}
    else{newMiss=Math.min(3,(newMiss||0)+1);if(newMiss>=3)newStreak=0;}
    if(xpForm.exam)extra+=Math.round((Number(xpForm.examScore)||0)*2);
    upd({xp:(s.xp||0)+extra,hw_streak:newStreak,hw_miss:newMiss});
    setShowXP(false);
    setXpForm({hw:false,hwXP:50,exam:false,examScore:""});
  };

  const savePay=async()=>{
    const amt=Number(payForm.amount);
    if(!amt||!payForm.date)return;
    const newPay={id:`p${Date.now()}`,student_id:s.id,amount:amt,paid_at:payForm.date,next_due:payForm.next_due||null,note:payForm.note||""};
    _db.payments.push(newPay);
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
    await fetch(`${SUPA_URL}/rest/v1/payments`,{method:"POST",headers:h,body:JSON.stringify(newPay)});
    upd({total_paid:(s.total_paid||0)+amt,total_fee:Number(payForm.total)||s.total_fee||0,next_due:payForm.next_due||s.next_due});
    setShowPay(false);
  };

  const doPrint=()=>{
    const el=printRef.current;
    if(!el)return;
    const w=window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${s.name}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:${t.bg};font-family:system-ui;padding:14px;max-width:640px;margin:0 auto}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>{w.focus();w.print();},300);
  };

  return(
    <div style={{minHeight:"100vh",background:t.bg,fontFamily:"system-ui",padding:14,overflowX:"hidden",boxSizing:"border-box"}}>
      <div style={{maxWidth:640,margin:"0 auto"}}>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={goBack} style={bs(t.card,t.text,t.border,true)}>← Буцах</button>
          <button onClick={()=>setShowThemes(true)} style={bs(t.accent,"#fff",undefined,true)}>🎨</button>
          <button onClick={()=>setShowBadges(true)} style={bs(t.soft,t.accent,t.border,true)}>🏅</button>
          <button onClick={()=>{setLvlList([..._levels]);setShowLevels(true);}} style={bs(t.soft,t.accent,t.border,true)}>⭐</button>
          <button onClick={()=>{setTransferCls(s.class_id);setShowTransfer(true);}} style={bs("#e8f5e9","#2e7d32","#a5d6a7",true)}>🔄 Анги</button>
          <button onClick={()=>setHideUI(h=>!h)} style={bs(hideUI?"#1a1a2e":"#f0f0f0",hideUI?"#fff":"#333","#ccc",true)}>{hideUI?"👁":"🙈"}</button>
          <button onClick={doPrint} style={{...bs(t.accent,"#fff",undefined,true),marginLeft:"auto"}}>🖨️</button>
        </div>

        {editMeta&&(
          <div style={{background:t.card,borderRadius:14,padding:14,marginBottom:12,border:`1px solid ${t.border}`}}>
            {[["Нэр","name","text"],["Утас","phone","text"],["РД","rd","text"],["Эхэлсэн огноо","enroll_date","date"]].map(item=>(
              <div key={item[0]} style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"#888",marginBottom:2}}>{item[0]}</div>
                <input type={item[2]} value={metaForm[item[1]]||""} onChange={e=>setMetaForm(p=>({...p,[item[1]]:e.target.value}))} style={{...INP,fontSize:12,padding:"6px 9px"}}/>
              </div>
            ))}
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{upd(metaForm);setEditMeta(false);}} style={bs(t.accent,"#fff",undefined,true)}>✓ Хадгалах</button>
              <button onClick={()=>setEditMeta(false)} style={bs(t.soft,t.text,t.border,true)}>Болих</button>
            </div>
          </div>
        )}
        {!editMeta&&!hideUI&&(
          <div style={{textAlign:"right",marginBottom:8}}>
            <button onClick={()=>{setMetaForm({name:s.name,enroll_date:s.enroll_date||"",phone:s.phone||"",rd:s.rd||""});setEditMeta(true);}} style={bs(t.soft,t.text,t.border,true)}>✏️ Мэдээлэл засах</button>
          </div>
        )}

        <div ref={printRef}>
          <CardContent s={s} t={t} isAdmin={true} isSuperAdmin={isSuperAdmin} upd={upd}
            attMonth={attMonth} setAttMonth={setAttMonth} classDays={classDays}
            vocabEntries={vocabEntries} sessions={sessions} present={present}
            learnedVocab={learnedVocab} totalVocab={allVocab.length}
            onToggleAtt={toggleAtt} hideUI={hideUI}
            setShowPay={setShowPay} setEditNotes={setEditNotes} editNotes={editNotes}
            notes={notes} setNotes={setNotes}
            homeworks={homeworks} homeworkSubs={homeworkSubs} exams={exams} examSubs={examSubs}
            weakSearch={weakSearch} setWeakSearch={setWeakSearch}
            showWeakDD={showWeakDD} setShowWeakDD={setShowWeakDD}/>
        </div>
      </div>

      {showXP&&(
        <Overlay onClose={()=>setShowXP(false)}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>⚡ XP нэмэх — {xpDay}</div>
          <div style={{fontSize:12,color:"#888",marginBottom:12}}>Ирц: +20 XP нэмэгдлээ</div>
          {[{key:"hw",label:"📝 Гэрийн даалгавар хийсэн",xpKey:"hwXP",suffix:"XP"},{key:"exam",label:"🏆 Шалгалт өгсөн",xpKey:"examScore",suffix:"×2 XP"}].map(item=>(
            <label key={item.key} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"1px solid #e0e0e0",borderRadius:10,cursor:"pointer",marginBottom:8,background:xpForm[item.key]?"#e8f5e9":"#fff"}}>
              <input type="checkbox" checked={xpForm[item.key]} onChange={e=>setXpForm(p=>({...p,[item.key]:e.target.checked}))}/>
              <span style={{fontWeight:500,flex:1}}>{item.label}</span>
              {xpForm[item.key]&&(
                <input type="number" value={xpForm[item.xpKey]} onChange={e=>setXpForm(p=>({...p,[item.xpKey]:e.target.value}))}
                  style={{width:65,padding:"3px 6px",borderRadius:6,border:"1px solid #e0e0e0",fontSize:12}} onClick={e=>e.stopPropagation()}/>
              )}
              {xpForm[item.key]&&<span style={{fontSize:11,color:"#888"}}>{item.suffix}</span>}
            </label>
          ))}
          <div style={{background:"#f8f8f8",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:12}}>
            Нийт: <b>+{20+(xpForm.hw?Number(xpForm.hwXP)||50:0)+(xpForm.exam?Math.round((Number(xpForm.examScore)||0)*2):0)} XP</b>
            {xpForm.hw?<span style={{marginLeft:8,color:"#2e7d32"}}>🔥 Streak +1</span>:<span style={{marginLeft:8,color:"#e65100"}}>⚠️ Streak алдана</span>}
          </div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setShowXP(false)} style={bs("#fff","#333","#e0e0e0")}>Алгасах</button>
            <button onClick={applyXP} style={{...bs("#7c3aed","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>✓ Хадгалах</button>
          </div>
        </Overlay>
      )}

      {showPay&&(
        <Overlay onClose={()=>setShowPay(false)}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:13}}>💳 Төлбөр нэмэх</div>
          {[["Нийт хураамж (₮)","total","number"],["Төлсөн (₮)","amount","number"],["Огноо","date","date"],["Дараагийн огноо","next_due","date"],["Тэмдэглэл","note","text"]].map(item=>(
            <div key={item[0]} style={{marginBottom:9}}>
              <div style={{fontSize:11,color:"#888",marginBottom:2}}>{item[0]}</div>
              <input type={item[2]} value={payForm[item[1]]} onChange={e=>setPayForm(p=>({...p,[item[1]]:e.target.value}))} style={INP}/>
            </div>
          ))}
          <div style={{display:"flex",gap:7,marginTop:6}}>
            <button onClick={()=>setShowPay(false)} style={bs("#fff","#333","#e0e0e0")}>Болих</button>
            <button onClick={savePay} style={{...bs("#7c3aed","#fff"),flex:1,justifyContent:"center"}}>Хадгалах</button>
          </div>
        </Overlay>
      )}

      {showThemes&&(
        <Overlay onClose={()=>setShowThemes(false)} maxW={360}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>🎨 Theme</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
            {THEMES.map(tm=>(
              <div key={tm.id} onClick={()=>{upd({theme_id:tm.id});setShowThemes(false);}}
                style={{background:tm.card,border:`2px solid ${s.theme_id===tm.id?tm.accent:tm.border}`,borderRadius:11,padding:"8px 4px",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{tm.emoji}</div>
                <div style={{fontSize:9,color:tm.text,fontWeight:500}}>{tm.name.split(" ").slice(1).join(" ")}</div>
              </div>
            ))}
          </div>
        </Overlay>
      )}

      {showBadges&&(
        <Overlay onClose={()=>setShowBadges(false)}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>🏅 Badge</div>
          {badgeDefs.map((bd,i)=>{
            const has=(s.badges||[]).includes(bd.id);
            return(
              <div key={bd.id} style={{marginBottom:8,border:`1px solid ${has?"#f9a825":"#e0e0e0"}`,borderRadius:10,overflow:"hidden"}}>
                <div onClick={()=>{const cur=s.badges||[];upd({badges:cur.includes(bd.id)?cur.filter(b=>b!==bd.id):[...cur,bd.id]});}}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:has?"#fff3cd":"#fafafa",cursor:"pointer"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{bd.label}</div>
                    <div style={{fontSize:10,color:"#888"}}>{bd.auto?"Автомат":"Гараар"}</div>
                  </div>
                  <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${has?"#f9a825":"#ccc"}`,background:has?"#f9a825":"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{has?"✓":""}</div>
                </div>
                <div style={{padding:"5px 10px",background:"#f8f8f8"}}>
                  <input value={bd.label} onChange={e=>{const u=badgeDefs.map((b,j)=>j===i?{...b,label:e.target.value}:b);setBadgeDefs(u);_db.badge_defs=u;}}
                    style={{width:"100%",fontSize:11,padding:"3px 7px",borderRadius:6,border:"1px solid #e0e0e0",outline:"none"}}/>
                </div>
              </div>
            );
          })}
        </Overlay>
      )}

      {showLevels&&(
        <Overlay onClose={()=>setShowLevels(false)} maxW={360}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>⭐ Лэвэлийн нэр засах</div>
          {lvlList.map((lv,i)=>{
            const isCur=getLvl(s.xp||0).level===lv.level;
            return(
              <div key={lv.level} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"6px 10px",borderRadius:9,background:isCur?"#f0f0ff":"#f8f8f8",border:isCur?"1px solid #7c3aed":"1px solid #eee"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{lv.level}</div>
                <input value={lv.name} onChange={e=>{const u=lvlList.map((x,j)=>j===i?{...x,name:e.target.value}:x);setLvlList(u);}}
                  style={{flex:1,fontSize:13,padding:"4px 8px",borderRadius:6,border:"1px solid #e0e0e0",outline:"none"}}/>
                <div style={{fontSize:10,color:"#888",flexShrink:0}}>{lv.xp} XP</div>
              </div>
            );
          })}
          <button onClick={()=>{_levels=[...lvlList];setShowLevels(false);}} style={{...bs("#7c3aed","#fff"),width:"100%",justifyContent:"center",marginTop:6}}>✓ Хадгалах</button>
        </Overlay>
      )}

      {showTransfer&&(
        <Overlay onClose={()=>setShowTransfer(false)} maxW={340}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>🔄 Анги солих</div>
          <div style={{fontSize:12,color:"#888",marginBottom:10}}>Одоогийн анги: <b>{_db.classes.find(c=>c.id===s.class_id)?.name||"—"}</b></div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
            {_db.classes.map(c=>(
              <div key={c.id} onClick={()=>setTransferCls(c.id)}
                style={{padding:"10px 14px",borderRadius:11,border:`2px solid ${transferCls===c.id?c.color:"#eee"}`,background:transferCls===c.id?c.color+"15":"#f8f8f8",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:c.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
                  <div style={{fontSize:10,color:"#888"}}>🕐 {c.time}</div>
                </div>
                {c.id===s.class_id&&<span style={{fontSize:10,color:"#aaa"}}>Одоогийн</span>}
                {transferCls===c.id&&c.id!==s.class_id&&<span style={{fontSize:11,color:c.color,fontWeight:700}}>✓</span>}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setShowTransfer(false)} style={bs("#fff","#333","#e0e0e0")}>Болих</button>
            <button disabled={transferCls===s.class_id}
              onClick={()=>{upd({class_id:transferCls,attendance:{},hw_streak:0,hw_miss:0});setShowTransfer(false);goBack();}}
              style={{...bs(transferCls!==s.class_id?"#2e7d32":"#ccc","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>
              ✅ Шилжүүлэх
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── PAYMENT REPORT ────────────────────────────────────
function PaymentReport({students,onClose}){
  const totalFee=students.reduce((sum,st)=>sum+(st.total_fee||0),0);
  const totalPaid=students.reduce((sum,st)=>sum+(st.total_paid||0),0);
  const unpaid=students.filter(st=>(st.total_paid||0)<(st.total_fee||0));
  const paid=students.filter(st=>(st.total_fee||0)>0&&(st.total_paid||0)>=(st.total_fee||0));
  const overdue=students.filter(st=>st.next_due&&st.next_due<TODAY&&(st.total_paid||0)<(st.total_fee||0));
  return(
    <Overlay onClose={onClose} maxW={480}>
      <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>💰 Төлбөрийн тайлан</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[["Нийт орлого",fmt(totalPaid),"#2e7d32"],["Нийт хураамж",fmt(totalFee),"#555"],["Үлдэгдэл",fmt(totalFee-totalPaid),totalFee-totalPaid>0?"#e53935":"#2e7d32"]].map(item=>(
          <div key={item[0]} style={{background:"#f8f8f8",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:800,color:item[2]}}>{item[1]}</div>
            <div style={{fontSize:9,color:"#888",marginTop:2}}>{item[0]}</div>
          </div>
        ))}
      </div>
      {overdue.length>0&&(
        <div style={{background:"#fce4ec",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#c62828",marginBottom:6}}>⚠️ Хугацаа хэтэрсэн ({overdue.length})</div>
          {overdue.map(st=>(
            <div key={st.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:"1px solid #f48fb133"}}>
              <span style={{fontWeight:600}}>{st.name}</span>
              <span style={{color:"#c62828"}}>-{fmt((st.total_fee||0)-(st.total_paid||0))} · {st.next_due}</span>
            </div>
          ))}
        </div>
      )}
      {unpaid.length>0&&(
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#e65100",marginBottom:6}}>💸 Дутуу төлсөн ({unpaid.length})</div>
          {unpaid.map(st=>{
            const t2=getT(st.theme_id);
            const bal=(st.total_fee||0)-(st.total_paid||0);
            const pct=st.total_fee?Math.round((st.total_paid||0)/st.total_fee*100):0;
            return(
              <div key={st.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:9,marginBottom:5,background:"#fff8f0",border:"1px solid #ffe0b2"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:t2.soft,border:`2px solid ${t2.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{t2.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12}}>{st.name}</div>
                  <div style={{height:4,background:"#eee",borderRadius:4,marginTop:3}}>
                    <div style={{height:4,background:t2.accent,borderRadius:4,width:`${pct}%`}}/>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#e53935"}}>-{fmt(bal)}</div>
                  <div style={{fontSize:9,color:"#888"}}>{pct}% төлсөн</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {paid.length>0&&(
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#2e7d32",marginBottom:6}}>✅ Бүрэн төлсөн ({paid.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {paid.map(st=>{
              const t2=getT(st.theme_id);
              return(
                <div key={st.id} style={{display:"flex",alignItems:"center",gap:5,background:"#e8f5e9",borderRadius:20,padding:"3px 10px 3px 5px",border:"1px solid #a5d6a7"}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:t2.soft,border:`1px solid ${t2.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>{t2.emoji}</div>
                  <span style={{fontSize:11,fontWeight:600,color:"#2e7d32"}}>{st.name.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Overlay>
  );
}

// ── ADMIN PANEL ───────────────────────────────────────
function AdminPanel({students,setStudents,currentTeacherId,onClose}){
  const [resetId,setResetId]=useState(null);
  const [newPass,setNewPass]=useState("");
  const [resetOk,setResetOk]=useState(null);
  const [showTeacherChangePw,setShowTeacherChangePw]=useState(null);
  const [showPwId,setShowPwId]=useState(null);
  const [tick,setTick]=useState(0);
  const [approveId,setApproveId]=useState(null);
  const [approveForm,setApproveForm]=useState({class_id:_db.classes[0]?.id||"",theme_id:"sakura",level:0});
  const [showAddTeacher,setShowAddTeacher]=useState(false);
  const [editTeacherId,setEditTeacherId]=useState(null);
  const [tf,setTf]=useState({name:"",email:"",password:"",role:"teacher",class_ids:[]});
  const [tErr,setTErr]=useState("");

  const pending=[..._pending];

  const doReset=async(sid)=>{
    if(newPass.length<6)return;
    _db.students=_db.students.map(s=>s.id===sid?{...s,password:newPass}:s);
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"};
    await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${sid}`,{method:"PATCH",headers:h,body:JSON.stringify({password:newPass})});
    setResetOk(sid);setNewPass("");setResetId(null);
    setTimeout(()=>setResetOk(null),2000);
  };

  const approvePending=async(pnd)=>{
    if(!approveForm.class_id)return;
    const allG=_db.vocab_entries.filter(v=>v.class_id===approveForm.class_id&&v.type==="grammar").length;
    const newSt={
      id:`s${Date.now()}`,class_id:approveForm.class_id,
      name:pnd.name,email:pnd.email,password:pnd.password,rd:pnd.rd||"",phone:pnd.phone||"",
      photo_url:null,enroll_date:TODAY,level:Number(approveForm.level)||0,
      theme_id:approveForm.theme_id||"sakura",
      student_code:Math.random().toString(36).slice(2,10).toUpperCase(),
      xp:0,badges:[],weak_words:[],teacher_notes:"",attendance:{},
      total_paid:0,total_fee:0,next_due:null,
      grammar_learned:allG,grammar_total:allG,hw_streak:0,hw_miss:0,
    };
    _db.students.push(newSt);
    setStudents(p=>[...p,newSt]);
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
    await fetch(`${SUPA_URL}/rest/v1/students`,{method:"POST",headers:h,body:JSON.stringify(newSt)});
    await fetch(`${SUPA_URL}/rest/v1/pending_students?id=eq.${pnd.id}`,{method:"DELETE",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`}});
    const idx=_pending.findIndex(p=>p.id===pnd.id);
    if(idx!==-1)_pending.splice(idx,1);
    setApproveId(null);setTick(t=>t+1);
  };

  const rejectPending=async(id)=>{
    const idx=_pending.findIndex(p=>p.id===id);
    if(idx!==-1)_pending.splice(idx,1);
    await fetch(`${SUPA_URL}/rest/v1/pending_students?id=eq.${id}`,{method:"DELETE",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`}});
    setTick(t=>t+1);
  };

  const saveTeacher=async()=>{
    setTErr("");
    if(!tf.name.trim()){setTErr("Нэр оруулна уу.");return;}
    if(!tf.email.trim()||!tf.email.includes("@")){setTErr("И-мэйл буруу байна.");return;}
    if(!editTeacherId&&tf.password.length<6){setTErr("Нууц үг 6+ тэмдэгт байх ёстой.");return;}
    const emLow=tf.email.trim().toLowerCase();
    if(_teachers.find(t=>t.email.toLowerCase()===emLow&&t.id!==editTeacherId)){setTErr("Энэ и-мэйл аль хэдийн бүртгэлтэй.");return;}
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
    if(editTeacherId){
      const idx=_teachers.findIndex(t=>t.id===editTeacherId);
      const updated={..._teachers[idx],name:tf.name.trim(),email:emLow,role:tf.role,class_ids:tf.class_ids,...(tf.password.length>=6?{password:tf.password}:{})};
      if(idx!==-1)_teachers[idx]=updated;
      await fetch(`${SUPA_URL}/rest/v1/teachers?id=eq.${editTeacherId}`,{method:"PATCH",headers:h,body:JSON.stringify(updated)});
    } else {
      const newT={id:`t${Date.now()}`,name:tf.name.trim(),email:emLow,password:tf.password,role:tf.role,class_ids:tf.class_ids};
      _teachers.push(newT);
      await fetch(`${SUPA_URL}/rest/v1/teachers`,{method:"POST",headers:h,body:JSON.stringify(newT)});
    }
    setShowAddTeacher(false);setEditTeacherId(null);setTf({name:"",email:"",password:"",role:"teacher",class_ids:[]});setTick(t=>t+1);
  };

  const deleteTeacher=async(tid)=>{
    if(tid===currentTeacherId)return;
    const idx=_teachers.findIndex(t=>t.id===tid);
    if(idx!==-1)_teachers.splice(idx,1);
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
    await fetch(`${SUPA_URL}/rest/v1/teachers?id=eq.${tid}`,{method:"DELETE",headers:h});
    setTick(t=>t+1);
  };

  return(
    <Overlay onClose={onClose} maxW={520}>
      <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>🔑 Бүртгэл & Удирдлага</div>

      {/* Teachers */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
          <div style={{fontWeight:700,fontSize:13,color:"#7c3aed"}}>👩‍🏫 Багш нар</div>
          <button onClick={()=>{setShowAddTeacher(true);setEditTeacherId(null);setTf({name:"",email:"",password:"",role:"teacher",class_ids:[]});setTErr("");}} style={bs("#7c3aed","#fff",undefined,true)}>+ Нэмэх</button>
        </div>
        {showAddTeacher&&(
          <div style={{background:"#f5f0ff",borderRadius:12,padding:12,marginBottom:10,border:"1px solid #c5b8ff"}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:"#7c3aed"}}>{editTeacherId?"✏️ Засах":"➕ Шинэ багш"}</div>
            {[["Нэр *","name","text"],["И-мэйл *","email","email"],[editTeacherId?"Шинэ нууц үг (хоосон=хэвээр)":"Нууц үг * (6+)","password","password"]].map(item=>(
              <div key={item[0]} style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"#888",marginBottom:2}}>{item[0]}</div>
                <input type={item[2]} value={tf[item[1]]} onChange={e=>setTf(p=>({...p,[item[1]]:e.target.value}))}
                  placeholder={item[1]==="email"?"KoreanSem2@school.mn":""} style={{...INP,fontSize:12,padding:"6px 9px"}}/>
              </div>
            ))}
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,color:"#888",marginBottom:4}}>Эрх</div>
              <div style={{display:"flex",gap:6}}>
                {[["teacher","👩‍🏫 Ердийн"],["superadmin","⭐ Super Admin"]].map(item=>(
                  <button key={item[0]} onClick={()=>setTf(p=>({...p,role:item[0]}))} style={bs(tf.role===item[0]?"#7c3aed":"#f0f0f0",tf.role===item[0]?"#fff":"#555",undefined,true)}>{item[1]}</button>
                ))}
              </div>
            </div>
            {tf.role==="teacher"&&(
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"#888",marginBottom:4}}>Ангиуд</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {_db.classes.map(c=>{
                    const sel=(tf.class_ids||[]).includes(c.id);
                    return(
                      <button key={c.id} onClick={()=>setTf(p=>({...p,class_ids:sel?p.class_ids.filter(x=>x!==c.id):[...p.class_ids,c.id]}))}
                        style={bs(sel?c.color:"#f0f0f0",sel?"#fff":"#555",undefined,true)}>{c.name}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {tErr&&<div style={{marginBottom:8,padding:"6px 10px",background:"#fce4ec",borderRadius:7,fontSize:11,color:"#c62828"}}>{tErr}</div>}
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setShowAddTeacher(false);setEditTeacherId(null);}} style={bs("#fff","#555","#e0e0e0",true)}>Болих</button>
              <button onClick={saveTeacher} style={{...bs("#7c3aed","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>{editTeacherId?"✓ Хадгалах":"➕ Нэмэх"}</button>
            </div>
          </div>
        )}
        {_teachers.map(t=>{
          const isMe=t.id===currentTeacherId;
          const pwVis=showPwId===t.id;
          return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:10,marginBottom:5,background:isMe?"#f5f0ff":"#f8f8f8",border:isMe?"1.5px solid #7c3aed":"1px solid #eee"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,color:isMe?"#7c3aed":"#333",display:"flex",alignItems:"center",gap:5}}>
                  {t.name}{isMe&&<span style={{fontSize:9}}>(Та)</span>}
                  <span style={{fontSize:9,background:t.role==="superadmin"?"#f0f0ff":"#f0fff4",color:t.role==="superadmin"?"#7c3aed":"#2e7d32",borderRadius:5,padding:"1px 5px"}}>{t.role==="superadmin"?"SUPER":"БАГШ"}</span>
                </div>
                <div style={{fontSize:10,color:"#888"}}>{t.email}</div>
                {t.role==="teacher"&&t.class_ids&&t.class_ids.length>0&&(
                  <div style={{fontSize:9,color:"#aaa"}}>{t.class_ids.map(id=>_db.classes.find(c=>c.id===id)?.name||id).join(", ")}</div>
                )}
                {isMe?(
                  <div style={{fontSize:10,color:"#aaa",display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                    🔑 <b style={{fontFamily:"monospace",color:pwVis?"#7c3aed":"#aaa"}}>{pwVis?t.password:"•".repeat(Math.min(8,t.password.length))}</b>
                    <span onClick={()=>setShowPwId(pwVis?null:t.id)} style={{cursor:"pointer",fontSize:12,opacity:.5}}>{pwVis?"🙈":"👁"}</span>
                  </div>
                ):(
                  <div style={{fontSize:10,color:"#ddd",marginTop:2}}>🔑 {"•".repeat(8)}</div>
                )}
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {isMe&&<button onClick={()=>setShowTeacherChangePw(t.id)} style={bs("#f0f0ff","#7c3aed","#c5b8ff",true)}>🔐</button>}
                <button onClick={()=>{setEditTeacherId(t.id);setTf({name:t.name,email:t.email,password:"",role:t.role,class_ids:t.class_ids||[]});setShowAddTeacher(true);setTErr("");}} style={bs("#f8f8f8","#555","#e0e0e0",true)}>✏️</button>
                {!isMe&&t.role!=="superadmin"&&(
                  <button onClick={()=>deleteTeacher(t.id)} style={bs("#fce4ec","#c62828","#f48fb1",true)}>🗑️</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{height:1,background:"#f0f0f0",margin:"4px 0 14px"}}/>

      {/* Pending */}
      {pending.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,color:"#e65100",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
            ⏳ Хүлээгдэж буй бүртгэл
            <span style={{background:"#e65100",color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>{pending.length}</span>
          </div>
          {pending.map(pnd=>(
            <div key={pnd.id} style={{marginBottom:8,borderRadius:12,border:"2px solid #ffe0b2",overflow:"hidden"}}>
              <div style={{padding:"10px 12px",background:"#fff8f0",display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:22}}>🙋</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13}}>{pnd.name}</div>
                  <div style={{fontSize:10,color:"#888"}}>{pnd.email}{pnd.phone?` · ${pnd.phone}`:""}</div>
                  <div style={{fontSize:10,color:"#aaa"}}>РД: {pnd.rd||"—"} · 📅 {pnd.registered_at}</div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  <button onClick={()=>setApproveId(approveId===pnd.id?null:pnd.id)} style={bs("#2e7d32","#fff",undefined,true)}>✓</button>
                  <button onClick={()=>rejectPending(pnd.id)} style={bs("#fce4ec","#c62828","#f48fb1",true)}>✕</button>
                </div>
              </div>
              {approveId===pnd.id&&(
                <div style={{padding:"10px 12px",background:"#f1f8e9",borderTop:"1px solid #dcedc8"}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                    <div style={{flex:2,minWidth:110}}>
                      <div style={{fontSize:10,color:"#888",marginBottom:2}}>Анги</div>
                      <select value={approveForm.class_id} onChange={e=>setApproveForm(p=>({...p,class_id:e.target.value}))} style={{...INP,fontSize:12,padding:"5px 8px"}}>
                        {_db.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div style={{flex:1,minWidth:90}}>
                      <div style={{fontSize:10,color:"#888",marginBottom:2}}>TOPIK</div>
                      <select value={approveForm.level} onChange={e=>setApproveForm(p=>({...p,level:+e.target.value}))} style={{...INP,fontSize:12,padding:"5px 8px"}}>
                        {TOPIK.map((l,i)=><option key={i} value={i}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:"#888",marginBottom:4}}>Theme</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {THEMES.slice(0,9).map(tm=>(
                        <div key={tm.id} onClick={()=>setApproveForm(p=>({...p,theme_id:tm.id}))}
                          style={{width:30,height:30,borderRadius:7,background:tm.card,border:`2px solid ${approveForm.theme_id===tm.id?tm.accent:tm.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,cursor:"pointer"}}>{tm.emoji}</div>
                      ))}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setApproveId(null)} style={bs("#fff","#333","#e0e0e0",true)}>Болих</button>
                    <button onClick={()=>approvePending(pnd)} style={{...bs("#2e7d32","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>✅ Ангид нэмэх</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{height:1,background:"#f0f0f0",margin:"4px 0 14px"}}/>

      {/* Students */}
      <div style={{fontWeight:700,fontSize:13,color:"#555",marginBottom:7}}>🎓 Сурагчид</div>
      {students.map(s=>{
        const t2=getT(s.theme_id);
        const cls=_db.classes.find(c=>c.id===s.class_id);
        const isReset=resetId===s.id;
        const pwVis=showPwId===s.id;
        const curPw=_db.students.find(x=>x.id===s.id)?.password||"";
        return(
          <div key={s.id} style={{marginBottom:7,borderRadius:11,border:"1px solid #eee",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:"#f8f8f8"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:t2.soft,border:`2px solid ${t2.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{t2.emoji}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                <div style={{fontSize:10,color:"#888"}}>{cls?.name||"—"} · {s.email||"—"}</div>
                <div style={{fontSize:10,color:"#aaa"}}>РД: {s.rd||"—"}</div>
                <div style={{fontSize:10,color:"#aaa",display:"flex",alignItems:"center",gap:4,marginTop:1}}>
                  🔑 <b style={{fontFamily:"monospace",color:pwVis?"#7c3aed":"#aaa"}}>{pwVis?curPw:"•".repeat(Math.min(8,curPw.length))}</b>
                  <span onClick={()=>setShowPwId(pwVis?null:s.id)} style={{cursor:"pointer",fontSize:12,opacity:.5}}>{pwVis?"🙈":"👁"}</span>
                </div>
              </div>
              {resetOk===s.id
                ?<span style={{fontSize:11,color:"#2e7d32",fontWeight:600}}>✅</span>
                :<button onClick={()=>{setResetId(isReset?null:s.id);setNewPass("");}} style={bs(isReset?"#fce4ec":"#fff3cd",isReset?"#c62828":"#b8860b",undefined,true)}>{isReset?"✕":"🔑"}</button>}
            </div>
            {isReset&&(
              <div style={{padding:"9px 12px",background:"#fffde7",display:"flex",gap:6,alignItems:"center"}}>
                <input value={newPass} onChange={e=>setNewPass(e.target.value)} type="text"
                  placeholder="Шинэ нууц үг (6+)" onKeyDown={e=>e.key==="Enter"&&doReset(s.id)}
                  style={{...INP,flex:1,fontSize:12,padding:"6px 9px"}}/>
                <button onClick={()=>doReset(s.id)} disabled={newPass.length<6}
                  style={bs(newPass.length>=6?"#2e7d32":"#ccc","#fff",undefined,true)}>✓</button>
              </div>
            )}
          </div>
        );
      })}
      {showTeacherChangePw&&<ChangePasswordModal onClose={()=>setShowTeacherChangePw(null)} teacherId={showTeacherChangePw}/>}
    </Overlay>
  );
}

// ── CLASS DETAIL ──────────────────────────────────────
function ClassDetail({cls,isAdmin,isSuperAdmin,students,setStudents,setClasses,goBack,attMonth,setAttMonth,badgeDefs,setBadgeDefs,teacherId,homeworks,homeworkSubs,exams,examSubs,refreshAll}){
  const [selSid,setSelSid]=useState(null);
  const [showAddSt,setShowAddSt]=useState(false);
  const [confirmDel,setConfirmDel]=useState(null);
  const [editName,setEditName]=useState(false);
  const [nameVal,setNameVal]=useState(cls.name);
  const [showVocab,setShowVocab]=useState(false);
  const [classDays,setClassDays]=useState(cls.days||[]);
  const [vocabDate,setVocabDate]=useState(TODAY);
  const [vocabType,setVocabType]=useState("vocab");
  const [vocabWord,setVocabWord]=useState("");
  const [vocabMean,setVocabMean]=useState("");
  const [vocabTranslating,setVocabTranslating]=useState(false);
  const [ns,setNs]=useState({name:"",enroll_date:"",level:0,theme_id:"sakura",phone:"",email:"",password:"",rd:""});
  const [tick,setTick]=useState(0);
  const [showPayReport,setShowPayReport]=useState(false);
  const [confirmDelCls,setConfirmDelCls]=useState(false);
  const [showBulkAtt,setShowBulkAtt]=useState(false);
  const [showCreateHw,setShowCreateHw]=useState(false);
  const [showHwList,setShowHwList]=useState(false);
  const [showCreateExam,setShowCreateExam]=useState(false);
  const [selExam,setSelExam]=useState(null);
  const [toast,setToast]=useState(null);
  const showToast=(msg,type)=>setToast({msg,type:type||"success"});

  const vocabEntries=_db.vocab_entries.filter(v=>v.class_id===cls.id);
  // Class-ийн даалгавар, шалгалт
  const classHws=(homeworks||[]).filter(h=>h.class_id===cls.id);
  const classExams=(exams||[]).filter(e=>e.class_id===cls.id);
  const activeExam=classExams.find(e=>e.status==="active");

  if(selSid){
    // Эхлээд React state-ээс, дараа нь _db-ээс хайна — interval refresh-ийн үед undefined болохгүй
    const st=students.find(s=>s.id===selSid)||_db.students.find(s=>s.id===selSid);
    if(st)return(
      <AdminStudentDetail s={st} setStudents={setStudents} goBack={()=>setSelSid(null)}
        attMonth={attMonth} setAttMonth={setAttMonth} classDays={classDays}
        vocabEntries={vocabEntries} badgeDefs={badgeDefs} setBadgeDefs={setBadgeDefs} isSuperAdmin={isSuperAdmin}
        homeworks={homeworks} homeworkSubs={homeworkSubs} exams={exams} examSubs={examSubs}/>
    );
    // Хэрэв олдсонгүй бол loading харуулна, шууд буцахгүй
    return(
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",background:cls.color+"22"}}>
        <div className="k-bouncy" style={{fontSize:48,marginBottom:12}}>⏳</div>
        <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:8}}>Сурагчийн мэдээлэл ачаалж байна...</div>
        <button onClick={()=>setSelSid(null)} className="k-btn k-press" style={bs("#f0f0f0","#555","#e0e0e0",true)}>← Буцах</button>
      </div>
    );
  }

  const addVocabEntry=async()=>{
    if(!vocabWord.trim())return;
    const monthFromDate=vocabDate.slice(0,7);
    const newVocab={id:`ve${Date.now()}`,class_id:cls.id,month:monthFromDate,date:vocabDate,word:vocabWord.trim(),meaning:vocabMean.trim(),type:vocabType};
    _db.vocab_entries.push(newVocab);
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
    try{
      await fetch(`${SUPA_URL}/rest/v1/vocab_entries`,{method:"POST",headers:h,body:JSON.stringify(newVocab)});
    }catch(e){console.warn("Vocab sync err",e);}
    if(vocabType==="grammar"){
      _db.students.filter(s=>s.class_id===cls.id).forEach(s=>{
        _db.students=_db.students.map(x=>x.id===s.id?{...x,grammar_total:(x.grammar_total||0)+1,grammar_learned:(x.grammar_learned||0)+1}:x);
      });
      setStudents(prev=>prev.map(s=>s.class_id!==cls.id?s:{...s,grammar_total:(s.grammar_total||0)+1,grammar_learned:(s.grammar_learned||0)+1}));
    }
    setVocabWord("");setVocabMean("");setTick(t=>t+1);
    showToast(`✅ ${vocabType==="vocab"?"Үг":"Дүрэм"} нэмэгдлээ`);
  };

  const printVocabPDF=()=>{
    const months=[...new Set(vocabEntries.map(v=>v.month))].sort();
    const rows=months.map(mo=>{
      const vs=vocabEntries.filter(v=>v.month===mo&&v.type==="vocab");
      const gs=vocabEntries.filter(v=>v.month===mo&&v.type==="grammar");
      return `<div style="margin-bottom:20px"><h3 style="color:#7c3aed;margin-bottom:8px">📅 ${mo}</h3>${vs.length?`<p style="font-weight:600;margin-bottom:5px">Үгс (${vs.length})</p>${vs.map((v,i)=>`<span style="display:inline-block;margin:2px 4px;padding:3px 9px;background:#f3e8ff;border-radius:6px;font-size:13px">${i+1}. ${v.word} <span style="color:#888;font-size:11px">${v.meaning}</span></span>`).join("")}`:""}${gs.length?`<p style="font-weight:600;margin:8px 0 5px">Дүрэм (${gs.length})</p>${gs.map(v=>`<span style="display:inline-block;margin:2px 4px;padding:3px 9px;background:#e8f5e9;border-radius:6px;font-size:13px">${v.word} <span style="color:#888;font-size:11px">${v.meaning}</span></span>`).join("")}`:""}`;
    }).join("");
    const w=window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${cls.name}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;padding:24px;max-width:700px;margin:0 auto}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body><h1 style="margin-bottom:4px">📚 ${cls.name}</h1><p style="color:#888;font-size:13px;margin-bottom:20px">${new Date().toLocaleDateString("mn-MN")}</p>${rows}</body></html>`);
    w.document.close();
    setTimeout(()=>{w.focus();w.print();},300);
  };

  return(
    <div style={{minHeight:"100vh",background:"#f8f9ff",fontFamily:"system-ui",padding:16,overflowX:"hidden",boxSizing:"border-box"}}>
      <div style={{maxWidth:840,margin:"0 auto"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <button onClick={goBack} style={bs("#fff","#333","#e0e0e0",true)}>← Буцах</button>
          <div style={{flex:1,minWidth:0}}>
            {editName?(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={nameVal} onChange={e=>setNameVal(e.target.value)} autoFocus style={{fontSize:15,fontWeight:700,padding:"4px 10px",borderRadius:8,border:"2px solid #7c3aed",outline:"none",width:180}}/>
                <button onClick={async()=>{
                  try{
                    const newName=nameVal.trim();
                    if(!newName)return;
                    _db.classes=_db.classes.map(c=>c.id===cls.id?{...c,name:newName}:c);
                    setClasses&&setClasses(p=>p.map(c=>c.id===cls.id?{...c,name:newName}:c));
                    await fetch(`${SUPA_URL}/rest/v1/classes?id=eq.${cls.id}`,{method:"PATCH",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({name:newName})});
                    cls.name=newName;
                    setEditName(false);
                    showToast("✅ Нэр шинэчлэгдлээ");
                  }catch(e){
                    console.error("Name update err",e);
                    showToast("❌ Хадгалахад алдаа гарлаа","error");
                  }
                }} style={bs("#7c3aed","#fff",undefined,true)}>✓</button>
                <button onClick={()=>setEditName(false)} style={bs("#fff","#333","#e0e0e0",true)}>✕</button>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:16,fontWeight:800,color:"#1a1a2e"}}>{cls.name}</span>
                {isAdmin&&<span onClick={()=>setEditName(true)} style={{cursor:"pointer",opacity:.4,fontSize:12}}>✏️</span>}
              </div>
            )}
            <div style={{fontSize:11,color:"#888"}}>🕐 {cls.time} · {classDays.map(d=>DLABELS[d]).join(", ")}</div>
          </div>
          {isAdmin&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <button onClick={()=>setShowBulkAtt(true)} className="k-btn k-press" style={{...bs("#43a047","#fff",undefined,true),fontWeight:700,boxShadow:"0 3px 0 #2e7d32"}}>✅ Ирц</button>
              <button onClick={()=>setShowCreateHw(true)} className="k-btn k-press" style={{...bs("#7c3aed","#fff",undefined,true),fontWeight:700,boxShadow:"0 3px 0 #5b21b6"}}>📝 Даалгавар</button>
              <button onClick={()=>setShowHwList(true)} className="k-btn k-press" style={{...bs("#fff","#7c3aed","#d4b8ff",true),position:"relative"}}>📋
                {classHws.length>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#e53935",color:"#fff",borderRadius:8,padding:"1px 5px",fontSize:9,fontWeight:800}}>{classHws.length}</span>}
              </button>
              <button onClick={()=>activeExam?setSelExam(activeExam):setShowCreateExam(true)} className="k-btn k-press" style={{...bs(activeExam?"#43a047":"#ff9800","#fff",undefined,true),fontWeight:700,boxShadow:activeExam?"0 3px 0 #2e7d32":"0 3px 0 #ef6c00"}}>
                🏆 {activeExam?"Идэвхтэй":"Шалгалт"}
              </button>
              <button onClick={()=>setShowVocab(v=>!v)} className="k-btn k-press" style={bs("#fff3cd","#b8860b","#f9a825",true)}>{showVocab?"✕":"📚"}</button>
              <button onClick={printVocabPDF} className="k-btn k-press" style={bs("#e8f5e9","#2e7d32","#a5d6a7",true)}>🖨️</button>
              {isSuperAdmin&&<button onClick={()=>setShowPayReport(true)} className="k-btn k-press" style={bs("#e8f5e9","#2e7d32","#a5d6a7",true)}>💰</button>}
              <button onClick={()=>setShowAddSt(true)} className="k-btn k-press" style={bs(cls.color,"#fff",undefined,true)}>+ Нэмэх</button>
              {isSuperAdmin&&<button onClick={()=>setConfirmDelCls(true)} className="k-btn k-press" style={bs("#fff0f0","#e53935","#ffcdd2",true)}>🗑️</button>}
            </div>
          )}
        </div>

        {/* Bulk Attendance modal */}
        {showBulkAtt&&(
          <BulkAttendance
            students={students}
            classDays={classDays}
            setStudents={setStudents}
            onClose={()=>setShowBulkAtt(false)}
            onToast={showToast}/>
        )}

        {/* Create Homework modal */}
        {showCreateHw&&(
          <CreateHomeworkModal
            cls={cls}
            vocabEntries={vocabEntries}
            students={students}
            teacherId={teacherId}
            onClose={()=>setShowCreateHw(false)}
            onCreated={()=>{refreshAll&&refreshAll();}}
            onToast={showToast}/>
        )}

        {/* Homework List modal */}
        {showHwList&&(
          <HomeworkListModal
            cls={cls}
            students={students}
            vocabEntries={vocabEntries}
            homeworks={homeworks||[]}
            submissions={homeworkSubs||[]}
            isSuperAdmin={isSuperAdmin}
            currentTeacherId={teacherId}
            onClose={()=>setShowHwList(false)}
            onRefresh={()=>refreshAll&&refreshAll()}
            onToast={showToast}/>
        )}

        {/* Create Exam modal */}
        {showCreateExam&&(
          <CreateExamModal
            cls={cls}
            vocabEntries={vocabEntries}
            teacherId={teacherId}
            onClose={()=>setShowCreateExam(false)}
            onCreated={(ex)=>{refreshAll&&refreshAll();setSelExam(ex);}}
            onToast={showToast}/>
        )}

        {/* Exam Room modal */}
        {selExam&&(
          <ExamRoomModal
            exam={(exams||[]).find(e=>e.id===selExam.id)||selExam}
            cls={cls}
            students={students}
            vocabEntries={vocabEntries}
            examSubmissions={examSubs||[]}
            isOwner={selExam.teacher_id===teacherId||isSuperAdmin}
            onClose={()=>setSelExam(null)}
            onRefresh={()=>refreshAll&&refreshAll()}
            onToast={showToast}/>
        )}

        {/* Exams list (хэрэв активгүй бөгөөд олон шалгалт байвал) */}
        {!activeExam&&classExams.length>0&&!selExam&&!showCreateExam&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:"#888",marginBottom:6,paddingLeft:4}}>🏆 Шалгалтууд</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {classExams.slice(0,5).map(ex=>(
                <button key={ex.id} onClick={()=>setSelExam(ex)} className="k-btn k-press"
                  style={{background:ex.status==="finished"?"#e3f2fd":"#fff3cd",color:ex.status==="finished"?"#1565c0":"#b8860b",border:`1px solid ${ex.status==="finished"?"#90caf9":"#ffe082"}`,borderRadius:9,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {ex.status==="finished"?"🏁":"⏳"} {ex.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toast */}
        <Toast msg={toast?.msg} type={toast?.type} onDone={()=>setToast(null)}/>

        {/* Days editor */}
        {isAdmin&&(
          <div style={{background:"#fff",borderRadius:12,padding:10,marginBottom:12,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:600,color:"#555"}}>Өдрүүд:</span>
            {[1,2,3,4,5,6,7].map(d=>{
              const active=classDays.includes(d);
              return(
                <button key={d} onClick={async()=>{
                  const nd=active?classDays.filter(x=>x!==d):[...classDays,d].sort();
                  setClassDays(nd);
                  _db.classes=_db.classes.map(c=>c.id===cls.id?{...c,days:nd}:c);
                  setClasses&&setClasses(p=>p.map(c=>c.id===cls.id?{...c,days:nd}:c));
                  cls.days=nd; // local ref
                  await fetch(`${SUPA_URL}/rest/v1/classes?id=eq.${cls.id}`,{method:"PATCH",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({days:nd})});
                }}
                  style={bs(active?cls.color:"#f0f0f0",active?"#fff":"#333",undefined,true)}>{DLABELS[d]}</button>
              );
            })}
          </div>
        )}

        {/* Vocab panel */}
        {showVocab&&(
          <div className="k-fade" style={{background:"#fff",borderRadius:14,padding:14,marginBottom:14,border:"2px solid #e1d5ff",boxShadow:"0 4px 16px rgba(124,58,237,0.08)"}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:10,color:"#7c3aed",display:"flex",alignItems:"center",gap:6}}>📚 Үг / Дүрэм нэмэх</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:5,background:"#f5f0ff",borderRadius:9,padding:"2px 4px 2px 9px"}}>
                <span style={{fontSize:11,color:"#7c3aed",fontWeight:700}}>📅</span>
                <input type="date" value={vocabDate} max={TODAY} onChange={e=>setVocabDate(e.target.value)} 
                  style={{...INP,width:"auto",fontSize:12,padding:"5px 8px",border:"none",background:"transparent",fontWeight:700,color:"#7c3aed"}}/>
                <button onClick={()=>setVocabDate(TODAY)} className="k-btn k-press" title="Өнөөдөр" style={{...bs("#fff","#7c3aed","#d4b8ff",true),padding:"3px 8px"}}>Өнөөдөр</button>
              </div>
              <button onClick={()=>setVocabType("vocab")} className="k-btn k-press" style={bs(vocabType==="vocab"?"#7c3aed":"#f0f0f0",vocabType==="vocab"?"#fff":"#333",undefined,true)}>📚 Үг</button>
              <button onClick={()=>setVocabType("grammar")} className="k-btn k-press" style={bs(vocabType==="grammar"?"#2e7d32":"#f0f0f0",vocabType==="grammar"?"#fff":"#333",undefined,true)}>📖 Дүрэм</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              <input value={vocabWord} onChange={e=>setVocabWord(e.target.value)} placeholder="한국어" style={{...INP,flex:2,fontSize:14,padding:"8px 10px",fontWeight:600,minWidth:120}} onKeyDown={e=>e.key==="Enter"&&addVocabEntry()}/>
              <button onClick={async()=>{
                if(!vocabWord.trim())return;
                setVocabTranslating(true);
                try{
                  const mn=await translateKrToMn(vocabWord.trim());
                  if(mn)setVocabMean(mn);
                  else showToast("⚠️ Орчуулга олдсонгүй","warning");
                }catch(e){
                  showToast("❌ AI алдаа: "+e.message,"error");
                }finally{
                  setVocabTranslating(false);
                }
              }} className="k-btn k-press" 
                disabled={vocabTranslating||!vocabWord.trim()}
                title="AI-аар орчуулах"
                style={{...bs("#42a5f5","#fff",undefined,true),padding:"8px 10px",opacity:(vocabTranslating||!vocabWord.trim())?.5:1}}>
                {vocabTranslating?"⏳":"✨"}
              </button>
              <input value={vocabMean} onChange={e=>setVocabMean(e.target.value)} placeholder="Монгол утга" style={{...INP,flex:2,fontSize:13,padding:"8px 10px",minWidth:120}} onKeyDown={e=>e.key==="Enter"&&addVocabEntry()}/>
              <button onClick={addVocabEntry} className="k-btn k-press" style={{...bs("#7c3aed","#fff",undefined,true),fontWeight:800,padding:"8px 16px",boxShadow:"0 3px 0 #5b21b6"}}>+ Нэмэх</button>
            </div>
            {(() => {
              // өдрөөр болон сараар бүлэглэх
              const grouped={};
              vocabEntries.forEach(v=>{
                const key=v.date||v.month||"unknown";
                if(!grouped[key])grouped[key]=[];
                grouped[key].push(v);
              });
              const keys=Object.keys(grouped).sort().reverse();
              return keys.map(key=>(
                <div key={key} style={{marginBottom:8,paddingBottom:6,borderBottom:"1px solid #f0f0f0"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#7c3aed",marginBottom:4}}>📅 {key.length===10?fmtDate(key):key}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {grouped[key].map(v=>(
                      <div key={v.id} style={{display:"flex",alignItems:"center",gap:4,background:v.type==="vocab"?"#f3e8ff":"#e8f5e9",border:`1px solid ${v.type==="vocab"?"#a78bfa":"#66bb6a"}`,borderRadius:8,padding:"3px 8px",fontSize:11,transition:"transform .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.04)"}
                        onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                        <span style={{fontWeight:700}}>{v.word}</span>
                        {v.meaning&&<span style={{opacity:.65,fontSize:10}}>{v.meaning}</span>}
                        <span onClick={async()=>{
                          _db.vocab_entries=_db.vocab_entries.filter(x=>x.id!==v.id);
                          await fetch(`${SUPA_URL}/rest/v1/vocab_entries?id=eq.${v.id}`,{method:"DELETE",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`}});
                          setTick(t=>t+1);
                          showToast("🗑️ Устгагдлаа","info");
                        }} style={{cursor:"pointer",opacity:.4,fontSize:11,marginLeft:2}}
                          onMouseEnter={e=>e.target.style.opacity="1"}
                          onMouseLeave={e=>e.target.style.opacity=".4"}>✕</span>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* Month picker */}
        <div style={{background:"#fff",borderRadius:12,padding:10,marginBottom:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:600,color:"#555"}}>Сар:</span>
          <input type="month" value={attMonth} onChange={e=>setAttMonth(e.target.value)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #e0e0e0",fontSize:12,outline:"none"}}/>
          <span style={{fontSize:11,color:"#aaa"}}>{getSessions(classDays,attMonth).length} хичээл</span>
        </div>

        {/* Student grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
          {students.map(s=>{
            const t2=getT(s.theme_id);
            const sess=getSessions(classDays,attMonth);
            const pres=sess.filter(item=>(s.attendance||{})[item.date]).length;
            const due=(s.total_paid||0)<(s.total_fee||0);
            return(
              <div key={s.id} style={{background:t2.card,borderRadius:16,padding:11,border:`2px solid ${t2.border}`,position:"relative"}}>
                {isSuperAdmin&&due&&<div style={{position:"absolute",top:8,right:8,width:8,height:8,borderRadius:"50%",background:"#f44336"}}/>}
                {isAdmin&&<div onClick={()=>setConfirmDel(s.id)} style={{position:"absolute",top:7,left:7,width:18,height:18,borderRadius:"50%",background:"#ff000018",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9,color:"#c62828",fontWeight:700,opacity:.7}}>✕</div>}
                <div onClick={()=>setSelSid(s.id)} style={{cursor:"pointer"}}>
                  <div style={{width:46,height:46,borderRadius:"50%",overflow:"hidden",margin:"6px auto 5px",border:`2px solid ${t2.accent}`,background:t2.soft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>
                    {s.photo_url?<img src={s.photo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:t2.emoji}
                  </div>
                  <div style={{textAlign:"center",fontWeight:700,fontSize:11,color:t2.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name.split(" ")[0]}</div>
                  <div style={{textAlign:"center",fontSize:9,color:t2.accent,marginBottom:2}}>{TOPIK[s.level||0]}</div>
                  <div style={{textAlign:"center",fontSize:9,color:t2.text,opacity:.5,marginBottom:3}}>⚡{s.xp||0} · 🔥{s.hw_streak||0}</div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:2,marginBottom:3}}>
                  {sess.map(item=>{
                    const ok=(s.attendance||{})[item.date]||false;
                    return <div key={item.date} style={{width:12,height:12,borderRadius:3,background:ok?t2.accent:t2.soft,flexShrink:0}}/>;
                  })}
                </div>
                <div style={{height:3,background:t2.soft,borderRadius:3}}>
                  <div style={{height:3,background:t2.accent,borderRadius:3,width:`${sess.length?Math.round(pres/sess.length*100):0}%`}}/>
                </div>
                <div style={{textAlign:"center",fontSize:8,color:t2.text,opacity:.4,marginTop:2}}>{pres}/{sess.length}</div>
              </div>
            );
          })}
        </div>

        {/* Confirm delete */}
        {confirmDel&&(
          <Overlay onClose={()=>setConfirmDel(null)}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>🗑️</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:5}}>Сурагч устгах уу?</div>
              <div style={{fontSize:13,color:"#888",marginBottom:16}}><b>{students.find(s=>s.id===confirmDel)?.name}</b></div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmDel(null)} style={{...bs("#fff","#333","#e0e0e0"),flex:1,justifyContent:"center"}}>Болих</button>
                <button onClick={async()=>{
                  _db.students=_db.students.filter(s=>s.id!==confirmDel);
                  setStudents(p=>p.filter(s=>s.id!==confirmDel));
                  await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${confirmDel}`,{method:"DELETE",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`}});
                  setConfirmDel(null);
                }}
                  style={{...bs("#e53935","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>Устгах</button>
              </div>
            </div>
          </Overlay>
        )}

        {/* Add student */}
        {showAddSt&&(
          <Overlay onClose={()=>setShowAddSt(false)} maxW={370}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>Сурагч нэмэх</div>
            {[["Нэр","name","text"],["И-мэйл","email","email"],["Нууц үг","password","password"],["РД","rd","text"],["Утас","phone","text"],["Эхэлсэн огноо","enroll_date","date"]].map(item=>(
              <div key={item[0]} style={{marginBottom:9}}>
                <div style={{fontSize:11,color:"#888",marginBottom:2}}>{item[0]}</div>
                <input type={item[2]} value={ns[item[1]]||""} onChange={e=>setNs(p=>({...p,[item[1]]:e.target.value}))} style={INP}/>
              </div>
            ))}
            <div style={{marginBottom:9}}>
              <div style={{fontSize:11,color:"#888",marginBottom:2}}>TOPIK</div>
              <select value={ns.level} onChange={e=>setNs(p=>({...p,level:+e.target.value}))} style={INP}>
                {TOPIK.map((l,i)=><option key={i} value={i}>{l}</option>)}
              </select>
            </div>
            <div style={{marginBottom:13}}>
              <div style={{fontSize:11,color:"#888",marginBottom:5}}>Theme</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
                {THEMES.slice(0,9).map(tm=>(
                  <div key={tm.id} onClick={()=>setNs(p=>({...p,theme_id:tm.id}))}
                    style={{background:tm.card,border:`2px solid ${ns.theme_id===tm.id?tm.accent:tm.border}`,borderRadius:9,padding:"6px 3px",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:15}}>{tm.emoji}</div>
                    <div style={{fontSize:9,color:tm.text}}>{tm.name.split(" ").slice(1).join(" ")}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:7}}>
              <button onClick={()=>setShowAddSt(false)} style={bs("#fff","#333","#e0e0e0")}>Болих</button>
              <button onClick={async()=>{
                if(!ns.name||!ns.email||!ns.password)return;
                const allG=_db.vocab_entries.filter(v=>v.class_id===cls.id&&v.type==="grammar").length;
                const newSt={id:`s${Date.now()}`,class_id:cls.id,...ns,rd:(ns.rd||"").toUpperCase(),student_code:Math.random().toString(36).slice(2,10).toUpperCase(),xp:0,badges:[],weak_words:[],teacher_notes:"",attendance:{},total_paid:0,total_fee:0,next_due:null,photo_url:null,grammar_learned:allG,grammar_total:allG,hw_streak:0,hw_miss:0};
                _db.students.push(newSt);setStudents(p=>[...p,newSt]);
                const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
                await fetch(`${SUPA_URL}/rest/v1/students`,{method:"POST",headers:h,body:JSON.stringify(newSt)});
                setNs({name:"",enroll_date:"",level:0,theme_id:"sakura",phone:"",email:"",password:"",rd:""});setShowAddSt(false);
              }} style={{...bs(ns.name&&ns.email&&ns.password?"#7c3aed":"#ccc","#fff"),flex:1,justifyContent:"center"}}>Нэмэх</button>
            </div>
          </Overlay>
        )}

        {showPayReport&&<PaymentReport students={students} onClose={()=>setShowPayReport(false)}/>}

        {confirmDelCls&&(
          <Overlay onClose={()=>setConfirmDelCls(false)}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🗑️</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:5}}>"{cls.name}" ангийг устгах уу?</div>
              <div style={{fontSize:12,color:"#e53935",marginBottom:16}}>⚠️ Тухайн ангийн бүх мэдээлэл устана!</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmDelCls(false)} style={{...bs("#fff","#333","#e0e0e0"),flex:1,justifyContent:"center"}}>Болих</button>
                <button onClick={async()=>{
                  try{
                    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
                    // 1. Ангид харьяалагдах бүх сурагчийг устгах
                    const classSts=_db.students.filter(s=>s.class_id===cls.id);
                    for(const st of classSts){
                      await fetch(`${SUPA_URL}/rest/v1/students?id=eq.${st.id}`,{method:"DELETE",headers:h});
                    }
                    // 2. vocab_entries устгах
                    await fetch(`${SUPA_URL}/rest/v1/vocab_entries?class_id=eq.${cls.id}`,{method:"DELETE",headers:h});
                    // 3. Анги устгах
                    const r=await fetch(`${SUPA_URL}/rest/v1/classes?id=eq.${cls.id}`,{method:"DELETE",headers:h});
                    if(!r.ok){
                      const errTxt=await r.text();
                      showToast(`❌ Устгахад алдаа: ${errTxt.slice(0,80)}`,"error");
                      return;
                    }
                    // 4. Local state шинэчилэх — энэ нь өмнө дутуу байсан!
                    _db.classes=_db.classes.filter(c=>c.id!==cls.id);
                    _db.students=_db.students.filter(s=>s.class_id!==cls.id);
                    _db.vocab_entries=_db.vocab_entries.filter(v=>v.class_id!==cls.id);
                    setClasses&&setClasses(p=>p.filter(c=>c.id!==cls.id));
                    setStudents(p=>p.filter(s=>s.class_id!==cls.id));
                    setConfirmDelCls(false);
                    showToast("✅ Анги устгагдлаа");
                    setTimeout(()=>goBack(),300);
                  }catch(e){
                    console.error("Delete class err",e);
                    showToast("❌ Алдаа гарлаа: "+e.message,"error");
                  }
                }} style={{...bs("#e53935","#fff"),flex:1,justifyContent:"center",fontWeight:700}}>Устгах</button>
              </div>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────

// ── Session helpers (localStorage) ────────────────────
const SESSION_KEY="kandun_user_session_v1";
const loadSession=()=>{
  try{
    if(typeof localStorage==="undefined")return null;
    const raw=localStorage.getItem(SESSION_KEY);
    if(!raw)return null;
    const data=JSON.parse(raw);
    // 90 хоногийн хүчинтэй
    if(data.savedAt&&(Date.now()-data.savedAt)>90*24*60*60*1000){
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data.user;
  }catch(e){return null;}
};
const saveSession=(user)=>{
  try{
    if(typeof localStorage==="undefined")return;
    if(user){
      localStorage.setItem(SESSION_KEY,JSON.stringify({user,savedAt:Date.now()}));
    }else{
      localStorage.removeItem(SESSION_KEY);
    }
  }catch(e){console.warn("Session save err",e);}
};

export default function App(){
  const [user,setUserState]=useState(()=>loadSession()); // localStorage-аас ачаална
  // setUser-ийн орон setUserState-ыг ороогоор localStorage-д ч давхар хадгална
  const setUser=useCallback((newUser)=>{
    setUserState(newUser);
    saveSession(newUser);
  },[]);
  const [classes,setClasses]=useState([]);
  const [students,setStudents]=useState([]);
  const [badgeDefs,setBadgeDefs]=useState([]);
  const [homeworks,setHomeworks]=useState([]);
  const [homeworkSubs,setHomeworkSubs]=useState([]);
  const [exams,setExams]=useState([]);
  const [examSubs,setExamSubs]=useState([]);
  const [selCls,setSelCls]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [showAccounts,setShowAccounts]=useState(false);
  const [attMonth,setAttMonth]=useState(new Date().toISOString().slice(0,7));
  const [nc,setNc]=useState({name:"",time:"",days:[],color:"#e91e8c"});
  const [loading,setLoading]=useState(()=>!!loadSession()); // session байвал loading=true (data ачаалах хэрэгтэй)
  const [loadErr,setLoadErr]=useState(null);
  // Pull-to-refresh state
  const [pullY,setPullY]=useState(0);
  const [refreshing,setRefreshing]=useState(false);
  const pullStartRef=useRef(0);
  const pullingRef=useRef(false);

  const loadAll=useCallback(async(isInitial=true)=>{
    // Зөвхөн анхны ачаалалд UI-н алдаа харуулна.
    let uiTimeout=null;
    if(isInitial){
      uiTimeout=setTimeout(()=>{
        setLoading(false);
        setLoadErr("Холболт удаж байна. Дахин оролдоно уу.");
      },20000);
    }
    // Network-д timeout — 25 секунд хүрвэл цуцална
    const ctrl=new AbortController();
    const netTimeout=setTimeout(()=>ctrl.abort(),25000);
    try{
      const headers={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
      const opts={headers,signal:ctrl.signal};
      const [r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11]=await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/classes?select=*`,opts),
        fetch(`${SUPA_URL}/rest/v1/students?select=*`,opts),
        fetch(`${SUPA_URL}/rest/v1/badge_defs?select=*`,opts),
        fetch(`${SUPA_URL}/rest/v1/vocab_entries?select=*`,opts),
        fetch(`${SUPA_URL}/rest/v1/payments?select=*`,opts),
        fetch(`${SUPA_URL}/rest/v1/pending_students?select=*`,opts),
        fetch(`${SUPA_URL}/rest/v1/teachers?select=*`,opts),
        // Шинэ хүснэгтүүд (хэрэв миграйшн ажиллаагүй бол catch-аар алгасна)
        fetch(`${SUPA_URL}/rest/v1/homeworks?select=*`,opts).catch(()=>({ok:false})),
        fetch(`${SUPA_URL}/rest/v1/homework_submissions?select=*`,opts).catch(()=>({ok:false})),
        fetch(`${SUPA_URL}/rest/v1/exams?select=*`,opts).catch(()=>({ok:false})),
        fetch(`${SUPA_URL}/rest/v1/exam_submissions?select=*`,opts).catch(()=>({ok:false})),
      ]);
      clearTimeout(netTimeout);
      const parseJsonSafe=async(r)=>{try{if(!r||!r.ok)return[];return await r.json();}catch(e){return[];}};
      const [cls,sts,bds,voc,pays,pends,tchs,hws,hsubs,exs,esubs]=await Promise.all([
        r1.json(),r2.json(),r3.json(),r4.json(),r5.json(),r6.json(),r7.json(),
        parseJsonSafe(r8),parseJsonSafe(r9),parseJsonSafe(r10),parseJsonSafe(r11),
      ]);
      if(uiTimeout)clearTimeout(uiTimeout);
      _db.classes=Array.isArray(cls)?cls:[];
      _db.students=Array.isArray(sts)?sts.map(s=>({
        ...s,
        badges:Array.isArray(s.badges)?s.badges:[],
        weak_words:Array.isArray(s.weak_words)?s.weak_words:(s.weak_words?JSON.parse(s.weak_words):[]),
        attendance:s.attendance&&typeof s.attendance==="object"?s.attendance:{},
      })):[];
      _db.vocab_entries=Array.isArray(voc)?voc:[];
      _db.payments=Array.isArray(pays)?pays:[];
      _db.badge_defs=Array.isArray(bds)?bds:[];
      _pending.length=0;
      if(Array.isArray(pends))pends.forEach(p=>_pending.push(p));
      if(Array.isArray(tchs)&&tchs.length>0){_teachers.length=0;tchs.forEach(t=>_teachers.push(t));}
      setClasses([..._db.classes]);
      setStudents([..._db.students]);
      setBadgeDefs([..._db.badge_defs]);
      setHomeworks(Array.isArray(hws)?hws:[]);
      setHomeworkSubs(Array.isArray(hsubs)?hsubs:[]);
      setExams(Array.isArray(exs)?exs:[]);
      setExamSubs(Array.isArray(esubs)?esubs:[]);
      if(isInitial){
        setLoadErr(null);
        setLoading(false);
      }
    }catch(e){
      if(uiTimeout)clearTimeout(uiTimeout);
      clearTimeout(netTimeout);
      // Background refresh fail хийвэл ЧИМЭЭГҮЙ. Зөвхөн console-д log.
      if(isInitial){
        console.error("Initial load error:",e);
        setLoadErr("Холболтын алдаа. Хуудсыг refresh хийгээд үзнэ үү.");
        setLoading(false);
      }else{
        console.warn("Background refresh failed (silent):",e.message);
      }
    }
  },[]);

  useEffect(()=>{
    if(user&&user.role==="teacher"){
      loadAll(true); // анхны ачаалал
      const interval=setInterval(()=>{
        if(document.visibilityState==="visible") loadAll(false); // background refresh - чимээгүй
      },60000); // 30 → 60 секунд (нэг минут тутамд хангалттай)
      return()=>clearInterval(interval);
    }
    if(user&&user.role==="student"){
      // Сурагчид ч ачаалах
      loadAll(true);
      const interval=setInterval(()=>{
        if(document.visibilityState==="visible") loadAll(false);
      },60000);
      return()=>clearInterval(interval);
    }
  },[user,loadAll]);

  // ── PULL-TO-REFRESH (Дэлгэцийг доош чирэхэд автомат refresh) ──
  useEffect(()=>{
    if(!user)return; // Зөвхөн нэвтэрсэн үед ажиллана
    const THRESHOLD=70; // px — хэр их доош чирэхэд refresh хийх
    const MAX_PULL=120; // px — хязгаар

    const onTouchStart=(e)=>{
      // Зөвхөн scroll нь дээд талд байгаа үед эхэлнэ
      if(window.scrollY>0){
        pullingRef.current=false;
        return;
      }
      pullStartRef.current=e.touches[0].clientY;
      pullingRef.current=true;
    };
    const onTouchMove=(e)=>{
      if(!pullingRef.current||refreshing)return;
      const currentY=e.touches[0].clientY;
      const delta=currentY-pullStartRef.current;
      if(delta>0&&window.scrollY===0){
        // Доош чирж байна — pull animation харуулна
        const dampened=Math.min(delta*0.5,MAX_PULL); // damping factor
        setPullY(dampened);
        // Page scroll-ийг түр зогсоо
        if(delta>10)e.preventDefault();
      }
    };
    const onTouchEnd=async()=>{
      if(!pullingRef.current)return;
      pullingRef.current=false;
      if(pullY>=THRESHOLD&&!refreshing){
        // Refresh trigger
        setRefreshing(true);
        setPullY(THRESHOLD);
        await loadAll(false); // background refresh — алдааны popup гарахгүй
        // Tactile feedback (хэрэв device дэмждэг бол)
        try{if(navigator.vibrate)navigator.vibrate(50);}catch(e){}
        setTimeout(()=>{
          setRefreshing(false);
          setPullY(0);
        },400);
      }else{
        setPullY(0);
      }
    };

    document.addEventListener("touchstart",onTouchStart,{passive:true});
    document.addEventListener("touchmove",onTouchMove,{passive:false});
    document.addEventListener("touchend",onTouchEnd);
    return()=>{
      document.removeEventListener("touchstart",onTouchStart);
      document.removeEventListener("touchmove",onTouchMove);
      document.removeEventListener("touchend",onTouchEnd);
    };
  },[user,refreshing,pullY,loadAll]);

  const isTeacher=user?.role==="teacher";
  const isSuperAdmin=!!(user?.isSuperAdmin);
  const visibleClasses=isTeacher?(isSuperAdmin?classes:classes.filter(c=>(user.class_ids||[]).includes(c.id))):[];

  if(loading)return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",background:"linear-gradient(135deg,#a78bfa 0%,#7c3aed 100%)",position:"relative",overflow:"hidden"}}>
      {/* Floating background */}
      <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
        {["🌸","⭐","✨","💫","🌟"].map((e,i)=>(
          <div key={i} style={{position:"absolute",left:`${10+i*20}%`,top:`${20+(i%2)*50}%`,fontSize:30+i*3,opacity:.3,animation:`kFloat ${5+i}s ease-in-out ${i*0.3}s infinite`}}>{e}</div>
        ))}
      </div>
      <div className="k-bouncy" style={{fontSize:72,marginBottom:16,filter:"drop-shadow(0 8px 16px rgba(0,0,0,0.2))"}}>🏫</div>
      <div style={{fontSize:24,fontWeight:900,color:"#fff",marginBottom:8,letterSpacing:-.5}}>한국어 학원</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,.9)",fontWeight:600,letterSpacing:1}}>Ачаалж байна...</div>
      {/* Loading dots */}
      <div style={{display:"flex",gap:6,marginTop:14}}>
        {[0,1,2].map(i=>(
          <div key={i} style={{
            width:10,height:10,borderRadius:"50%",background:"#fff",
            animation:`kBounce 1s ease-in-out ${i*0.15}s infinite`,
            boxShadow:"0 2px 6px rgba(0,0,0,0.15)"
          }}/>
        ))}
      </div>
    </div>
  );

  if(loadErr)return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",padding:20,textAlign:"center",background:"linear-gradient(135deg,#ffebee,#fff)"}}>
      <div className="k-bouncy" style={{fontSize:64,marginBottom:14}}>😢</div>
      <div style={{fontSize:18,fontWeight:800,marginBottom:8,color:"#c62828"}}>{loadErr}</div>
      <div style={{fontSize:12,color:"#888",marginBottom:18}}>Дахин оролдоод үзээрэй</div>
      <button onClick={()=>window.location.reload()} className="k-btn k-press"
        style={{padding:"13px 28px",background:"#e53935",color:"#fff",border:"none",borderRadius:12,fontSize:14,cursor:"pointer",fontWeight:800,boxShadow:"0 4px 0 #c62828",letterSpacing:.5}}>
        🔄 Дахин оролдох
      </button>
    </div>
  );

  if(!user)return <AuthScreen onAuth={setUser}/>;

  // ── Pull-to-refresh indicator (заавал нэвтэрсэн үед харагдана) ──
  const PullIndicator=()=>{
    if(pullY===0&&!refreshing)return null;
    const progress=Math.min(pullY/70,1); // 0..1
    return(
      <div style={{
        position:"fixed",top:0,left:0,right:0,
        display:"flex",alignItems:"center",justifyContent:"center",
        height:Math.max(pullY,refreshing?70:0),
        background:`linear-gradient(180deg,rgba(124,58,237,${0.05+progress*0.1}) 0%,transparent 100%)`,
        zIndex:200,pointerEvents:"none",
        transition:refreshing?"height .3s ease":"none",
      }}>
        <div style={{
          background:"#fff",
          borderRadius:"50%",
          width:44,height:44,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 4px 14px rgba(124,58,237,0.25)",
          transform:refreshing?"none":`rotate(${progress*360}deg) scale(${0.6+progress*0.4})`,
          transition:"transform .1s ease",
        }}>
          {refreshing?(
            <div style={{
              width:22,height:22,
              border:"3px solid #e9e3ff",
              borderTopColor:"#7c3aed",
              borderRadius:"50%",
              animation:"kSpinSlow 0.6s linear infinite",
            }}/>
          ):(
            <span style={{fontSize:22,opacity:progress}}>{progress>=1?"🔄":"⬇️"}</span>
          )}
        </div>
      </div>
    );
  };

  if(user.role==="student"){
    const s=students.find(x=>x.id===user.id)||_db.students.find(x=>x.id===user.id);
    if(!s){
      return(
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",background:"linear-gradient(135deg,#f48cb1 0%,#e91e8c 100%)",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
            {["🌸","💖","✨"].map((e,i)=>(
              <div key={i} style={{position:"absolute",left:`${15+i*30}%`,top:`${25+(i%2)*40}%`,fontSize:36,opacity:.4,animation:`kFloat ${5+i}s ease-in-out infinite`}}>{e}</div>
            ))}
          </div>
          <div className="k-bouncy" style={{fontSize:64,marginBottom:14}}>🌸</div>
          <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:6}}>Мэдээлэл ачаалж байна...</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.85)",fontWeight:600}}>Түр хүлээнэ үү</div>
          <div style={{display:"flex",gap:6,marginTop:14}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{width:9,height:9,borderRadius:"50%",background:"#fff",animation:`kBounce 1s ease-in-out ${i*0.15}s infinite`}}/>
            ))}
          </div>
        </div>
      );
    }
    const cls=_db.classes.find(c=>c.id===s.class_id);
    const ve=_db.vocab_entries.filter(v=>v.class_id===s.class_id);
    const classmates=students.filter(x=>x.class_id===s.class_id);
    return(
      <>
        <PullIndicator/>
        <StudentView s={s} setStudents={setStudents} goBack={()=>setUser(null)}
          attMonth={attMonth} setAttMonth={setAttMonth} classDays={cls?.days||[]}
          vocabEntries={ve} classmates={classmates} classColor={cls?.color||"#7c3aed"}
          homeworks={homeworks} homeworkSubs={homeworkSubs}
          exams={exams} examSubs={examSubs} refreshAll={()=>loadAll(false)}/>
      </>
    );
  }

  if(selCls){
    const cls=_db.classes.find(c=>c.id===selCls);
    if(!cls)return null;
    const clsSts=students.filter(s=>s.class_id===selCls);
    return(
      <>
        <PullIndicator/>
        <ClassDetail cls={cls} isAdmin={isTeacher} isSuperAdmin={isSuperAdmin} students={clsSts} setStudents={setStudents} setClasses={setClasses}
          goBack={()=>setSelCls(null)} attMonth={attMonth} setAttMonth={setAttMonth}
          badgeDefs={badgeDefs} setBadgeDefs={setBadgeDefs}
          teacherId={user.id} homeworks={homeworks} homeworkSubs={homeworkSubs}
          exams={exams} examSubs={examSubs} refreshAll={()=>loadAll(false)}/>
      </>
    );
  }

  return(
    <>
      <PullIndicator/>
      <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#f8f9ff 0%,#fff 200px)",fontFamily:"system-ui",padding:16,overflowX:"hidden",boxSizing:"border-box"}}>
      <div style={{maxWidth:840,margin:"0 auto"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:23,fontWeight:800,color:"#1a1a2e"}}>🏫 한국어 학원</div>
            <div style={{fontSize:12,color:"#888",display:"flex",alignItems:"center",gap:6,marginTop:2}}>
              {user.displayName} 👋
              {isSuperAdmin&&<span style={{background:"#f0f0ff",color:"#7c3aed",borderRadius:8,padding:"1px 7px",fontSize:10,fontWeight:700}}>Super Admin</span>}
              {!isSuperAdmin&&<span style={{background:"#f0fff4",color:"#2e7d32",borderRadius:8,padding:"1px 7px",fontSize:10,fontWeight:700}}>Багш</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {isSuperAdmin&&(
              <button onClick={()=>setShowAccounts(true)} className="k-btn k-press" style={{...bs("#f0f0ff","#7c3aed","#c5b8ff",true),position:"relative"}}>
                🔑 Бүртгэл
                {_pending.length>0&&<span style={{background:"#e53935",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,marginLeft:4,fontWeight:800}}>{_pending.length}</span>}
              </button>
            )}
            {isSuperAdmin&&<button onClick={()=>setShowAdd(true)} className="k-btn k-press" style={bs("#7c3aed","#fff",undefined,true)}>+ Анги</button>}
            <button onClick={()=>loadAll(false)} className="k-btn k-press" style={bs("#f0f0f0","#555","#e0e0e0",true)} title="Сэргээх">🔄</button>
            <button onClick={()=>{
              if(window.confirm("Системээс гарах уу? Дахин нэвтрэхэд и-мэйл, нууц үгээ оруулах хэрэгтэй.")){
                setUser(null);
              }
            }} className="k-btn k-press" style={bs("#fff","#e53935","#ffcdd2",true)}>Гарах</button>
          </div>
        </div>

        {/* Өнөөдрийн тойм (Today's overview) */}
        {(()=>{
          const todayDow=new Date().getDay();
          const mapped=todayDow===0?7:todayDow;
          const todayClasses=visibleClasses.filter(c=>(c.days||[]).includes(mapped));
          const allStudents=isSuperAdmin?students:students.filter(s=>visibleClasses.some(c=>c.id===s.class_id));
          const overdue=isSuperAdmin?allStudents.filter(s=>s.next_due&&s.next_due<TODAY&&(s.total_paid||0)<(s.total_fee||0)):[];
          const totalDue=overdue.reduce((sum,s)=>sum+((s.total_fee||0)-(s.total_paid||0)),0);
          // Активний шалгалтуудыг харагдуулна (бусад багшийн ч)
          const visibleClassIds=visibleClasses.map(c=>c.id);
          const activeExams=(exams||[]).filter(e=>e.status==="active"&&visibleClassIds.includes(e.class_id));
          // Хүлээгдэж буй даалгавруудын тоо
          const allClassHws=(homeworks||[]).filter(h=>visibleClassIds.includes(h.class_id));
          const pendingHws=allClassHws.filter(h=>new Date(h.due_date)>new Date()).length;
          return(
            <div className="k-fade" style={{background:"#fff",borderRadius:18,padding:16,marginBottom:16,border:"1px solid #f0f0f0",boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1a1a2e",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                📊 Өнөөдрийн тойм <span style={{fontSize:11,color:"#888",fontWeight:500}}>· {fmtDate(TODAY)}</span>
              </div>

              {/* Идэвхтэй шалгалт alert */}
              {activeExams.length>0&&(
                <div className="k-pop" style={{background:`linear-gradient(135deg,#ff5722,#e64a19)`,color:"#fff",borderRadius:14,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10,cursor:"pointer",boxShadow:"0 4px 14px rgba(229,57,53,0.3)",animation:"kPulse 2.5s ease-in-out infinite"}}
                  onClick={()=>{
                    const ex=activeExams[0];
                    setSelCls(ex.class_id);
                  }}>
                  <div className="k-bouncy" style={{fontSize:24}}>🏆</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:13}}>{activeExams.length} ИДЭВХТЭЙ ШАЛГАЛТ</div>
                    <div style={{fontSize:11,opacity:.95}}>{activeExams.map(e=>e.title).slice(0,2).join(", ")}</div>
                  </div>
                  <div style={{fontSize:13,fontWeight:800}}>→</div>
                </div>
              )}

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
                {/* Өнөөдрийн анги */}
                <div style={{background:"#f5f0ff",borderRadius:12,padding:"10px 12px",borderLeft:"3px solid #7c3aed"}}>
                  <div style={{fontSize:10,color:"#7c3aed",fontWeight:700,marginBottom:2}}>📚 ӨНӨӨДӨР</div>
                  <div style={{fontSize:18,fontWeight:800,color:"#1a1a2e"}}>{todayClasses.length} анги</div>
                  <div style={{fontSize:10,color:"#666",marginTop:1}}>
                    {todayClasses.length>0?todayClasses.map(c=>c.name).join(", "):"Хичээл байхгүй"}
                  </div>
                </div>
                {/* Нийт сурагч */}
                <div style={{background:"#e8f5e9",borderRadius:12,padding:"10px 12px",borderLeft:"3px solid #2e7d32"}}>
                  <div style={{fontSize:10,color:"#2e7d32",fontWeight:700,marginBottom:2}}>👥 СУРАГЧ</div>
                  <div style={{fontSize:18,fontWeight:800,color:"#1a1a2e"}}>{allStudents.length}</div>
                  <div style={{fontSize:10,color:"#666",marginTop:1}}>{visibleClasses.length} ангид</div>
                </div>
                {/* Даалгавар */}
                {allClassHws.length>0&&(
                  <div style={{background:"#fff3cd",borderRadius:12,padding:"10px 12px",borderLeft:"3px solid #b8860b"}}>
                    <div style={{fontSize:10,color:"#b8860b",fontWeight:700,marginBottom:2}}>📝 ДААЛГАВАР</div>
                    <div style={{fontSize:18,fontWeight:800,color:"#1a1a2e"}}>{allClassHws.length}</div>
                    <div style={{fontSize:10,color:"#b8860b",marginTop:1}}>{pendingHws} идэвхтэй</div>
                  </div>
                )}
                {/* Төлбөр (зөвхөн superadmin) */}
                {isSuperAdmin&&(
                  <div style={{background:overdue.length>0?"#fce4ec":"#e8f5e9",borderRadius:12,padding:"10px 12px",borderLeft:`3px solid ${overdue.length>0?"#c62828":"#2e7d32"}`}}>
                    <div style={{fontSize:10,color:overdue.length>0?"#c62828":"#2e7d32",fontWeight:700,marginBottom:2}}>💰 ХОЦОРСОН</div>
                    <div style={{fontSize:18,fontWeight:800,color:"#1a1a2e"}}>{overdue.length} хүн</div>
                    <div style={{fontSize:10,color:overdue.length>0?"#c62828":"#666",marginTop:1}}>
                      {overdue.length>0?fmt(totalDue):"Бүх төлбөр цаг хугацаандаа"}
                    </div>
                  </div>
                )}
                {/* Pending (зөвхөн superadmin) */}
                {isSuperAdmin&&_pending.length>0&&(
                  <div style={{background:"#fff3cd",borderRadius:12,padding:"10px 12px",borderLeft:"3px solid #f9a825",cursor:"pointer"}}
                    onClick={()=>setShowAccounts(true)} className="k-press">
                    <div style={{fontSize:10,color:"#b8860b",fontWeight:700,marginBottom:2}}>⏳ ХҮЛЭЭГДЭЖ</div>
                    <div style={{fontSize:18,fontWeight:800,color:"#1a1a2e"}}>{_pending.length}</div>
                    <div style={{fontSize:10,color:"#b8860b",marginTop:1}}>Бүртгэл зөвшөөрөх</div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Анги жагсаалт */}
        <div style={{fontWeight:700,fontSize:14,color:"#555",marginBottom:8,marginLeft:4}}>📚 Миний ангиуд</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
          {visibleClasses.map((cls,idx)=>{
            const cs=students.filter(s=>s.class_id===cls.id);
            const todayDow=new Date().getDay();
            const mapped=todayDow===0?7:todayDow;
            const isToday=(cls.days||[]).includes(mapped);
            return(
              <div key={cls.id} onClick={()=>setSelCls(cls.id)} className="k-card-hover"
                style={{background:"#fff",borderRadius:18,padding:16,boxShadow:"0 3px 14px #0001",borderTop:`4px solid ${cls.color}`,position:"relative",animation:`kSlideUp .35s ease ${idx*0.05}s both`}}>
                {isToday&&(
                  <div style={{position:"absolute",top:10,right:10,background:cls.color,color:"#fff",fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:10}}>📍 ӨНӨӨДӨР</div>
                )}
                <div style={{fontWeight:800,fontSize:16,color:"#1a1a2e",marginBottom:3,paddingRight:isToday?70:0}}>{cls.name}</div>
                <div style={{fontSize:11,color:"#888",marginBottom:10,display:"flex",alignItems:"center",gap:4}}>
                  🕐 {cls.time}
                  <span style={{opacity:.5}}>·</span>
                  {(cls.days||[]).map(d=>(
                    <span key={d} style={{background:isToday&&d===mapped?cls.color:"#f0f0f0",color:isToday&&d===mapped?"#fff":"#666",borderRadius:5,padding:"1px 5px",fontSize:10,fontWeight:600}}>{DLABELS[d]}</span>
                  ))}
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {cs.slice(0,8).map(s=>{
                    const t2=getT(s.theme_id);
                    return(
                      <div key={s.id} title={s.name} style={{width:30,height:30,borderRadius:"50%",overflow:"hidden",border:`2px solid ${cls.color}`,background:t2.soft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                        {s.photo_url?<img src={s.photo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:t2.emoji}
                      </div>
                    );
                  })}
                  {cs.length>8&&(
                    <div style={{width:30,height:30,borderRadius:"50%",background:"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#666"}}>+{cs.length-8}</div>
                  )}
                  <span style={{fontSize:11,color:"#888",marginLeft:"auto",fontWeight:600}}>👥 {cs.length}</span>
                </div>
              </div>
            );
          })}
          {visibleClasses.length===0&&(
            <div style={{gridColumn:"1/-1",textAlign:"center",padding:"40px 20px",color:"#aaa",fontSize:14,background:"#fff",borderRadius:14}}>
              <div style={{fontSize:40,marginBottom:8,opacity:.4}}>📚</div>
              Танд оноогдсон анги байхгүй байна.
            </div>
          )}
        </div>

        {showAccounts&&isSuperAdmin&&(
          <AdminPanel students={students} setStudents={setStudents} currentTeacherId={user.id} onClose={()=>setShowAccounts(false)}/>
        )}

        {showAdd&&isSuperAdmin&&(
          <Overlay onClose={()=>setShowAdd(false)} maxW={340}>
            <div style={{fontWeight:700,fontSize:17,marginBottom:16}}>Шинэ анги</div>
            {[["Ангийн нэр","name","text"],["Цаг","time","time"]].map(item=>(
              <div key={item[0]} style={{marginBottom:10}}>
                <div style={{fontSize:11,color:"#888",marginBottom:2}}>{item[0]}</div>
                <input type={item[2]} value={nc[item[1]]||""} onChange={e=>setNc(p=>({...p,[item[1]]:e.target.value}))} style={INP}/>
              </div>
            ))}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:"#888",marginBottom:5}}>Хичээлийн өдрүүд</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {[1,2,3,4,5,6,7].map(d=>(
                  <button key={d} onClick={()=>setNc(p=>({...p,days:p.days.includes(d)?p.days.filter(x=>x!==d):[...p.days,d].sort()}))}
                    style={bs(nc.days.includes(d)?"#7c3aed":"#f0f0f0",nc.days.includes(d)?"#fff":"#333",undefined,true)}>{DLABELS[d]}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"#888",marginBottom:4}}>Өнгө</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["#e91e8c","#2196f3","#00897b","#7c3aed","#f57c00","#c2185b","#0097a7","#558b2f"].map(c=>(
                  <div key={c} onClick={()=>setNc(p=>({...p,color:c}))} style={{width:26,height:26,borderRadius:"50%",background:c,cursor:"pointer",border:nc.color===c?"3px solid #333":"none"}}/>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:7}}>
              <button onClick={()=>setShowAdd(false)} style={bs("#fff","#333","#e0e0e0")}>Болих</button>
              <button onClick={async()=>{
                if(!nc.name)return;
                const newCls={id:`c${Date.now()}`,name:nc.name,time:nc.time,days:nc.days,color:nc.color};
                const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
                await fetch(`${SUPA_URL}/rest/v1/classes`,{method:"POST",headers:h,body:JSON.stringify(newCls)});
                _db.classes.push(newCls);
                setClasses(p=>[...p,newCls]);
                setNc({name:"",time:"",days:[],color:"#e91e8c"});
                setShowAdd(false);
              }} style={{...bs("#7c3aed","#fff"),flex:1,justifyContent:"center"}}>Үүсгэх</button>
            </div>
          </Overlay>
        )}
      </div>
    </div>
    </>
  );
}
