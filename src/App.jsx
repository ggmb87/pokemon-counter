import React, { useEffect, useMemo, useState, useRef } from "react";

/* ---------- Types & effectiveness ---------- */
const TYPES = [
  "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison","Ground","Flying",
  "Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"
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

function weaknessesOf(defTypes){
  const res = Object.fromEntries(TYPES.map(t=>[t,1]));
  for(const atk of TYPES){
    let mult=1;
    for(const def of defTypes){
      const row = chart[atk]||{};
      mult *= row[def] ?? 1;
    }
    res[atk]=mult;
  }
  return res;
}

/* ---------- Lightweight ability heuristics (always on) ---------- */
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

function applyAbilityToOffense(offense, hitType, mult, attackerTag){
  const eff = ABILITY_EFFECTS[attackerTag];
  if(!eff) return offense;
  let o = offense;
  if(eff.flatOffense) o *= eff.flatOffense;
  if(eff.atkByType && eff.atkByType[hitType]) o *= eff.atkByType[hitType];
  if(eff.stabBoost) o *= eff.stabBoost;
  if(eff.signatureSE && eff.signatureSE.type===hitType && mult>=2) o *= eff.signatureSE.mult;
  return o;
}
function applyAbilityToRisk(riskValue, targetTypes, attackerTag){
  const eff = ABILITY_EFFECTS[attackerTag];
  if(!eff?.riskModsAgainst) return riskValue;
  let r = riskValue;
  for(const t of targetTypes){
    if(eff.riskModsAgainst[t]) r = Math.round(r * eff.riskModsAgainst[t]);
  }
  return r;
}
function cancelIfOpposingWeathers(attackerTag, targetTag, hitType){
  const a = ABILITY_EFFECTS[attackerTag]?.weather;
  const b = ABILITY_EFFECTS[targetTag]?.weather;
  if(!a || !b) return 1;
  if((a==="rain" && b==="sun"  && hitType==="Water") ||
     (a==="sun"  && b==="rain" && hitType==="Fire")){
    const atkBoost = ABILITY_EFFECTS[attackerTag].atkByType?.[hitType] || 1;
    return 1/atkBoost;
  }
  return 1;
}

/* ---------- Helpers ---------- */
const TYPE_COLORS = {
  Normal:"#A8A77A", Fire:"#EE8130", Water:"#6390F0", Electric:"#F7D02C", Grass:"#7AC74C",
  Ice:"#96D9D6", Fighting:"#C22E28", Poison:"#A33EA1", Ground:"#E2BF65", Flying:"#A98FF3",
  Psychic:"#F95587", Bug:"#A6B91A", Rock:"#B6A136", Ghost:"#735797", Dragon:"#6F35FC",
  Dark:"#705746", Steel:"#B7B7CE", Fairy:"#D685AD",
};

function TypeBadge({t}){
  return (
    <span
      className="px-2 py-0.5 rounded-md text-xs font-semibold border border-white/10 shadow-sm text-slate-900"
      style={{backgroundColor: TYPE_COLORS[t] || "#ccc"}}
    >{t}</span>
  );
}
function Card({title, children, right, dark=true}){
  return (
    <div className={`rounded-2xl shadow-lg p-4 ring-1 ${dark?'bg-slate-800/60 ring-white/10':'bg-white ring-slate-900/10'}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-2">
          {title ? <h3 className="text-lg font-bold">{title}</h3> : <div/>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
const artFromId = id => id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` : null;
const nameToSlug = s => (s||"").toLowerCase().replace(/[^a-z0-9- ()]/g,"").trim().replace(/[()]/g,"").replace(/ +/g,"-");

/* ---------- Ranking ---------- */
function rankCounters(
  targetTypes,
  { allowRestricted=true, showMega=true, targetAbilityTag=null } = {},
  dexPool
){
  if(!targetTypes?.length) return { weaknesses:{}, picks:[] };
  const weaknesses = weaknessesOf(targetTypes);
  const weakTypes = Object.entries(weaknesses).filter(([,m])=>m>=2).sort((a,b)=>b[1]-a[1]);

  const pool = (dexPool||[]).filter(p => (allowRestricted || !p.restricted) && (showMega || !p.isMega));

  const picks = pool.map(attacker=>{
    const strong = attacker.strong?.find(t => (weaknesses[t]??1) >= 2);
    if(!strong) return null;
    const mult = weaknesses[strong];

    // incoming risk: worst STAB from the target into attacker's types
    const incoming = targetTypes.map(stab => attacker.types.reduce((m,def)=>m*((chart[stab]?.[def]??1)),1));
    const worstIncoming = Math.max(...incoming);

    let offense = mult * ((attacker.power||90)/100);
    let riskVal = worstIncoming >= 4 ? 100
                 : worstIncoming >= 2 ? 75
                 : worstIncoming <= .5 ? 25 : 50;

    // ability ALWAYS on
    const tag = attacker.abilityTag;
    if(tag){
      offense = applyAbilityToOffense(offense, strong, mult, tag);
      if(targetAbilityTag){
        offense *= cancelIfOpposingWeathers(tag, targetAbilityTag, strong);
        const negate = ABILITY_EFFECTS[targetAbilityTag]?.negateTypes || [];
        if(negate.includes(strong)){ offense *= 0.6; riskVal *= 1.2; }
      }
      riskVal = applyAbilityToRisk(riskVal, targetTypes, tag);
    }

    const survBonus = worstIncoming <= .5 ? .15 : worstIncoming === 1 ? .05 : 0;
    const score = Number((offense + survBonus).toFixed(3));
    const damagePotential = Math.min(100, Math.round(offense*50));
    const risk = Math.max(0, Math.min(100, Math.round(riskVal)));

    return { attacker, hitType: strong, mult, score, damagePotential, risk };
  }).filter(Boolean).sort((a,b)=>b.score-a.score);

  return { weaknesses:Object.fromEntries(weakTypes), picks };
}

/* ---------- Component ---------- */
export default function App(){
  const [query,setQuery] = useState("");
  const [fullDex,setFullDex] = useState(null);
  const [nameList,setNameList] = useState([]);
  const [mode,setMode] = useState("pokemon");
  const [pickedTypes,setPickedTypes] = useState([]);
  const [allowRestricted,setAllowRestricted] = useState(true);
  const [showMega,setShowMega] = useState(true);
  const [showNeutral,setShowNeutral] = useState(false);
  const [showResists,setShowResists] = useState(false);

  // Hidden ability toggle
  const [useHiddenAbility,setUseHiddenAbility] = useState(false);

  // Target basics
  const [target,setTarget] = useState({ name:"", types:[], sprite:null });

  // load our local compiled index (names + full dex)
  useEffect(()=>{
    fetch("/data/index.json")
      .then(r=>r.ok?r.json():Promise.reject())
      .then(j=>{
        if(Array.isArray(j?.pokemon)) setFullDex(j.pokemon);
        if(Array.isArray(j?.names)) setNameList(j.names);
      })
      .catch(()=>{ /* ignore */ });
  },[]);

  // fallback names (best effort)
  useEffect(()=>{
    if(nameList.length) return;
    fetch("https://pokeapi.co/api/v2/pokemon-species?limit=2000")
      .then(r=>r.ok?r.json():Promise.reject())
      .then(d=>{
        const names = (d?.results||[]).map(x=>x.name);
        if(names.length) setNameList(names);
      })
      .catch(()=>{});
  },[nameList.length]);

  const suggestions = useMemo(()=>{
    const q = (query||"").toLowerCase();
    return (nameList||[])
      .filter(n => !q || n.toLowerCase().startsWith(q) || n.toLowerCase().includes(q))
      .sort((a,b)=>{
        const A=a.toLowerCase(), B=b.toLowerCase();
        const aw=A.startsWith(q)?0:1, bw=B.startsWith(q)?0:1;
        return aw-bw || a.localeCompare(b);
      })
      .slice(0,8);
  },[nameList,query]);

  // fetch target (pokemon tab)
  const fetchIdRef = useRef(0);
  useEffect(()=>{
    if(mode!=='pokemon') return;
    const slug = nameToSlug(query);
    if(!slug) return;

    const req = ++fetchIdRef.current;
    const controller = new AbortController();
    const timer = setTimeout(()=>{
      fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, { signal: controller.signal })
        .then(r=>r.ok?r.json():Promise.reject(new Error("not found")))
        .then(d=>{
          if(req!==fetchIdRef.current) return;
          const sprite =
            d?.sprites?.other?.["official-artwork"]?.front_default ||
            d?.sprites?.front_default || null;
          const types = (d?.types||[]).map(x=>x.type.name).map(t=>t[0].toUpperCase()+t.slice(1));
          setTarget({ name:d?.name||slug, types, sprite });
        })
        .catch(err=>{
          if(req!==fetchIdRef.current) return;
          if(err?.name==="AbortError") return;
          setTarget({ name: query, types:[], sprite: null });
        });
    },150);

    return ()=>{ clearTimeout(timer); controller.abort(); };
  },[query,mode]);

  // resolve target ability tag (normal vs hidden)
  const { targetAbilityTag, targetHasHidden, displayName } = useMemo(()=>{
    const displayName = mode==='pokemon'
      ? (target?.name ? target.name : query)
      : (pickedTypes.length ? pickedTypes.join(" / ") : "");

    if(!fullDex || !target?.name) return { targetAbilityTag:null, targetHasHidden:false, displayName };

    const key = (target.name||"").toLowerCase();
    const entry = fullDex.find(p => (p.name||"").toLowerCase() === key);
    const normal = entry?.abilityTag || null;
    const hidden = entry?.hiddenAbilityTag || null;
    const tag = useHiddenAbility && hidden ? hidden : normal;

    return { targetAbilityTag: tag, targetHasHidden: !!hidden && hidden!==normal, displayName };
  },[fullDex, target?.name, pickedTypes, mode, query, useHiddenAbility]);

  // compute weaknesses & picks
  const activeTypes = mode==='pokemon' ? target.types : pickedTypes;
  const { weaknesses, picks } = useMemo(()=>{
    return rankCounters(
      activeTypes,
      { allowRestricted, showMega, targetAbilityTag },
      fullDex || []
    );
  },[activeTypes, allowRestricted, showMega, fullDex, targetAbilityTag]);

  // split map for UI
  const fullMap = useMemo(()=>weaknessesOf(activeTypes),[activeTypes]);
  const [w4,w2,w1,r05,r0] = useMemo(()=>{
    const a4=[],a2=[],a1=[],a05=[],a0=[];
    Object.entries(fullMap).forEach(([t,m])=>{
      if(m===4) a4.push([t,m]);
      else if(m===2) a2.push([t,m]);
      else if(m===1) a1.push([t,m]);
      else if(m===0.5) a05.push([t,m]);
      else if(m===0) a0.push([t,m]);
    });
    return [a4,a2,a1,a05,a0];
  },[fullMap]);

  // show-more
  const [visibleCount,setVisibleCount] = useState(10);
  useEffect(()=>{ setVisibleCount(10); },[query,allowRestricted,showMega,mode,pickedTypes,useHiddenAbility]);

  // sprite fallback fetch (if local index doesn’t provide)
  const [sprites,setSprites] = useState({});
  useEffect(()=>{
    picks.forEach(({attacker})=>{
      if(attacker.sprite || attacker.id) return; // already have art
      const slug = attacker.apiSlug || nameToSlug(attacker.name);
      if(!sprites[slug]){
        fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`)
          .then(r=>r.ok?r.json():Promise.reject())
          .then(d=>{
            const url = d?.sprites?.other?.["official-artwork"]?.front_default || d?.sprites?.front_default || null;
            if(url) setSprites(prev=>({...prev,[slug]:url}));
          })
          .catch(()=>{});
      }
    });
  },[picks, sprites]);

  /* ---------- Render ---------- */
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
              <button onClick={()=>setMode('pokemon')}
                      className={`px-3 py-1.5 text-sm rounded-l-lg ${mode==='pokemon'?'bg-slate-700 text-white':'opacity-80'}`}>
                Pokémon
              </button>
              <button onClick={()=>setMode('types')}
                      className={`px-3 py-1.5 text-sm rounded-r-lg ${mode==='types'?'bg-slate-700 text-white':'opacity-80'}`}>
                Types
              </button>
            </div>
          </div>

          {mode==='pokemon' ? (
            <AutoCompleteInput
              value={query}
              onChange={setQuery}
              suggestions={suggestions}
              placeholder="e.g., Charizard"
            />
          ) : (
            <TypePicker picked={pickedTypes} onChange={setPickedTypes} />
          )}
        </Card>

        {/* Target */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {(mode==='pokemon' && target.sprite)
                ? <img src={target.sprite} alt={displayName} className="w-20 h-20 object-contain drop-shadow" />
                : <div className="w-20 h-20 rounded-xl bg-slate-700 grid place-items-center text-slate-300 text-sm">
                    {(mode==='pokemon' ? (target.name||"?")[0] : (pickedTypes[0]||"?")[0])}
                  </div>}
              <div>
                <div className="font-semibold text-white text-base">
                  {displayName || "Unknown"}
                </div>
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
                       disabled={!targetHasHidden}/>
                Hidden Ability
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500"
                       checked={showNeutral} onChange={e=>setShowNeutral(e.target.checked)} />
                Show Neutral
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500"
                       checked={showResists} onChange={e=>setShowResists(e.target.checked)} />
                Show Resists
              </label>
            </div>
          </div>

          {/* Weakness/Neutral/Resists rows */}
          <WeaknessRows
            activeTypes={activeTypes}
            w4={w4} w2={w2} w1={w1} r05={r05} r0={r0}
            showNeutral={showNeutral}
            showResists={showResists}
          />
        </Card>

        {/* Counters */}
        <Card
          title="Suggested counters"
          right={
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500"
                       checked={showMega} onChange={e=>setShowMega(e.target.checked)} />
                Show Mega forms
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500"
                       checked={allowRestricted} onChange={e=>setAllowRestricted(e.target.checked)} />
                Allow restricted legendaries
              </label>
            </div>
          }
        >
          <CounterList
            picks={picks}
            visibleCount={10}
            onLoadMore={()=>setVisibleCount(c=>c+10)}
            extraSprites={sprites}
          />
        </Card>

        <Card title="Assumptions (simple mode)">
          <ul className="list-disc ml-5 text-sm leading-6 opacity-90">
            <li>Abilities are applied automatically (weather/engines/major pulses, Huge Power, Adaptability, etc.).</li>
            <li>Toggle between normal and hidden ability for the target when it has one.</li>
            <li>No items, EVs, or Tera; quick heuristics only.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Small subcomponents ---------- */
function AutoCompleteInput({ value, onChange, suggestions, placeholder }){
  const [open,setOpen] = useState(false);
  const [hi,setHi] = useState(0);

  const commit = (s)=>{
    onChange(s);
    setOpen(false);
    setHi(0);
  };

  return (
    <div className="relative">
      <input
        className="w-full p-3 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring focus:ring-indigo-500"
        value={value}
        placeholder={placeholder}
        onChange={e=>{ onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={()=>setOpen(true)}
        onKeyDown={e=>{
          if(!suggestions?.length) return;
          if(e.key==="ArrowDown"){ e.preventDefault(); setHi((hi+1)%suggestions.length); }
          else if(e.key==="ArrowUp"){ e.preventDefault(); setHi((hi-1+suggestions.length)%suggestions.length); }
          else if(e.key==="Enter" || e.key==="Tab"){ e.preventDefault(); commit(suggestions[hi] ?? suggestions[0]); }
          else if(e.key==="Escape"){ e.preventDefault(); setOpen(false); }
        }}
        onBlur={()=> setTimeout(()=>setOpen(false), 120)}
      />
      {open && suggestions?.length>0 && (
        <ul className="absolute left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl shadow-xl max-h-60 overflow-auto z-10">
          {suggestions.map((n,i)=>(
            <li key={n}
                className={`px-3 py-2 cursor-pointer ${i===hi?'bg-slate-700':'hover:bg-slate-700/60'}`}
                onMouseDown={()=>commit(n)}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypePicker({ picked, onChange }){
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {TYPES.map(t=>{
          const selected = picked.includes(t);
          return (
            <button key={t}
              onClick={()=> onChange(prev => prev.includes(t) ? prev.filter(x=>x!==t) : (prev.length>=2 ? [prev[1],t] : [...prev,t]))}
              className={`flex items-center justify-center gap-2 px-2 py-2 rounded-xl border bg-slate-800/60 border-white/10 ${selected?'ring-2 ring-indigo-500':''}`}>
              <TypeBadge t={t}/>
            </button>
          );
        })}
      </div>
      <div className="text-xs opacity-70 mt-2">Pick up to 2 types.</div>
    </>
  );
}

function WeaknessRows({activeTypes,w4,w2,w1,r05,r0,showNeutral,showResists}){
  const Row = ({label, list})=>(
    <div className="relative flex items-start gap-2 flex-wrap pl-28">
      <div className="absolute left-0 top-0 font-semibold text-white text-base">{label}</div>
      {activeTypes?.length ? (list.length ? list.map(([t,m])=>(
        <div key={`${label}-${t}`} className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-white/10 bg-slate-800">
          <TypeBadge t={t}/> <span className="text-xs opacity-80">x{m}</span>
        </div>
      )) : <em className="opacity-60">—</em>) : <em className="opacity-60">—</em>}
    </div>
  );
  return (
    <div className="mt-3 text-sm flex flex-col gap-2">
      <Row label="Weaknesses:" list={[...w4,...w2]} />
      {showNeutral && <Row label="Neutral:" list={w1} />}
      {showResists && <Row label="Resists:" list={[...r05,...r0]} />}
    </div>
  );
}

function CounterList({ picks, visibleCount=10, onLoadMore, extraSprites }){
  if(!picks?.length) return <p className="text-sm opacity-60">No matches yet.</p>;
  return (
    <>
      <ul className="grid gap-3">
        {picks.slice(0,visibleCount).map(({attacker,hitType,mult,score,damagePotential,risk})=>{
          const slug = attacker.apiSlug || nameToSlug(attacker.name);
          const url = attacker.sprite || (attacker.id ? artFromId(attacker.id) : extraSprites?.[slug]);
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
                    {attacker.types.map(t=> <TypeBadge key={t} t={t}/>)}
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
                      <div className="h-full" style={{width:`${damagePotential}%`, background:"linear-gradient(90deg,#22c55e,#eab308)"}}/>
                    </div>
                  </div>
                  <div>
                    <div className="opacity-70">Incoming damage</div>
                    <div className="w-36 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full" style={{width:`${risk}%`, background:"linear-gradient(90deg,#60a5fa,#ef4444)"}}/>
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
          <button onClick={onLoadMore} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm border border-white/10">
            Show 10 more
          </button>
        </div>
      )}
    </>
  );
}
