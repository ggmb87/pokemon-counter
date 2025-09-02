import React, { useEffect, useMemo, useState, useRef } from "react";

/* ---------- Types & effectiveness (main series) ---------- */
const TYPES = [
  "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison","Ground",
  "Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"
];

const chart = {
  Normal:{Rock:.5,Ghost:0,Steel:.5},
  Fire:{Fire:.5,Water:.5,Grass:2,Ice:2,Bug:2,Rock:.5,Dragon:.5,Steel:2},
  Water:{Fire:2,Water:.5,Grass:.5,Ground:2,Rock:2,Dragon:.5},
  Electric:{Water:2,Electric:.5,Grass:.5,Ground:0,Flying:2,Dragon:.5},
  Grass:{Fire:.5,Water:2,Grass:.5,Poison:.5,Ground:2,Flying:.5,Bug:.5,Rock:2,Dragon:.5,Steel:.5},
  Ice:{Fire:.5,Water:.5,Ice:.5,Ground:2,Flying:2,Grass:2,Dragon:2,Steel:.5},
  Fighting:{Normal:2,Ice:2,Rock:2,Dark:2,Steel:2,Poison:.5,Flying:.5,Psychic:.5,Bug:.5,Ghost:0,Fairy:.5},
  Poison:{Grass:2,Poison:.5,Ground:.5,Rock:.5,Ghost:.5,Steel:0,Fairy:2},
  Ground:{Fire:2,Electric:2,Grass:.5,Poison:2,Rock:2,Bug:.5,Flying:0,Steel:2},
  Flying:{Electric:.5,Grass:2,Fighting:2,Bug:2,Rock:.5,Steel:.5},
  Psychic:{Fighting:2,Poison:2,Psychic:.5,Steel:.5,Dark:0},
  Bug:{Fire:.5,Grass:2,Fighting:.5,Poison:.5,Flying:.5,Psychic:2,Ghost:.5,Dark:2,Steel:.5,Fairy:.5},
  Rock:{Fire:2,Ice:2,Flying:2,Bug:2,Fighting:.5,Ground:.5,Steel:.5},
  Ghost:{Normal:0,Psychic:2,Ghost:2,Dark:.5},
  Dragon:{Dragon:2,Steel:.5,Fairy:0},
  Dark:{Fighting:.5,Dark:.5,Ghost:2,Psychic:2,Fairy:.5},
  Steel:{Fire:.5,Water:.5,Electric:.5,Ice:2,Rock:2,Fairy:2,Steel:.5},
  Fairy:{Fire:.5,Poison:.5,Steel:.5,Fighting:2,Dragon:2,Dark:2}
};

function weaknessesOf(defTypes) {
  const res = Object.fromEntries(TYPES.map(t => [t, 1]));
  for (const atk of TYPES) {
    let mult = 1;
    for (const def of defTypes) {
      mult *= (chart[atk]?.[def] ?? 1);
    }
    res[atk] = mult;
  }
  return res;
}

/* ---------- Ability heuristics (lightweight) ---------- */
const ABILITY_EFFECTS = {
  "drizzle": { weather:"rain", atkByType:{Water:1.5}, riskModsAgainst:{Fire:0.8} },
  "drought": { weather:"sun", atkByType:{Fire:1.5}, riskModsAgainst:{Water:0.8} },
  "primordial-sea": { weather:"rain", atkByType:{Water:1.6}, negateTypes:["Fire"] },
  "desolate-land": { weather:"sun", atkByType:{Fire:1.6}, negateTypes:["Water"] },
  "sand-stream": { weather:"sand", bulkBonus:0.1 },
  "snow-warning": { weather:"snow", bulkBonus:0.05 },
  "orichalcum-pulse": { weather:"sun", flatOffense:1.3, signatureSE:{type:"Fighting", mult:1.33} },
  "hadron-engine":   { terrain:"electric", flatOffense:1.3, atkByType:{Electric:1.3}, signatureSE:{type:"Electric", mult:1.33} },
  "huge-power": { flatOffense:1.5 },
  "adaptability": { stabBoost:1.33 }
};

function applyAbilityToOffense(offense, hitType, mult, attackerTag) {
  const eff = ABILITY_EFFECTS[attackerTag];
  if (!eff) return offense;
  let o = offense;
  if (eff.flatOffense) o *= eff.flatOffense;
  if (eff.atkByType?.[hitType]) o *= eff.atkByType[hitType];
  if (eff.stabBoost) o *= eff.stabBoost;
  if (eff.signatureSE && eff.signatureSE.type === hitType && mult >= 2) o *= eff.signatureSE.mult;
  return o;
}
function applyAbilityToRisk(risk, targetTypes, attackerTag) {
  const eff = ABILITY_EFFECTS[attackerTag];
  if (!eff?.riskModsAgainst) return risk;
  let r = risk;
  for (const t of targetTypes) if (eff.riskModsAgainst[t]) r = Math.round(r * eff.riskModsAgainst[t]);
  return r;
}
function cancelIfOpposingWeathers(attackerTag, targetTag, hitType) {
  const a = ABILITY_EFFECTS[attackerTag]?.weather;
  const b = ABILITY_EFFECTS[targetTag]?.weather;
  if (!a || !b) return 1;
  if ((a==="rain" && b==="sun"  && hitType==="Water") ||
      (a==="sun"  && b==="rain" && hitType==="Fire")) {
    const atkBoost = ABILITY_EFFECTS[attackerTag].atkByType?.[hitType] || 1;
    return 1/atkBoost;
  }
  return 1;
}

/* ---------- Minimal built-in pool (used if JSON not loaded) ---------- */
const POKEDEX = [
  { name:"Regieleki", types:["Electric"], power:95, strong:["Electric"] },
  { name:"Zapdos", types:["Electric","Flying"], power:90, strong:["Electric","Flying"] },
  { name:"Iron Hands", types:["Fighting","Electric"], power:88, strong:["Fighting","Electric"] },
  { name:"Iron Valiant", types:["Fairy","Fighting"], power:92, strong:["Fairy","Fighting"] },
  { name:"Flutter Mane", types:["Ghost","Fairy"], power:94, strong:["Ghost","Fairy"] },
  { name:"Zacian", types:["Fairy","Steel"], power:98, strong:["Fairy","Steel"], restricted:true },
  { name:"Mewtwo", types:["Psychic"], power:96, strong:["Psychic"], restricted:true },
  { name:"Chien-Pao", types:["Dark","Ice"], power:93, strong:["Dark","Ice"] },
  { name:"Weavile", types:["Dark","Ice"], power:88, strong:["Dark","Ice"] },
  { name:"Baxcalibur", types:["Dragon","Ice"], power:92, strong:["Ice","Dragon"] },
  { name:"Dragonite", types:["Dragon","Flying"], power:90, strong:["Dragon","Flying"] },
  { name:"Talonflame", types:["Fire","Flying"], power:84, strong:["Flying","Fire"] },
  { name:"Staraptor", types:["Normal","Flying"], power:86, strong:["Flying"] },
  { name:"Garchomp", types:["Dragon","Ground"], power:91, strong:["Ground","Dragon"] },
  { name:"Tyranitar", types:["Rock","Dark"], power:92, strong:["Rock","Dark"], abilityTag:"sand-stream" },
  { name:"Rampardos", types:["Rock"], power:96, strong:["Rock"] },
  { name:"Rhyperior", types:["Ground","Rock"], power:90, strong:["Rock","Ground"] },
  { name:"Terrakion", types:["Rock","Fighting"], power:92, strong:["Rock","Fighting"] },
  { name:"Aerodactyl (Mega)", apiSlug:"aerodactyl-mega", isMega:true, types:["Rock","Flying"], power:95, strong:["Rock","Flying"] },
  { name:"Diancie (Mega)", apiSlug:"diancie-mega", isMega:true, types:["Rock","Fairy"], power:98, strong:["Rock","Fairy"] },
  { name:"Greninja", types:["Water","Dark"], power:90, strong:["Water","Dark"] },
  { name:"Rillaboom", types:["Grass"], power:90, strong:["Grass"] },
  { name:"Kartana", types:["Grass","Steel"], power:96, strong:["Grass","Steel"] },
  { name:"Gengar", types:["Ghost","Poison"], power:90, strong:["Ghost","Poison"] },
  { name:"Gengar (Mega)", apiSlug:"gengar-mega", isMega:true, types:["Ghost","Poison"], power:96, strong:["Ghost","Poison"] },
  { name:"Scizor (Mega)", apiSlug:"scizor-mega", isMega:true, types:["Bug","Steel"], power:95, strong:["Bug","Steel"] },
  { name:"Volcarona", types:["Bug","Fire"], power:92, strong:["Bug","Fire"] },
  { name:"Metagross (Mega)", apiSlug:"metagross-mega", isMega:true, types:["Steel","Psychic"], power:98, strong:["Steel","Psychic"] },
  { name:"Heatran", types:["Fire","Steel"], power:92, strong:["Fire","Steel"] },
  { name:"Charizard (Mega Y)", apiSlug:"charizard-mega-y", isMega:true, types:["Fire","Flying"], power:98, strong:["Fire","Flying"], abilityTag:"drought" },
  { name:"Mamoswine", types:["Ice","Ground"], power:90, strong:["Ice","Ground"] },
];

/* ---------- UI helpers ---------- */
const TYPE_COLORS = {
  Normal:"#A8A77A", Fire:"#EE8130", Water:"#6390F0", Electric:"#F7D02C", Grass:"#7AC74C",
  Ice:"#96D9D6", Fighting:"#C22E28", Poison:"#A33EA1", Ground:"#E2BF65", Flying:"#A98FF3",
  Psychic:"#F95587", Bug:"#A6B91A", Rock:"#B6A136", Ghost:"#735797", Dragon:"#6F35FC",
  Dark:"#705746", Steel:"#B7B7CE", Fairy:"#D685AD",
};
const TypeBadge = ({ t }) => (
  <span className="px-2 py-0.5 rounded-md text-xs font-semibold border border-white/10 shadow-sm text-slate-900"
        style={{ backgroundColor: TYPE_COLORS[t] || "#ccc" }}>{t}</span>
);
function Card({ title, children, right }) {
  return (
    <div className="rounded-2xl shadow-lg p-4 ring-1 bg-slate-800/60 ring-white/10">
      {(title || right) && (
        <div className="flex items-center justify-between mb-2">
          {title ? <h3 className="text-lg font-bold text-white">{title}</h3> : <div />}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------- Ranking ---------- */
function normType(t){ if(!t) return ""; const k=t[0].toUpperCase()+t.slice(1).toLowerCase(); return TYPES.includes(k)?k:t; }

function rankCounters(
  targetTypes,
  { allowRestricted=true, showMega=true, targetAbilityTag=null } = {},
  dexPool = POKEDEX
){
  if (!targetTypes?.length) return { weaknesses:{}, picks:[] };

  const weaknesses = weaknessesOf(targetTypes);
  const weakPairs = Object.entries(weaknesses).filter(([,m])=>m>=2).sort((a,b)=>b[1]-a[1]);
  const pool = dexPool.filter(p => (allowRestricted || !p.restricted) && (showMega || !p.isMega));

  const picks = pool.map(attacker => {
    // Build a robust “strong types” set
    const strongSet = [
      ...(attacker.strong||[]),
      ...(attacker.strongMoves||[]),
      ...(attacker.types||[])
    ]
      .map(normType)
      .filter((t,i,a)=> t && a.indexOf(t)===i);

    // pick the strongest match (≥2 and not 0)
    let bestType = null, bestMult = 0;
    for (const t of strongSet) {
      const mult = weaknesses[t] ?? 1;
      if (mult >= 2 && mult > bestMult) {
        bestType = t; bestMult = mult;
      }
    }
    if (!bestType) return null;           // nothing super effective
    if (bestMult === 0) return null;      // can’t hit (e.g., Ground into Flying)

    // incoming risk from target STABs
    const incomingMults = targetTypes.map(stab =>
      (attacker.types||["Normal"]).reduce((m,def)=> m * ((chart[stab]?.[def] ?? 1)), 1)
    );
    const worstIncoming = Math.max(...incomingMults);

    // baseline offense / risk
    let offense = bestMult * ((attacker.power||90)/100);
    let riskVal = worstIncoming >= 4 ? 100 : worstIncoming >= 2 ? 75 : worstIncoming <= .5 ? 25 : 50;

    // attacker ability effects (always on)
    const tag = attacker.abilityTag;
    if (tag) {
      offense = applyAbilityToOffense(offense, bestType, bestMult, tag);
      if (targetAbilityTag) {
        offense *= cancelIfOpposingWeathers(tag, targetAbilityTag, bestType);
        const neg = ABILITY_EFFECTS[targetAbilityTag]?.negateTypes || [];
        if (neg.includes(bestType)) { offense *= 0.6; riskVal *= 1.2; }
      }
      riskVal = applyAbilityToRisk(riskVal, targetTypes, tag);
    }

    const survBonus = worstIncoming <= 0.5 ? 0.15 : worstIncoming === 1 ? 0.05 : 0;
    const score = Number((offense + survBonus).toFixed(3));
    const damagePotential = Math.min(100, Math.round(offense * 50));
    const risk = Math.max(0, Math.min(100, Math.round(riskVal)));

    return { attacker, hitType:bestType, mult:bestMult, score, damagePotential, risk };
  }).filter(Boolean).sort((a,b)=> b.score - a.score);

  return { weaknesses:Object.fromEntries(weakPairs), picks };
}

/* ---------- Helpers ---------- */
const artFromId = id => id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` : null;
const nameToSlug = name => (name||"").toLowerCase().replace(/[^a-z0-9- ]/g,"").trim().replace(/ +/g,"-");
const prettyName = slug => slug ? slug.split("-").map(s=> s? s[0].toUpperCase()+s.slice(1) : s).join(" ") : "";

/* ======================================================= */

export default function App(){
  const [mode, setMode] = useState("pokemon");
  const [query, setQuery] = useState("");
  const [pickedTypes, setPickedTypes] = useState([]);
  const [showNeutral, setShowNeutral] = useState(false);
  const [showResists, setShowResists] = useState(false);
  const [showMega, setShowMega] = useState(true);
  const [allowRestricted, setAllowRestricted] = useState(true);
  const [useHiddenAbility, setUseHiddenAbility] = useState(false); // NEW

  // target info
  const [target, setTarget] = useState({ name:"", types:[], sprite:null });

  // compiled dex (if present)
  const [fullDex, setFullDex] = useState(null);
  const [nameList, setNameList] = useState(POKEDEX.map(p=>p.name));

  useEffect(() => {
    fetch("/data/index.json")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => {
        if (Array.isArray(j?.pokemon)) setFullDex(j.pokemon);
        if (Array.isArray(j?.names) && j.names.length) setNameList(j.names);
      })
      .catch(()=>{});
    // soft fallback to species list for nicer autocomplete
    fetch("https://pokeapi.co/api/v2/pokemon-species?limit=2000")
      .then(r=>r.ok?r.json():Promise.reject())
      .then(d => {
        const names = (d?.results||[]).map(x=>x.name);
        if (names.length) setNameList(prev => Array.from(new Set([...prev, ...names])));
      })
      .catch(()=>{});
  }, []);

  // autocomplete UI
  const [showSug, setShowSug] = useState(false);
  const [hi, setHi] = useState(0);
  const suggestions = useMemo(() => {
    const q = (query||"").toLowerCase();
    return nameList
      .filter(n => !q || n.toLowerCase().startsWith(q) || n.toLowerCase().includes(q))
      .sort((a,b)=>{
        const A=a.toLowerCase(), B=b.toLowerCase();
        const aw=A.startsWith(q)?0:1, bw=B.startsWith(q)?0:1;
        return aw-bw || a.localeCompare(b);
      })
      .slice(0,8);
  }, [nameList, query]);

  // fetch selected Pokémon
  const fetchIdRef = useRef(0);
  useEffect(() => {
    if (mode !== "pokemon") return;
    const slug = nameToSlug(query);
    if (!slug) return;
    const myId = ++fetchIdRef.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error("not found")))
        .then(d => {
          if (myId !== fetchIdRef.current) return;
          const sprite = d?.sprites?.other?.["official-artwork"]?.front_default || d?.sprites?.front_default || null;
          const types = (d?.types||[]).map(x => x.type.name).map(t => t[0].toUpperCase()+t.slice(1));
          setTarget({ name:d?.name || slug, types, sprite });
        })
        .catch(err => {
          if (myId !== fetchIdRef.current) return;
          if (err?.name === "AbortError") return;
          setTarget({ name:query, types:[], sprite:null });
        });
    }, 150);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, mode]);

  // choose ability tag (normal / hidden)
  const targetAbilityTag = useMemo(() => {
    if (!fullDex || !target?.name) return null;
    const t = (target.name||"").toLowerCase();
    const hit = fullDex.find(p => (p.name||"").toLowerCase() === t);
    if (!hit) return null;
    if (useHiddenAbility && hit.hiddenAbilityTag) return hit.hiddenAbilityTag;
    return hit.abilityTag || null;
  }, [fullDex, target?.name, useHiddenAbility]);

  const pool = fullDex ?? POKEDEX;
  const activeTypes = mode === "pokemon" ? target.types : pickedTypes;
  const { weaknesses, picks } = useMemo(
    () => rankCounters(activeTypes, { allowRestricted, showMega, targetAbilityTag }, pool),
    [activeTypes, allowRestricted, showMega, targetAbilityTag, pool]
  );

  const fullMap = useMemo(() => weaknessesOf(activeTypes), [activeTypes]);
  const [w4,w2,w1,r05,r0] = useMemo(() => {
    const a4=[],a2=[],a1=[],a05=[],a0=[];
    Object.entries(fullMap).forEach(([t,m])=>{
      if (m===4) a4.push([t,m]); else if (m===2) a2.push([t,m]);
      else if (m===1) a1.push([t,m]); else if (m===.5) a05.push([t,m]);
      else if (m===0) a0.push([t,m]);
    });
    return [a4,a2,a1,a05,a0];
  }, [fullMap]);

  // show-more
  const [visibleCount, setVisibleCount] = useState(10);
  useEffect(()=>{ setVisibleCount(10); }, [query, allowRestricted, showMega, mode, pickedTypes, useHiddenAbility]);

  // lazy sprite fetch for counters
  const [sprites, setSprites] = useState({});
  useEffect(() => {
    picks.forEach(({ attacker }) => {
      const slug = attacker.apiSlug || nameToSlug(attacker.name);
      if (!slug || sprites[slug]) return;
      fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => {
          const url = d?.sprites?.other?.["official-artwork"]?.front_default || d?.sprites?.front_default || null;
          if (url) setSprites(prev => ({ ...prev, [slug]: url }));
        })
        .catch(()=>{});
    });
  }, [picks, sprites]);

  const displayName = mode==='pokemon' ? (target.name ? prettyName(target.name) : query) : (pickedTypes.join(" / ") || "");

  return (
    <div className="bg-slate-900 text-slate-200 min-h-screen p-6">
      <div className="max-w-5xl mx-auto grid gap-4">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-extrabold text-white">Pokémon Counter Finder (Alpha)</h1>
        </header>

        {/* Input */}
        <Card title="Enter a Pokémon">
          <div className="mb-3">
            <div className="inline-flex rounded-lg border border-white/10 bg-slate-900/40">
              <button onClick={()=>setMode('pokemon')} className={`px-3 py-1.5 text-sm rounded-l-lg ${mode==='pokemon'?'bg-slate-700 text-white':'opacity-80'}`}>Pokémon</button>
              <button onClick={()=>setMode('types')} className={`px-3 py-1.5 text-sm rounded-r-lg ${mode==='types'?'bg-slate-700 text-white':'opacity-80'}`}>Types</button>
            </div>
          </div>

          {mode==='pokemon' ? (
            <div className="relative">
              <input
                className="w-full p-3 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring focus:ring-indigo-500"
                value={query}
                placeholder="e.g., Charizard"
                onChange={e=>{ setQuery(e.target.value); setShowSug(true); setHi(0); }}
                onFocus={()=> setShowSug(true)}
                onKeyDown={(e)=>{
                  if (!showSug || suggestions.length===0) return;
                  if (e.key==='ArrowDown'){ e.preventDefault(); setHi((hi+1)%suggestions.length); }
                  else if (e.key==='ArrowUp'){ e.preventDefault(); setHi((hi-1+suggestions.length)%suggestions.length); }
                  else if (e.key==='Enter' || e.key==='Tab'){ e.preventDefault(); setQuery(suggestions[hi]||suggestions[0]); setShowSug(false); }
                  else if (e.key==='Escape'){ setShowSug(false); }
                }}
                onBlur={()=> setTimeout(()=> setShowSug(false), 120)}
              />
              {showSug && suggestions.length>0 && (
                <ul className="absolute left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl shadow-xl max-h-60 overflow-auto z-10">
                  {suggestions.map((n,i)=>(
                    <li key={n}
                        className={`px-3 py-2 cursor-pointer ${i===hi?'bg-slate-700':'hover:bg-slate-700/60'}`}
                        onMouseDown={()=>{ setQuery(n); setShowSug(false); }}>
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {TYPES.map(t=>{
                  const selected = pickedTypes.includes(t);
                  return (
                    <button key={t}
                            onClick={()=>{
                              setPickedTypes(prev => prev.includes(t)
                                ? prev.filter(x=>x!==t)
                                : (prev.length>=2 ? [prev[1],t] : [...prev,t]));
                            }}
                            className={`flex items-center justify-center gap-2 px-2 py-2 rounded-xl border bg-slate-800/60 border-white/10 ${selected?'ring-2 ring-indigo-500':''}`}>
                      <TypeBadge t={t}/>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs opacity-70 mt-2">Pick up to 2 types.</div>
            </div>
          )}
        </Card>

        {/* Target */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {(mode==='pokemon' && target.sprite)
                ? <img src={target.sprite} alt={displayName} className="w-20 h-20 object-contain drop-shadow"/>
                : <div className="w-20 h-20 rounded-xl bg-slate-700 grid place-items-center text-slate-300 text-sm">{displayName?.[0]||"?"}</div>
              }
              <div>
                <div className="font-semibold text-white text-base">{displayName || "Unknown"}</div>
                <div className="mt-2 text-sm flex gap-2 flex-wrap items-center">
                  <span className="opacity-70">Types:</span>
                  {(mode==='pokemon'?target.types:pickedTypes).length
                    ? (mode==='pokemon'?target.types:pickedTypes).map(t => <TypeBadge key={t} t={t}/>)
                    : <em className="opacity-60">unknown</em>}
                </div>
              </div>
            </div>
            {/* toggles */}
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500"
                       checked={useHiddenAbility}
                       onChange={e=>setUseHiddenAbility(e.target.checked)}
                       disabled={!fullDex}/>
                Hidden Ability
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500" checked={showNeutral} onChange={e=>setShowNeutral(e.target.checked)} />
                Show Neutral
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500" checked={showResists} onChange={e=>setShowResists(e.target.checked)} />
                Show Resists
              </label>
            </div>
          </div>

          {/* Weaknesses / Neutral / Resists */}
          <div className="mt-3 text-sm flex flex-col gap-2">
            <div className="relative flex items-start gap-2 flex-wrap pl-28">
              <div className="absolute left-0 top-0 font-semibold text-white text-base">Weaknesses:</div>
              {activeTypes?.length
                ? ([...w4,...w2].length
                    ? [...w4,...w2].map(([t,m])=>(
                        <div key={`w-${t}`} className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-white/10 bg-slate-800">
                          <TypeBadge t={t}/> <span className="text-xs opacity-80">x{m}</span>
                        </div>
                      ))
                    : <em className="opacity-60">—</em>)
                : <em className="opacity-60">—</em>}
            </div>

            {showNeutral && (
              <div className="relative flex items-start gap-2 flex-wrap pl-28">
                <div className="absolute left-0 top-0 font-semibold text-white text-base">Neutral:</div>
                {w1.length ? w1.map(([t,m])=>(
                  <div key={`n-${t}`} className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-white/10 bg-slate-800">
                    <TypeBadge t={t}/> <span className="text-xs opacity-80">x{m}</span>
                  </div>
                )) : <em className="opacity-60">—</em>}
              </div>
            )}

            {showResists && (
              <div className="relative flex items-start gap-2 flex-wrap pl-28">
                <div className="absolute left-0 top-0 font-semibold text-white text-base">Resists:</div>
                {[...r05,...r0].length ? [...r05,...r0].map(([t,m])=>(
                  <div key={`r-${t}`} className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-white/10 bg-slate-800">
                    <TypeBadge t={t}/> <span className="text-xs opacity-80">x{m}</span>
                  </div>
                )) : <em className="opacity-60">—</em>}
              </div>
            )}
          </div>
        </Card>

        {/* Counters */}
        <Card title="Suggested counters" right={(
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" className="accent-indigo-500" checked={showMega} onChange={e=>setShowMega(e.target.checked)} />
              Show Mega forms
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" className="accent-indigo-500" checked={allowRestricted} onChange={e=>setAllowRestricted(e.target.checked)} />
              Allow restricted legendaries
            </label>
          </div>
        )}>
          {picks.length ? (
            <>
              <ul className="grid gap-3">
                {picks.slice(0,visibleCount).map(({ attacker, hitType, mult, score, damagePotential, risk })=>{
                  const slug = attacker.apiSlug || nameToSlug(attacker.name);
                  const url = attacker.id ? artFromId(attacker.id) : (slug ? (sprites[slug] || null) : null);
                  return (
                    <li key={attacker.name} className="bg-slate-800 rounded-xl p-4 ring-1 ring-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {url
                          ? <img src={url} alt={attacker.name} className="w-12 h-12 object-contain drop-shadow"/>
                          : <div className="w-12 h-12 rounded-xl bg-slate-700 grid place-items-center text-slate-300 text-sm">{attacker.name[0]}</div>}
                        <div>
                          <div className="font-semibold text-white text-base">{attacker.name}</div>
                          <div className="text-xs flex gap-2 mt-1 flex-wrap items-center">
                            <span className="opacity-70">Types:</span>
                            {(attacker.types||[]).map(t=> <TypeBadge key={t} t={t}/>)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="opacity-80">Hits with</span> <TypeBadge t={hitType}/>
                          <span className="opacity-80">• x{mult}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="opacity-70">Damage potential</div>
                            <div className="w-36 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full" style={{ width:`${damagePotential}%`, background:"linear-gradient(90deg,#22c55e,#eab308)" }}/>
                            </div>
                          </div>
                          <div>
                            <div className="opacity-70">Incoming damage</div>
                            <div className="w-36 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full" style={{ width:`${risk}%`, background:"linear-gradient(90deg,#60a5fa,#ef4444)" }}/>
                            </div>
                          </div>
                        </div>
                        <div className="opacity-60 mt-1">Score {score}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {picks.length>visibleCount && (
                <div className="mt-3 flex justify-center">
                  <button onClick={()=>setVisibleCount(c=>c+10)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm border border-white/10">
                    Show 10 more
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm opacity-60">No matches yet.</p>
          )}
        </Card>

        <Card title="Assumptions (simple mode)">
          <ul className="list-disc ml-5 text-sm leading-6 opacity-90">
            <li>Abilities applied automatically (weather/engines/pulses, Huge Power, Adaptability, etc.).</li>
            <li>Toggle “Hidden Ability” for the target when it has one.</li>
            <li>No items, EVs, or Tera; heuristic scoring only.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
