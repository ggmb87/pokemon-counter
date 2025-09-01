import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------- Types and effectiveness ---------- */
const TYPES = [
  "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"
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
  Fairy:{Fire:.5,Poison:.5,Steel:.5,Fighting:2,Dragon:2,Dark:2},
};

function weaknessesOf(defTypes) {
  const res = Object.fromEntries(TYPES.map(t => [t,1]));
  for (const atk of TYPES) {
    let mult = 1;
    for (const def of defTypes) mult *= (chart[atk]?.[def] ?? 1);
    res[atk] = mult;
  }
  return res;
}

/* ---------- Ability heuristics (lightweight) ---------- */
const ABILITY_EFFECTS = {
  "drizzle": { weather:"rain", atkByType:{Water:1.5}, riskModsAgainst:{Fire:0.8} },
  "drought": { weather:"sun",  atkByType:{Fire:1.5},  riskModsAgainst:{Water:0.8} },
  "primordial-sea": { weather:"rain", atkByType:{Water:1.6}, negateTypes:["Fire"] },
  "desolate-land":  { weather:"sun",  atkByType:{Fire:1.6},  negateTypes:["Water"] },
  "sand-stream": { weather:"sand", bulkBonus:0.1 },
  "snow-warning": { weather:"snow", bulkBonus:0.05 },
  "orichalcum-pulse": { weather:"sun", flatOffense:1.3, signatureSE:{type:"Fighting", mult:1.33} },
  "hadron-engine":   { terrain:"electric", flatOffense:1.3, atkByType:{Electric:1.3}, signatureSE:{type:"Electric", mult:1.33} },
  "huge-power": { flatOffense:1.5 },
  "adaptability": { stabBoost:1.33 },
};

function applyAbilityToOffense(o, hitType, mult, tag){
  const eff = ABILITY_EFFECTS[tag]; if(!eff) return o;
  let v=o;
  if(eff.flatOffense) v*=eff.flatOffense;
  if(eff.atkByType?.[hitType]) v*=eff.atkByType[hitType];
  if(eff.stabBoost) v*=eff.stabBoost;
  if(eff.signatureSE && eff.signatureSE.type===hitType && mult>=2) v*=eff.signatureSE.mult;
  return v;
}
function applyAbilityToRisk(r,targetTypes,tag){
  const eff=ABILITY_EFFECTS[tag]; if(!eff?.riskModsAgainst) return r;
  let v=r; for(const t of targetTypes){ if(eff.riskModsAgainst[t]) v=Math.round(v*eff.riskModsAgainst[t]); }
  return v;
}
function cancelIfOpposingWeathers(attTag, tgtTag, hitType){
  const a=ABILITY_EFFECTS[attTag]?.weather, b=ABILITY_EFFECTS[tgtTag]?.weather;
  if(!a||!b) return 1;
  if((a==="rain"&&b==="sun"&&hitType==="Water")||(a==="sun"&&b==="rain"&&hitType==="Fire")){
    const atkBoost = ABILITY_EFFECTS[attTag].atkByType?.[hitType] || 1;
    return 1/atkBoost;
  }
  return 1;
}

/* ---------- Curated attacker pool (keeps `strong` flags) ---------- */
const POKEDEX = [
  { name:"Regieleki", types:["Electric"], power:95, strong:["Electric"] },
  { name:"Zapdos", types:["Electric","Flying"], power:90, strong:["Electric","Flying"] },
  { name:"Iron Hands", types:["Fighting","Electric"], power:88, strong:["Fighting","Electric"] },

  { name:"Zacian", types:["Fairy","Steel"], power:98, strong:["Fairy","Steel"], restricted:true },
  { name:"Flutter Mane", types:["Ghost","Fairy"], power:94, strong:["Ghost","Fairy"] },
  { name:"Mewtwo", types:["Psychic"], power:96, strong:["Psychic"], restricted:true },

  { name:"Chien-Pao", types:["Dark","Ice"], power:93, strong:["Dark","Ice"] },
  { name:"Baxcalibur", types:["Dragon","Ice"], power:92, strong:["Ice","Dragon"] },
  { name:"Dragonite", types:["Dragon","Flying"], power:90, strong:["Dragon","Flying"] },

  { name:"Rampardos", types:["Rock"], power:96, strong:["Rock"] },
  { name:"Tyranitar (Mega)", apiSlug:"tyranitar-mega", isMega:true, types:["Rock","Dark"], power:99, strong:["Rock","Dark"], abilityTag:"sand-stream" },
  { name:"Aerodactyl (Mega)", apiSlug:"aerodactyl-mega", isMega:true, types:["Rock","Flying"], power:95, strong:["Rock","Flying"] },

  { name:"Heatran", types:["Fire","Steel"], power:92, strong:["Fire","Steel"] },
  { name:"Charizard (Mega X)", apiSlug:"charizard-mega-x", isMega:true, types:["Fire","Dragon"], power:97, strong:["Fire","Dragon"] },
  { name:"Charizard (Mega Y)", apiSlug:"charizard-mega-y", isMega:true, types:["Fire","Flying"], power:98, strong:["Fire","Flying"], abilityTag:"drought" },

  { name:"Garchomp", types:["Dragon","Ground"], power:91, strong:["Ground","Dragon"] },
  { name:"Garchomp (Mega)", apiSlug:"garchomp-mega", isMega:true, types:["Dragon","Ground"], power:97, strong:["Dragon","Ground"] },
  { name:"Excadrill", types:["Ground","Steel"], power:90, strong:["Ground","Steel"] },

  { name:"Metagross (Mega)", apiSlug:"metagross-mega", isMega:true, types:["Steel","Psychic"], power:98, strong:["Steel","Psychic"] },
  { name:"Scizor (Mega)", apiSlug:"scizor-mega", isMega:true, types:["Bug","Steel"], power:95, strong:["Bug","Steel"] },
  { name:"Heracross (Mega)", apiSlug:"heracross-mega", isMega:true, types:["Bug","Fighting"], power:94, strong:["Bug","Fighting"] },

  { name:"Greninja", types:["Water","Dark"], power:90, strong:["Water","Dark"] },
  { name:"Kingdra", types:["Water","Dragon"], power:88, strong:["Water","Dragon"] },
  { name:"Rillaboom", types:["Grass"], power:90, strong:["Grass"] },

  { name:"Mamoswine", types:["Ice","Ground"], power:90, strong:["Ice","Ground"] },
];

/* ---------- UI helpers ---------- */
const TYPE_COLORS = {
  Normal:"#A8A77A", Fire:"#EE8130", Water:"#6390F0", Electric:"#F7D02C", Grass:"#7AC74C",
  Ice:"#96D9D6", Fighting:"#C22E28", Poison:"#A33EA1", Ground:"#E2BF65", Flying:"#A98FF3",
  Psychic:"#F95587", Bug:"#A6B91A", Rock:"#B6A136", Ghost:"#735797", Dragon:"#6F35FC",
  Dark:"#705746", Steel:"#B7B7CE", Fairy:"#D685AD",
};
const artFromId = (id) =>
  id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` : null;

function TypeBadge({ t }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-xs font-semibold border border-white/10 shadow-sm text-slate-900"
      style={{ backgroundColor: TYPE_COLORS[t] || "#ccc" }}>
      {t}
    </span>
  );
}
function Card({ title, right, children }) {
  return (
    <div className="rounded-2xl shadow-lg p-4 bg-slate-800/60 ring-1 ring-white/10">
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

/* ---------- Scoring ---------- */
function rankCounters(targetTypes, { allowRestricted=true, showMega=true, targetAbilityTag=null }={}, dexPool=POKEDEX){
  if(!targetTypes?.length) return { weaknesses:{}, picks:[] };
  const weaknesses = weaknessesOf(targetTypes);
  const weak = Object.entries(weaknesses).filter(([,m])=>m>=2).sort((a,b)=>b[1]-a[1]);
  const pool = dexPool.filter(p => (allowRestricted||!p.restricted) && (showMega||!p.isMega));

  const picks = pool.map(att=>{
    const hitType = att.strong?.find(t => (weaknesses[t]??1)>=2);
    if(!hitType) return null;
    const mult = weaknesses[hitType];

    // incoming risk from target STABs
    const incoming = targetTypes.map(stab => att.types.reduce((m,def)=>m*(chart[stab]?.[def]??1),1));
    const worstIncoming = Math.max(...incoming);

    // baseline offense/risk
    let offense = mult * (att.power/100);
    let riskVal = worstIncoming>=4?100: worstIncoming>=2?75: worstIncoming<=.5?25:50;

    // always-on ability heuristics (attacker + simple clash with target weather)
    if (att.abilityTag) {
      offense = applyAbilityToOffense(offense, hitType, mult, att.abilityTag);
      if (targetAbilityTag) {
        offense *= cancelIfOpposingWeathers(att.abilityTag, targetAbilityTag, hitType);
        const neg = ABILITY_EFFECTS[targetAbilityTag]?.negateTypes||[];
        if(neg.includes(hitType)){ offense*=0.6; riskVal*=1.2; }
      }
      riskVal = applyAbilityToRisk(riskVal, targetTypes, att.abilityTag);
    }

    const survBonus = worstIncoming<=.5 ? .15 : worstIncoming===1 ? .05 : 0;
    const score = Number((offense + survBonus).toFixed(3));

    return {
      attacker: att,
      hitType, mult, score,
      damagePotential: Math.min(100, Math.round(offense*50)),
      risk: Math.max(0, Math.min(100, Math.round(riskVal))),
    };
  }).filter(Boolean).sort((a,b)=>b.score-a.score);

  return { weaknesses:Object.fromEntries(weak), picks };
}

/* ---------- App ---------- */
export default function App() {
  const [mode, setMode] = useState("pokemon");
  const [query, setQuery] = useState("");
  const [pickedTypes, setPickedTypes] = useState([]);
  const [allowRestricted, setAllowRestricted] = useState(true);
  const [showMega, setShowMega] = useState(true);
  const [showNeutral, setShowNeutral] = useState(false);
  const [showResists, setShowResists] = useState(false);

  // compiled index for names/aliases + target ability
  const [dex, setDex] = useState(null);
  const [nameList, setNameList] = useState([]);

  const [target, setTarget] = useState(null); // {name, slug, id, types, abilityTag}

  useEffect(() => {
    fetch("/data/index.json")
      .then(r => r.json())
      .then(j => {
        setDex(j.pokemon || []);
        setNameList(j.names || []);
      })
      .catch(()=>{});
  }, []);

  const aliasMap = useMemo(() => {
    const m = new Map();
    (dex||[]).forEach(p => {
      p.aliases?.forEach(a => m.set(a, p.slug));
      m.set(p.name.toLowerCase(), p.slug);
      m.set(p.slug.toLowerCase(), p.slug);
    });
    return m;
  }, [dex]);

  const suggestions = useMemo(() => {
    const q = (query||"").toLowerCase();
    return (nameList||[])
      .filter(n => !q || n.toLowerCase().startsWith(q) || n.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, nameList]);

  // resolve a query string to a dex entry (prefer local, else network)
  const resolveTarget = async (str) => {
    const key = (str||"").toLowerCase().trim();
    const slug = aliasMap.get(key);
    const local = slug ? (dex||[]).find(p => p.slug === slug) : null;
    if (local) return local;

    try {
      const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${key}`);
      if (!r.ok) throw new Error("not found");
      const d = await r.json();
      const types = (d.types||[]).sort((a,b)=>a.slot-b.slot).map(t=>t.type.name).map(t=>t[0].toUpperCase()+t.slice(1));
      return { name: d.name, slug: d.name, id: d.id, types, abilityTag: null };
    } catch {
      return { name: str, slug: key, id: null, types: [], abilityTag: null };
    }
  };

  // autocomplete commit
  const [showSug, setShowSug] = useState(false);
  const [hi, setHi] = useState(0);
  const commitSuggestion = async (s) => {
    setQuery(s);
    setShowSug(false);
    setHi(0);
    const t = await resolveTarget(s);
    setTarget(t);
  };

  const targetAbilityTag = target?.abilityTag || null;
  const activeTypes = mode === "pokemon" ? (target?.types || []) : pickedTypes;

  // IMPORTANT: keep curated pool; index.json is NOT used for counter pool
  const pool = POKEDEX;
  const { weaknesses, picks } = useMemo(
    () => rankCounters(activeTypes, { allowRestricted, showMega, targetAbilityTag }, pool),
    [activeTypes, allowRestricted, showMega, targetAbilityTag]
  );

  const fullMap = useMemo(() => weaknessesOf(activeTypes), [activeTypes]);
  const buckets = useMemo(() => {
    const w4=[],w2=[],w1=[],r05=[],r0=[];
    Object.entries(fullMap).forEach(([t,m])=>{
      if(m===4) w4.push([t,m]); else if(m===2) w2.push([t,m]);
      else if(m===1) w1.push([t,m]); else if(m===.5) r05.push([t,m]);
      else if(m===0) r0.push([t,m]);
    });
    return {w4,w2,w1,r05,r0};
  }, [fullMap]);

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
              <button onClick={()=>setMode('types')}    className={`px-3 py-1.5 text-sm rounded-r-lg ${mode==='types'   ?'bg-slate-700 text-white':'opacity-80'}`}>Types</button>
            </div>
          </div>

          {mode==='pokemon' ? (
            <div className="relative">
              <input
                className="w-full p-3 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring focus:ring-indigo-500"
                value={query}
                placeholder="e.g., Garchomp (Mega)"
                onChange={e=>{ setQuery(e.target.value); setShowSug(true); setHi(0); }}
                onFocus={()=> setShowSug(true)}
                onKeyDown={async (e)=>{
                  if (suggestions.length>0) {
                    if (e.key==='ArrowDown'){ e.preventDefault(); setHi((hi+1)%suggestions.length); }
                    if (e.key==='ArrowUp'){ e.preventDefault(); setHi((hi-1+suggestions.length)%suggestions.length); }
                    if (e.key==='Enter' || e.key==='Tab'){ e.preventDefault(); await commitSuggestion(suggestions[hi] ?? suggestions[0]); }
                    if (e.key==='Escape'){ e.preventDefault(); setShowSug(false); }
                  }
                }}
                onBlur={()=> setTimeout(()=> setShowSug(false), 150)}
              />
              {showSug && suggestions.length>0 && (
                <ul className="absolute left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl shadow-xl max-h-60 overflow-auto z-10">
                  {suggestions.map((n,i)=>(
                    <li key={n}
                        className={`px-3 py-2 cursor-pointer ${i===hi ? 'bg-slate-700' : 'hover:bg-slate-700/60'}`}
                        onMouseDown={()=> commitSuggestion(n)}>
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
                    <button key={t} onClick={()=>{
                      setPickedTypes(prev=> prev.includes(t) ? prev.filter(x=>x!==t) : (prev.length>=2 ? [prev[1], t] : [...prev, t]));
                    }} className={`flex items-center justify-center gap-2 px-2 py-2 rounded-xl border bg-slate-800/60 border-white/10 ${selected?'ring-2 ring-indigo-500':''}`}>
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
              {target?.id ? (
                <img src={artFromId(target.id)} alt={target.name} className="w-20 h-20 object-contain drop-shadow" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-slate-700 grid place-items-center text-slate-300 text-sm">{(target?.name||query||"?")[0]?.toUpperCase()||"?"}</div>
              )}
              <div>
                <div className="font-semibold text-white text-base">{target?.name || query || "Unknown"}</div>
                <div className="mt-2 text-sm flex gap-2 flex-wrap items-center">
                  <span className="opacity-70">Types:</span>
                  {(target?.types||pickedTypes||[]).length ? (target?.types||pickedTypes).map(t => <TypeBadge key={t} t={t}/>) : <em className="opacity-60">unknown</em>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
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

          {/* Weakness layout */}
          {(() => {
            const {w4,w2,w1,r05,r0} = buckets;
            const Row = ({label,items}) => (
              <div className="relative flex items-start gap-2 flex-wrap pl-28">
                <div className="absolute left-0 top-0 font-semibold text-white text-base">{label}</div>
                {items.length ? items.map(([t,m])=>(
                  <div key={`${label}-${t}`} className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-white/10 bg-slate-800">
                    <TypeBadge t={t}/><span className="text-xs opacity-80">x{m}</span>
                  </div>
                )) : <em className="opacity-60">—</em>}
              </div>
            );
            return (
              <div className="mt-3 text-sm flex flex-col gap-2">
                <Row label="Weaknesses:" items={[...w4,...w2]}/>
                {showNeutral && <Row label="Neutral:" items={w1}/>}
                {showResists && <Row label="Resists:" items={[...r05,...r0]}/>}
              </div>
            );
          })()}
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
          {!activeTypes?.length ? (
            <p className="text-sm opacity-60">No matches yet.</p>
          ) : (
            <ul className="grid gap-3">
              {picks.map(({ attacker, hitType, mult, score, damagePotential, risk })=>{
                const art = attacker.id ? artFromId(attacker.id) : null;
                return (
                  <li key={attacker.name} className="bg-slate-800 rounded-xl p-4 ring-1 ring-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {art ? <img src={art} alt={attacker.name} className="w-12 h-12 object-contain drop-shadow" /> :
                        <div className="w-12 h-12 rounded-xl bg-slate-700 grid place-items-center text-slate-300 text-sm">{attacker.name[0]}</div>}
                      <div>
                        <div className="font-semibold text-white text-base">{attacker.name}</div>
                        <div className="text-xs flex gap-2 mt-1 flex-wrap items-center">
                          <span className="opacity-70">Types:</span>
                          {attacker.types.map(t => <TypeBadge key={t} t={t}/>)}
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
                            <div className="h-full" style={{ width:`${damagePotential}%`, background:"linear-gradient(90deg,#22c55e,#eab308)" }} />
                          </div>
                        </div>
                        <div>
                          <div className="opacity-70">Incoming damage</div>
                          <div className="w-36 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full" style={{ width:`${risk}%`, background:"linear-gradient(90deg,#60a5fa,#ef4444)" }} />
                          </div>
                        </div>
                      </div>
                      <div className="opacity-60 mt-1">Score {score}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
