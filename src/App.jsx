import { useState, useRef, useCallback, useMemo, useEffect } from "react";

// ── SUPABASE ──────────────────────────────────────────
const SUPA_URL = "https://ftmvhmsvrtownqrnvbzo.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0bXZobXN2cnRvd25xcm52YnpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE5ODIsImV4cCI6MjA5NDU5Nzk4Mn0.TV0YMNDNRcjv8oVfekwjJYeMgHlix4c4J3l0CR2_HUI";

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

function StreakTree({streak,miss,plantType="cherry",onSelectPlant,isStudent=false}){
  const STREAK_COMPLETE = 6;
  // stage 0=seed, 1=sprout, 2=growing, 3=flowering, 4=complete
  // Only reach stage 4 when streak >= 6
  const stage = miss>=3 ? 0 : streak===0 ? 0 : Math.min(4, Math.ceil(streak / (STREAK_COMPLETE/4)));
  const sz=[0.7,0.82,0.94,1.06,1.2][stage];
  const h = miss===0?"healthy":miss===1?"wilting":"dry";
  const missLabels=["","⚠️ Анхаарал!","🍂 Хатаж байна"];
  const [showSelect,setShowSelect]=useState(false);

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
      {isStudent&&(
        <div style={{marginBottom:6}}>
          <button onClick={()=>setShowSelect(s=>!s)} style={{fontSize:10,background:"#f0f0f0",border:"none",borderRadius:8,padding:"3px 10px",cursor:"pointer",color:"#555"}}>
            {plant.name} ▾
          </button>
          {showSelect&&(
            <div style={{position:"absolute",zIndex:50,background:"#fff",borderRadius:12,boxShadow:"0 4px 20px #0002",padding:10,marginTop:4,left:"50%",transform:"translateX(-50%)",width:220}}>
              <div style={{fontSize:10,fontWeight:600,color:"#888",marginBottom:6}}>Мод сонгох</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                {PLANT_TYPES.filter(p=>p.type==="tree").map(p=>(
                  <button key={p.id} onClick={()=>{onSelectPlant&&onSelectPlant(p.id);setShowSelect(false);}} style={{fontSize:11,padding:"4px 8px",borderRadius:7,border:`1px solid ${plantType===p.id?"#7c3aed":"#e0e0e0"}`,background:plantType===p.id?"#f0f0ff":"#fff",cursor:"pointer"}}>{p.name}</button>
                ))}
              </div>
              <div style={{fontSize:10,fontWeight:600,color:"#888",marginBottom:6}}>Ургамал сонгох</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {PLANT_TYPES.filter(p=>p.type==="flower").map(p=>(
                  <button key={p.id} onClick={()=>{onSelectPlant&&onSelectPlant(p.id);setShowSelect(false);}} style={{fontSize:11,padding:"4px 8px",borderRadius:7,border:`1px solid ${plantType===p.id?"#e91e8c":"#e0e0e0"}`,background:plantType===p.id?"#fff0f5":"#fff",cursor:"pointer"}}>{p.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
              <div key={v.id} style={{background:t.soft,borderRadius:9,padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,fontSize:12,color:t.text}}>{v.word}</span>
                <span style={{fontSize:11,color:t.text,opacity:.6}}>{v.meaning}</span>
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
              <div key={v.id} style={{background:"#f5f0ff",borderRadius:9,padding:"8px 12px",border:"1px solid #c5b8ff"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#7c3aed",marginBottom:2}}>{v.word}</div>
                <div style={{fontSize:11,color:"#555"}}>{v.meaning}</div>
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
      // Эхлээд local-д хайна
      let st=_db.students.find(s=>s.email&&s.email.toLowerCase()===email.trim().toLowerCase()&&s.password===pass);
      // Local-д байхгүй бол Supabase-аас шууд хайна
      if(!st){
        const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
        const em=encodeURIComponent(email.trim().toLowerCase());
        const r=await fetch(`${SUPA_URL}/rest/v1/students?email=eq.${em}&select=*`,{headers:h});
        const rows=await r.json();
        if(rows&&rows.length>0&&rows[0].password===pass){
          st={...rows[0],
            badges:Array.isArray(rows[0].badges)?rows[0].badges:[],
            weak_words:Array.isArray(rows[0].weak_words)?rows[0].weak_words:(rows[0].weak_words?JSON.parse(rows[0].weak_words):[]),
            attendance:rows[0].attendance&&typeof rows[0].attendance==="object"?rows[0].attendance:{},
          };
          // _db-д нэмнэ
          if(!_db.students.find(x=>x.id===st.id))_db.students.push(st);
        }
      }
      if(st){setLoading2(false);onAuth({id:st.id,role:"student",displayName:st.name});return;}
      // Pending шалгана
      const h2={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
      const em2=encodeURIComponent(email.trim().toLowerCase());
      const r2=await fetch(`${SUPA_URL}/rest/v1/pending_students?email=eq.${em2}&select=*`,{headers:h2});
      const prows=await r2.json();
      if(prows&&prows.length>0){setLoading2(false);setErr("Таны бүртгэл багшийн зөвшөөрлийг хүлээж байна. ⏳");return;}
      setLoading2(false);
      setErr("И-мэйл эсвэл нууц үг буруу байна.");
    }catch(e){
      setLoading2(false);
      setErr("Холболтын алдаа гарлаа. Дахин оролдоно уу.");
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

  const tabStyle=(m)=>({
    flex:1,padding:"8px 2px",borderRadius:9,border:"none",cursor:"pointer",fontSize:11,
    background:mode===m?"#fff":"transparent",
    color:mode===m?(m==="teacher"?"#7c3aed":m==="register"?"#e91e8c":"#2196f3"):"#888",
    fontWeight:mode===m?700:400,
  });

  if(regDone) return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#667eea,#764ba2)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",padding:16}}>
      <div style={{background:"#fff",borderRadius:24,padding:32,width:"100%",maxWidth:340,textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
        <div style={{fontSize:48,marginBottom:12}}>⏳</div>
        <div style={{fontSize:18,fontWeight:800,color:"#1a1a2e",marginBottom:8}}>Бүртгэл илгээгдлээ!</div>
        <div style={{fontSize:13,color:"#555",marginBottom:20,lineHeight:1.6}}>Багш таны бүртгэлийг зөвшөөрсний дараа нэвтрэх боломжтой болно.<br/><b style={{color:"#7c3aed"}}>{email}</b></div>
        <button onClick={()=>{setRegDone(false);setMode("student");clearForm();}} style={{...bs("#7c3aed","#fff"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:700}}>← Нэвтрэх хуудас руу</button>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#667eea,#764ba2)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",padding:16}}>
      <div style={{background:"#fff",borderRadius:24,padding:28,width:"100%",maxWidth:340,boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:38,marginBottom:4}}>🏫</div>
          <div style={{fontSize:19,fontWeight:800,color:"#1a1a2e"}}>한국어 학원</div>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:18,background:"#f0f0f0",borderRadius:12,padding:4}}>
          {[["teacher","👩‍🏫 Багш"],["student","🎓 Нэвтрэх"],["register","✏️ Бүртгүүлэх"]].map(item=>(
            <button key={item[0]} onClick={()=>{setMode(item[0]);clearForm();}} style={tabStyle(item[0])}>{item[1]}</button>
          ))}
        </div>

        {mode==="forgot"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <button onClick={()=>{setMode("student");clearForm();}} style={bs("#f0f0f0","#555",undefined,true)}>← Буцах</button>
              <span style={{fontWeight:700,fontSize:14}}>🔑 Нууц үг мартсан</span>
            </div>
            {fResult?(
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:8}}>✅</div>
                <div style={{fontSize:13,color:"#555",marginBottom:6}}>Сайн байна уу, <b>{fResult.name}</b>!</div>
                <div style={{fontSize:12,color:"#888",marginBottom:8}}>Таны нууц үг:</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:"monospace",background:"#f0f0ff",borderRadius:10,padding:"10px 16px",color:"#7c3aed",letterSpacing:2,marginBottom:16}}>{fResult.password}</div>
                <button onClick={()=>{setMode("student");clearForm();}} style={{...bs("#7c3aed","#fff"),width:"100%",justifyContent:"center",padding:"11px",fontWeight:700}}>Нэвтрэх →</button>
              </div>
            ):(
              <div>
                <div style={{fontSize:12,color:"#888",marginBottom:12}}>И-мэйл болон Регистрийн дугаараа оруулна уу.</div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:12,color:"#888",marginBottom:3}}>И-мэйл</div>
                  <input type="email" value={fEmail} onChange={e=>setFEmail(e.target.value)} placeholder="taны@email.com" style={INP}/>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,color:"#888",marginBottom:3}}>Регистрийн дугаар (РД)</div>
                  <input value={fRd} onChange={e=>setFRd(e.target.value.toUpperCase())} placeholder="УБ123456" style={{...INP,textTransform:"uppercase",letterSpacing:2,fontWeight:700}}/>
                </div>
                <button onClick={forgotCheck} style={{...bs("#e91e8c","#fff"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:700}}>Нууц үг харах</button>
              </div>
            )}
          </div>
        )}

        {mode==="teacher"&&(
          <div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:12,color:"#888",marginBottom:3}}>И-мэйл</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginTeacher()} style={INP}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:"#888",marginBottom:3}}>Нууц үг</div>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginTeacher()} style={{...INP,paddingRight:38}}/>
                <span onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:14,opacity:.5}}>{showPass?"🙈":"👁"}</span>
              </div>
            </div>
            <button onClick={loginTeacher} disabled={loading2} style={{...bs("#7c3aed","#fff"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:700,opacity:loading2?.7:1}}>{loading2?"⏳ Нэвтрэж байна...":"Нэвтрэх"}</button>
          </div>
        )}

        {mode==="student"&&(
          <div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:12,color:"#888",marginBottom:3}}>И-мэйл</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginStudent()} style={INP}/>
            </div>
            <div style={{marginBottom:6}}>
              <div style={{fontSize:12,color:"#888",marginBottom:3}}>Нууц үг</div>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginStudent()} style={{...INP,paddingRight:38}}/>
                <span onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:14,opacity:.5}}>{showPass?"🙈":"👁"}</span>
              </div>
            </div>
            <div style={{textAlign:"right",marginBottom:14}}>
              <span onClick={()=>{setMode("forgot");clearForm();}} style={{fontSize:11,color:"#7c3aed",cursor:"pointer",fontWeight:600}}>Нууц үгээ мартсан уу?</span>
            </div>
            <button onClick={loginStudent} disabled={loading2} style={{...bs("#e91e8c","#fff"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:700,opacity:loading2?.7:1}}>{loading2?"⏳ Нэвтрэж байна...":"Нэвтрэх"}</button>
            <div style={{marginTop:10,textAlign:"center",fontSize:11,color:"#aaa"}}>
              Бүртгэл байхгүй юу? <span onClick={()=>{setMode("register");clearForm();}} style={{color:"#7c3aed",cursor:"pointer",fontWeight:600}}>Бүртгүүлэх</span>
            </div>
          </div>
        )}

        {mode==="register"&&(
          <div>
            {[["Нэр *","text",name,setName,"Бүтэн нэр"],["И-мэйл *","email",email,setEmail,"taны@email.com"],["РД *","text",rd,v=>setRd(v.toUpperCase()),"УБ123456"],["Утас","tel",phone,setPhone,"+976 9999-9999"]].map(item=>(
              <div key={item[0]} style={{marginBottom:9}}>
                <div style={{fontSize:12,color:"#888",marginBottom:3}}>{item[0]}</div>
                <input type={item[1]} value={item[2]} onChange={e=>item[3](e.target.value)} placeholder={item[4]}
                  style={{...INP,...(item[0]==="РД *"?{textTransform:"uppercase",letterSpacing:2,fontWeight:700}:{})}}/>
              </div>
            ))}
            <div style={{marginBottom:9}}>
              <div style={{fontSize:12,color:"#888",marginBottom:3}}>Нууц үг *</div>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} style={{...INP,paddingRight:38}}/>
                <span onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:14,opacity:.5}}>{showPass?"🙈":"👁"}</span>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:"#888",marginBottom:3}}>Нууц үг давтах *</div>
              <input type="password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} style={INP}/>
            </div>
            <button onClick={register} style={{...bs("#e91e8c","#fff"),width:"100%",justifyContent:"center",padding:"12px",fontWeight:700}}>Бүртгүүлэх</button>
            <div style={{marginTop:10,textAlign:"center",fontSize:11,color:"#aaa"}}>
              Бүртгэл байгаа юу? <span onClick={()=>{setMode("student");clearForm();}} style={{color:"#7c3aed",cursor:"pointer",fontWeight:600}}>Нэвтрэх</span>
            </div>
          </div>
        )}

        {err&&<div style={{marginTop:10,padding:"8px 12px",background:"#fce4ec",borderRadius:8,fontSize:12,color:"#c62828"}}>{err}</div>}
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
                        <StreakTree streak={6} miss={0} plantType={pt} isStudent={false}/>
                      </div>
                      <div style={{fontSize:8,color:t.text,opacity:.7,marginTop:2}}>{pObj?.name||pt}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current plant */}
          <StreakTree streak={streak} miss={miss} plantType={currentPlant} isStudent={false}/>
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
function CardContent({s,t,isAdmin,isSuperAdmin,upd,attMonth,setAttMonth,classDays,vocabEntries,sessions,present,learnedVocab,totalVocab,onToggleAtt,hideUI,setShowPay,setEditNotes,editNotes,notes,setNotes,weakSearch,setWeakSearch,showWeakDD,setShowWeakDD}){
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
function StudentView({s,setStudents,goBack,attMonth,setAttMonth,classDays,vocabEntries,classmates,classColor}){
  const [tab,setTab]=useState("card");
  const [attM,setAttM]=useState(attMonth);
  const [showChangePw,setShowChangePw]=useState(false);
  const [showThemes,setShowThemes]=useState(false);
  const [showEditStart,setShowEditStart]=useState(false);
  const [startDate,setStartDate]=useState(s.enroll_date||"");
  const [weakSearch,setWeakSearch]=useState("");
  const [showWeakDD,setShowWeakDD]=useState(false);
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
        <button onClick={goBack} style={bs(t.card,t.text,t.border,true)}>← Гарах</button>
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
      <div style={{display:"flex",gap:6,marginBottom:14,background:t.soft,borderRadius:12,padding:4}}>
        {[["card","📋 Карт"],["vocab","📚 Үгс"],["weak","⚠️ Эргэлзэж"],["leaderboard","🏆 Жагсаалт"]].map(item=>(
          <button key={item[0]} onClick={()=>setTab(item[0])} style={{flex:1,padding:"8px 2px",borderRadius:9,border:"none",background:tab===item[0]?t.card:"transparent",color:tab===item[0]?t.accent:t.text,fontWeight:tab===item[0]?700:400,fontSize:10,cursor:"pointer"}}>{item[1]}</button>
        ))}
      </div>
      {tab==="leaderboard"&&<div style={{background:t.card,borderRadius:18,padding:16,border:`2px solid ${t.border}`}}><div style={{fontWeight:700,fontSize:15,color:t.text,marginBottom:14,textAlign:"center"}}>🏆 Ангийн жагсаалт</div><Leaderboard students={classmates} myId={s.id} classColor={classColor||t.accent}/></div>}
      {tab==="vocab"&&<VocabTab vocabEntries={vocabEntries} t={t}/>}
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
            weakSearch={weakSearch} setWeakSearch={setWeakSearch} showWeakDD={showWeakDD} setShowWeakDD={setShowWeakDD}/>
        </div>
      )}
    </div>
  );
}

// ── ADMIN STUDENT DETAIL ──────────────────────────────
function AdminStudentDetail({s,setStudents,goBack,attMonth,setAttMonth,classDays,vocabEntries,badgeDefs,setBadgeDefs,isSuperAdmin}){
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
function ClassDetail({cls,isAdmin,isSuperAdmin,students,setStudents,goBack,attMonth,setAttMonth,badgeDefs,setBadgeDefs}){
  const [selSid,setSelSid]=useState(null);
  const [showAddSt,setShowAddSt]=useState(false);
  const [confirmDel,setConfirmDel]=useState(null);
  const [editName,setEditName]=useState(false);
  const [nameVal,setNameVal]=useState(cls.name);
  const [showVocab,setShowVocab]=useState(false);
  const [classDays,setClassDays]=useState(cls.days||[]);
  const [vocabMonth,setVocabMonth]=useState(attMonth);
  const [vocabType,setVocabType]=useState("vocab");
  const [vocabWord,setVocabWord]=useState("");
  const [vocabMean,setVocabMean]=useState("");
  const [ns,setNs]=useState({name:"",enroll_date:"",level:0,theme_id:"sakura",phone:"",email:"",password:"",rd:""});
  const [tick,setTick]=useState(0);
  const [showPayReport,setShowPayReport]=useState(false);
  const [confirmDelCls,setConfirmDelCls]=useState(false);

  const vocabEntries=_db.vocab_entries.filter(v=>v.class_id===cls.id);

  if(selSid){
    const st=students.find(s=>s.id===selSid);
    if(st)return(
      <AdminStudentDetail s={st} setStudents={setStudents} goBack={()=>setSelSid(null)}
        attMonth={attMonth} setAttMonth={setAttMonth} classDays={classDays}
        vocabEntries={vocabEntries} badgeDefs={badgeDefs} setBadgeDefs={setBadgeDefs} isSuperAdmin={isSuperAdmin}/>
    );
  }

  const addVocabEntry=async()=>{
    if(!vocabWord.trim())return;
    const newVocab={id:`ve${Date.now()}`,class_id:cls.id,month:vocabMonth,word:vocabWord.trim(),meaning:vocabMean.trim(),type:vocabType};
    _db.vocab_entries.push(newVocab);
    const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"};
    await fetch(`${SUPA_URL}/rest/v1/vocab_entries`,{method:"POST",headers:h,body:JSON.stringify(newVocab)});
    if(vocabType==="grammar"){
      _db.students.filter(s=>s.class_id===cls.id).forEach(s=>{
        _db.students=_db.students.map(x=>x.id===s.id?{...x,grammar_total:(x.grammar_total||0)+1,grammar_learned:(x.grammar_learned||0)+1}:x);
      });
      setStudents(prev=>prev.map(s=>s.class_id!==cls.id?s:{...s,grammar_total:(s.grammar_total||0)+1,grammar_learned:(s.grammar_learned||0)+1}));
    }
    setVocabWord("");setVocabMean("");setTick(t=>t+1);
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
                  _db.classes=_db.classes.map(c=>c.id===cls.id?{...c,name:nameVal}:c);
                  await fetch(`${SUPA_URL}/rest/v1/classes?id=eq.${cls.id}`,{method:"PATCH",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({name:nameVal})});
                  setEditName(false);
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
              <button onClick={()=>setShowVocab(v=>!v)} style={bs("#fff3cd","#b8860b","#f9a825",true)}>{showVocab?"✕":"📚"}</button>
              <button onClick={printVocabPDF} style={bs("#e8f5e9","#2e7d32","#a5d6a7",true)}>🖨️</button>
              {isSuperAdmin&&<button onClick={()=>setShowPayReport(true)} style={bs("#e8f5e9","#2e7d32","#a5d6a7",true)}>💰</button>}
              <button onClick={()=>setShowAddSt(true)} style={bs(cls.color,"#fff",undefined,true)}>+ Нэмэх</button>
              {isSuperAdmin&&<button onClick={()=>setConfirmDelCls(true)} style={bs("#fff0f0","#e53935","#ffcdd2",true)}>🗑️</button>}
            </div>
          )}
        </div>

        {/* Days editor */}
        {isAdmin&&(
          <div style={{background:"#fff",borderRadius:12,padding:10,marginBottom:12,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:600,color:"#555"}}>Өдрүүд:</span>
            {[1,2,3,4,5,6,7].map(d=>{
              const active=classDays.includes(d);
              return(
                <button key={d} onClick={async()=>{const nd=active?classDays.filter(x=>x!==d):[...classDays,d].sort();setClassDays(nd);_db.classes=_db.classes.map(c=>c.id===cls.id?{...c,days:nd}:c);await fetch(`${SUPA_URL}/rest/v1/classes?id=eq.${cls.id}`,{method:"PATCH",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({days:nd})});}}
                  style={bs(active?cls.color:"#f0f0f0",active?"#fff":"#333",undefined,true)}>{DLABELS[d]}</button>
              );
            })}
          </div>
        )}

        {/* Vocab panel */}
        {showVocab&&(
          <div style={{background:"#fff",borderRadius:14,padding:14,marginBottom:14,border:"1px solid #f0e0ff"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:10,color:"#7c3aed"}}>📚 Үг / Дүрэм нэмэх</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              <input type="month" value={vocabMonth} onChange={e=>setVocabMonth(e.target.value)} style={{...INP,width:"auto",fontSize:12,padding:"5px 9px"}}/>
              <button onClick={()=>setVocabType("vocab")} style={bs(vocabType==="vocab"?"#7c3aed":"#f0f0f0",vocabType==="vocab"?"#fff":"#333",undefined,true)}>📚 Үг</button>
              <button onClick={()=>setVocabType("grammar")} style={bs(vocabType==="grammar"?"#2e7d32":"#f0f0f0",vocabType==="grammar"?"#fff":"#333",undefined,true)}>📖 Дүрэм</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              <input value={vocabWord} onChange={e=>setVocabWord(e.target.value)} placeholder="한국어" style={{...INP,flex:2,fontSize:12,padding:"6px 9px"}} onKeyDown={e=>e.key==="Enter"&&addVocabEntry()}/>
              <input value={vocabMean} onChange={e=>setVocabMean(e.target.value)} placeholder="Монгол утга" style={{...INP,flex:2,fontSize:12,padding:"6px 9px"}} onKeyDown={e=>e.key==="Enter"&&addVocabEntry()}/>
              <button onClick={addVocabEntry} style={bs("#7c3aed","#fff",undefined,true)}>+</button>
            </div>
            {[...new Set(vocabEntries.map(v=>v.month))].sort().reverse().map(mo=>(
              <div key={mo} style={{marginBottom:8,paddingBottom:6,borderBottom:"1px solid #f0f0f0"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#7c3aed",marginBottom:4}}>📅 {mo}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {vocabEntries.filter(v=>v.month===mo).map(v=>(
                    <div key={v.id} style={{display:"flex",alignItems:"center",gap:4,background:v.type==="vocab"?"#f3e8ff":"#e8f5e9",border:`1px solid ${v.type==="vocab"?"#a78bfa":"#66bb6a"}`,borderRadius:8,padding:"3px 8px",fontSize:11}}>
                      <span style={{fontWeight:600}}>{v.word}</span>
                      {v.meaning&&<span style={{opacity:.6,fontSize:10}}>{v.meaning}</span>}
                      <span onClick={async()=>{
                        _db.vocab_entries=_db.vocab_entries.filter(x=>x.id!==v.id);
                        await fetch(`${SUPA_URL}/rest/v1/vocab_entries?id=eq.${v.id}`,{method:"DELETE",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`}});
                        setTick(t=>t+1);
                      }} style={{cursor:"pointer",opacity:.4,fontSize:9}}>✕</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
                  const h={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
                  await fetch(`${SUPA_URL}/rest/v1/classes?id=eq.${cls.id}`,{method:"DELETE",headers:h});
                  _db.classes=_db.classes.filter(c=>c.id!==cls.id);
                  setConfirmDelCls(false);
                  goBack();
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
export default function App(){
  const [user,setUser]=useState(null);
  const [classes,setClasses]=useState([]);
  const [students,setStudents]=useState([]);
  const [badgeDefs,setBadgeDefs]=useState([]);
  const [selCls,setSelCls]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [showAccounts,setShowAccounts]=useState(false);
  const [attMonth,setAttMonth]=useState(new Date().toISOString().slice(0,7));
  const [nc,setNc]=useState({name:"",time:"",days:[],color:"#e91e8c"});
  const [loading,setLoading]=useState(true);
  const [loadErr,setLoadErr]=useState(null);

  const loadAll=useCallback(async()=>{
    try{
      const headers={"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`};
      const [r1,r2,r3,r4,r5,r6,r7]=await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/classes?select=*`,{headers}),
        fetch(`${SUPA_URL}/rest/v1/students?select=*`,{headers}),
        fetch(`${SUPA_URL}/rest/v1/badge_defs?select=*`,{headers}),
        fetch(`${SUPA_URL}/rest/v1/vocab_entries?select=*`,{headers}),
        fetch(`${SUPA_URL}/rest/v1/payments?select=*`,{headers}),
        fetch(`${SUPA_URL}/rest/v1/pending_students?select=*`,{headers}),
        fetch(`${SUPA_URL}/rest/v1/teachers?select=*`,{headers}),
      ]);
      const [cls,sts,bds,voc,pays,pends,tchs]=await Promise.all([r1.json(),r2.json(),r3.json(),r4.json(),r5.json(),r6.json(),r7.json()]);
      _db.classes=cls||[];
      _db.students=(sts||[]).map(s=>({
        ...s,
        badges:Array.isArray(s.badges)?s.badges:[],
        weak_words:Array.isArray(s.weak_words)?s.weak_words:(s.weak_words?JSON.parse(s.weak_words):[]),
        attendance:s.attendance&&typeof s.attendance==="object"?s.attendance:{},
      }));
      _db.vocab_entries=voc||[];
      _db.payments=pays||[];
      _db.badge_defs=bds||[];
      _pending.length=0;
      (pends||[]).forEach(p=>_pending.push(p));
      if(tchs&&tchs.length>0){_teachers.length=0;tchs.forEach(t=>_teachers.push(t));}
      setClasses([..._db.classes]);
      setStudents([..._db.students]);
      setBadgeDefs([..._db.badge_defs]);
      setLoadErr(null);
      setLoading(false);
    }catch(e){
      if(loading)setLoadErr("Интернет холболт шалгана уу.");
      setLoading(false);
    }
  },[]);

  useEffect(()=>{
    loadAll();
    // Auto-refresh every 30 seconds
    const interval=setInterval(()=>{
      if(document.visibilityState==="visible") loadAll();
    },30000);
    return()=>clearInterval(interval);
  },[loadAll]);

  const isTeacher=user?.role==="teacher";
  const isSuperAdmin=!!(user?.isSuperAdmin);
  const visibleClasses=isTeacher?(isSuperAdmin?classes:classes.filter(c=>(user.class_ids||[]).includes(c.id))):[];

  if(loading)return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",background:"linear-gradient(135deg,#667eea,#764ba2)"}}>
      <div style={{fontSize:48,marginBottom:16}}>🏫</div>
      <div style={{fontSize:18,fontWeight:700,color:"#fff",marginBottom:8}}>한국어 학원</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,.8)"}}>Ачаалж байна...</div>
    </div>
  );

  if(loadErr)return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",padding:20,textAlign:"center"}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>{loadErr}</div>
      <button onClick={()=>window.location.reload()} style={{padding:"10px 24px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:10,fontSize:14,cursor:"pointer",marginTop:8}}>Дахин оролдох</button>
    </div>
  );

  if(!user)return <AuthScreen onAuth={setUser}/>;

  if(user.role==="student"){
    const s=students.find(x=>x.id===user.id)||_db.students.find(x=>x.id===user.id);
    if(!s){
      // Өгөгдөл ачаалагдаагүй байна — дахин хайна
      return(
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",background:"linear-gradient(135deg,#667eea,#764ba2)"}}>
          <div style={{fontSize:40,marginBottom:12}}>🏫</div>
          <div style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:8}}>Мэдээлэл ачаалж байна...</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>Түр хүлээнэ үү</div>
        </div>
      );
    }
    const cls=_db.classes.find(c=>c.id===s.class_id);
    const ve=_db.vocab_entries.filter(v=>v.class_id===s.class_id);
    const classmates=students.filter(x=>x.class_id===s.class_id);
    return(
      <StudentView s={s} setStudents={setStudents} goBack={()=>setUser(null)}
        attMonth={attMonth} setAttMonth={setAttMonth} classDays={cls?.days||[]}
        vocabEntries={ve} classmates={classmates} classColor={cls?.color||"#7c3aed"}/>
    );
  }

  if(selCls){
    const cls=_db.classes.find(c=>c.id===selCls);
    if(!cls)return null;
    const clsSts=students.filter(s=>s.class_id===selCls);
    return(
      <ClassDetail cls={cls} isAdmin={isTeacher} isSuperAdmin={isSuperAdmin} students={clsSts} setStudents={setStudents}
        goBack={()=>setSelCls(null)} attMonth={attMonth} setAttMonth={setAttMonth}
        badgeDefs={badgeDefs} setBadgeDefs={setBadgeDefs}/>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:"#f8f9ff",fontFamily:"system-ui",padding:16,overflowX:"hidden",boxSizing:"border-box"}}>
      <div style={{maxWidth:720,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:21,fontWeight:800,color:"#1a1a2e"}}>🏫 한국어 학원</div>
            <div style={{fontSize:12,color:"#888",display:"flex",alignItems:"center",gap:6}}>
              {user.displayName} 👋
              {isSuperAdmin&&<span style={{background:"#f0f0ff",color:"#7c3aed",borderRadius:8,padding:"1px 7px",fontSize:10,fontWeight:600}}>Super Admin</span>}
              {!isSuperAdmin&&<span style={{background:"#f0fff4",color:"#2e7d32",borderRadius:8,padding:"1px 7px",fontSize:10,fontWeight:600}}>Багш</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {isSuperAdmin&&(
              <button onClick={()=>setShowAccounts(true)} style={{...bs("#f0f0ff","#7c3aed","#c5b8ff",true),position:"relative"}}>
                🔑 Бүртгэл
                {_pending.length>0&&<span style={{background:"#e53935",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,marginLeft:4}}>{_pending.length}</span>}
              </button>
            )}
            {isSuperAdmin&&<button onClick={()=>setShowAdd(true)} style={bs("#7c3aed","#fff",undefined,true)}>+ Анги</button>}
            <button onClick={()=>loadAll()} style={bs("#f0f0f0","#555","#e0e0e0",true)}>🔄</button>
            <button onClick={()=>setUser(null)} style={bs("#fff","#e53935","#ffcdd2",true)}>Гарах</button>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
          {visibleClasses.map(cls=>{
            const cs=students.filter(s=>s.class_id===cls.id);
            return(
              <div key={cls.id} onClick={()=>setSelCls(cls.id)}
                style={{background:"#fff",borderRadius:18,padding:16,cursor:"pointer",boxShadow:"0 3px 14px #0001",borderTop:`4px solid ${cls.color}`,transition:"transform .15s"}}
                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"}
                onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                <div style={{fontWeight:700,fontSize:15,color:"#1a1a2e",marginBottom:2}}>{cls.name}</div>
                <div style={{fontSize:11,color:"#888",marginBottom:8}}>🕐 {cls.time} · {(cls.days||[]).map(d=>DLABELS[d]).join(", ")}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {cs.map(s=>{
                    const t2=getT(s.theme_id);
                    return(
                      <div key={s.id} style={{width:30,height:30,borderRadius:"50%",overflow:"hidden",border:`2px solid ${cls.color}`,background:t2.soft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                        {s.photo_url?<img src={s.photo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:t2.emoji}
                      </div>
                    );
                  })}
                  <span style={{fontSize:11,color:"#aaa",marginLeft:2}}>{cs.length}</span>
                </div>
              </div>
            );
          })}
          {visibleClasses.length===0&&(
            <div style={{gridColumn:"1/-1",textAlign:"center",padding:"40px 20px",color:"#aaa",fontSize:14}}>
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
  );
}
