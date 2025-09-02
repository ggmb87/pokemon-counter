import React, { useEffect, useMemo, useRef, useState } from "react";

// ---------------- Types + Chart ----------------
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

const weaknessTable = (defTypes) => {
  const out = Object.fromEntries(TYPES.map(t => [t,1]));
  for (const atk of TYPES) {
    let m = 1;
    for (const d of defTypes) m *= (chart[atk]?.[d] ?? 1);
    out[atk] = m;
  }
  return out;
};

// ---------------- Ability heuristics -----------
const ABILITY = {
  "drizzle": { atkByType:{Water:1.5}, riskVs:{Fire:0.8}, weather:"rain" },
  "drought": { atkByType:{Fire:1.5},  riskVs:{Water:0.8}, weather:"sun"  },
  "primordial-sea": { atkByType:{Water:1.6}, negate:["Fire"], weather:"rain" },
  "desolate-land":  { atkByType:{Fire:1.6},  negate:["Water"], weather:"sun"  },
  "sand-stream": { bulk:+0.10 },
  "snow-warning": { bulk:+0.05 },
  "orichalcum-pulse": { flat:1.3, atkByType:{Fighting:1.0}, sig:{type:"Fighting", mult:1.33}, weather:"sun" },
  "hadron-engine":    { flat:1.3, atkByType:{Electric:1.3}, sig:{type:"Electric", mult:1.33}, terrain:"electric" },
  "huge-power": { flat:1.5 },
  "pure-power": { flat:1.5 },
  "adaptability": { stab:1.33 }
};

const applyAbilityOffense = (base, hitType, mult, tag) => {
  const e = ABILITY[tag]; if (!e) return base;
  let v = base;
  if (e.flat) v *= e.flat;
  if (e.atkByType?.[hitType]) v *= e.atkByType[hitType];
  if (e.stab) v *= e.stab;
  if (e.sig && e.sig.type === hitType && mult >= 2) v *= e.sig.mult;
  return v;
};
const applyAbilityRisk = (risk, targetTypes, tag) => {
  const e = ABILITY[tag]; if (!e?.riskVs) return risk;
  let r = risk; for (const t of targetTypes) if (e.riskVs[t]) r *= e.riskVs[t];
  return r;
};
const cancelOpposingWeather = (atkTag, tgtTag, hitType) => {
  const a = ABILITY[atkTag]?.weather, b = ABILITY[tgtTag]?.weather;
  if (!a || !b) return 1;
  if (a==="rain" && b==="sun" && hitType==="Water") return 1/(ABILITY[atkTag]?.atkByType?.Water||1);
  if (a==="sun"  && b==="rain"&& hitType==="Fire")  return 1/(ABILITY[atkTag]?.atkByType?.Fire ||1);
  return 1;
};

// ---------------- UI helpers ------------------
const TYPE_COLORS = {
  Normal:"#A8A77A", Fire:"#EE8130", Water:"#6390F0", Electric:"#F7D02C", Grass:"#7AC74C",
  Ice:"#96D9D6", Fighting:"#C22E28", Poison:"#A33EA1", Ground:"#E2BF65", Flying:"#A98FF3",
  Psychic:"#F95587", Bug:"#A6B91A", Rock:"#B6A136", Ghost:"#735797", Dragon:"#6F35FC",
  Dark:"#705746", Steel:"#B7B7CE", Fairy:"#D685AD"
};
const TypeBadge = ({t}) => (
  <span className="px-2 py-0.5 rounded-md text-xs font-semibold border border-white/10 shadow-sm text-slate-900"
        style={{backgroundColor:TYPE_COLORS[t]||"#ccc"}}>{t}</span>
);
const Card = ({title, right, children}) => (
  <div className="rounded-2xl shadow-lg p-4 ring-1 bg-slate-800/60 ring-white/10">
    {(title||right) && (
      <div className="flex items-center justify-between mb-2">
        {title ? <h3 className="text-lg font-bold text-white">{title}</h3> : <div/>}
        {right}
      </div>
    )}
    {children}
  </div>
);

// ---------------- Utils -----------------------
const artFromId = (id)=> id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` : null;
const slugify = s => (s||'').toLowerCase().replace(/[^a-z0-9- ]/g,'').trim().replace(/ +/g,'-');

// ---------------- Ranking ---------------------
function rankCounters(targetTypes, options, dexPool) {
  if (!targetTypes?.length) return { weaknesses:{}, picks:[] };
  const { allowRestricted, showMega, onlyFinal, useAbilities, targetAbilityTag } = options;

  const w = weaknessTable(targetTypes);
  const pool = dexPool.filter(p =>
    (allowRestricted || !p.restricted) &&
    (showMega || !p.isMega) &&
    (!onlyFinal || p.isFinal)
  );

  const picks = [];
  for (const mon of pool) {
    const strongArr = mon.learnedStrong?.length ? mon.learnedStrong : mon.strong; // fallback for demo list
    if (!strongArr?.length) continue;

    // pick the strongest weakness type this mon can hit
    let best = null;
    for (const t of strongArr) {
      const mult = w[t] ?? 1;
      if (mult >= 2) {
        if (!best || mult > best.mult) best = { type:t, mult };
      }
    }
    if (!best) continue;

    // incoming risk: worst of target STAB vs mon's types
    const incomingMult = Math.max(
      ...targetTypes.map(st =>
        mon.types.reduce((m,def)=> m*(chart[st]?.[def] ?? 1), 1)
      )
    );

    // offensive base: weakness * normalized offense
    const offenseNorm = (mon.offense ?? mon.power ?? 80) / 135; // 135 ~ top Atk/SpA
    // NFE penalty
    const nfe = mon.isFinal ? 1.0 : (mon.stage >= 1 ? 0.80 : 0.65);

    let offense = best.mult * offenseNorm * nfe;

    // ability heuristics
    if (useAbilities && mon.abilityTagNormal) {
      offense = applyAbilityOffense(offense, best.type, best.mult, mon.abilityTagNormal);
      if (targetAbilityTag) {
        offense *= cancelOpposingWeather(mon.abilityTagNormal, targetAbilityTag, best.type);
        const neg = ABILITY[targetAbilityTag]?.negate || [];
        if (neg.includes(best.type)) offense *= 0.6;
      }
    }

    let riskVal = incomingMult >= 4 ? 90 :
                  incomingMult >= 2 ? 70 :
                  incomingMult <= 0.5 ? 25 : 50;
    if (useAbilities && mon.abilityTagNormal) {
      riskVal = applyAbilityRisk(riskVal, targetTypes, mon.abilityTagNormal);
    }
    const survBonus = incomingMult <= 0.5 ? 0.15 : incomingMult === 1 ? 0.05 : 0;

    const score = Number((offense + survBonus).toFixed(3));
    const damagePotential = Math.min(100, Math.round(offense * 55));
    const risk = Math.max(0, Math.min(100, Math.round(riskVal)));

    picks.push({
      attacker: mon,
      hitType: best.type,
      mult: best.mult,
      score,
      damagePotential,
      risk
    });
  }

  picks.sort((a,b)=> b.score - a.score);
  const weak = Object.fromEntries(Object.entries(w).filter(([,m])=>m>=2).sort((a,b)=>b[1]-a[1]));
  return { weaknesses: weak, picks };
}

// ===================================================

export default function App() {
  // search mode
  const [mode, setMode] = useState('pokemon');
  const [query, setQuery] = useState('');
  const [pickedTypes, setPickedTypes] = useState([]);

  // toggles
  const [allowRestricted, setAllowRestricted] = useState(true);
  const [showMega, setShowMega] = useState(true);
  const [onlyFinal, setOnlyFinal] = useState(false);
  const [showNeutral, setShowNeutral] = useState(false);
  const [showResists, setShowResists] = useState(false);
  const [useAbilities, setUseAbilities] = useState(true);
  const [useHidden, setUseHidden] = useState(false); // target Hidden Ability toggle

  // data
  const [dex, setDex] = useState(null);
  const [names, setNames] = useState([]);

  useEffect(() => {
    fetch('/data/index.json')
      .then(r=> r.ok ? r.json() : Promise.reject())
      .then(j => {
        setDex(j.pokemon || null);
        setNames(j.names || []);
      })
      .catch(()=>{});
  }, []);

  // autocomplete
  const [openSug, setOpenSug] = useState(false);
  const [hi, setHi] = useState(0);
  const suggestions = useMemo(() => {
    const q = query.toLowerCase();
    return names
      .filter(n => !q || n.toLowerCase().startsWith(q) || n.toLowerCase().includes(q))
      .sort((a,b) => {
        const aw = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bw = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aw - bw || a.localeCompare(b);
      })
      .slice(0, 10);
  }, [names, query]);

  // fetch target (live from PokeAPI for sprite & raw typing)
  const [target, setTarget] = useState({ name:'', types:[], id:null });
  const fetchIdRef = useRef(0);
  useEffect(()=> {
    if (mode !== 'pokemon') return;
    const slug = slugify(query);
    if (!slug) return;
    const id = ++fetchIdRef.current;
    const ctrl = new AbortController();

    const go = () => fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (id !== fetchIdRef.current) return;
        setTarget({
          name: d.name,
          types: d.types.map(t => typeCap(t.type.name)),
          id: d.id
        });
      })
      .catch(()=> { if (id===fetchIdRef.current) setTarget({ name: query, types: [], id:null }); });

    const t = setTimeout(go, 120);
    return ()=> { clearTimeout(t); ctrl.abort(); };
  }, [query, mode]);

  // target ability tag (normal/hidden via toggle)
  const targetAbilityTag = useMemo(() => {
    if (!dex || !target?.name) return null;
    const hit = dex.find(p => (p.slug === slugify(target.name)) || (p.name.toLowerCase() === target.name.toLowerCase()));
    if (!hit) return null;
    return (useHidden ? hit.abilityTagHidden : hit.abilityTagNormal) || null;
  }, [dex, target?.name, useHidden]);

  // compute weaknesses and counters
  const activeTypes = mode==='pokemon' ? target.types : pickedTypes;
  const { weaknesses, picks } = useMemo(() => {
    const pool = dex ?? []; // when null, no global pool
    return rankCounters(
      activeTypes,
      { allowRestricted, showMega, onlyFinal, useAbilities, targetAbilityTag },
      pool
    );
  }, [activeTypes, dex, allowRestricted, showMega, onlyFinal, useAbilities, targetAbilityTag]);

  // maps for Weak/Neutral/Resist rows
  const fullMap = useMemo(()=> weaknessTable(activeTypes), [activeTypes]);
  const buckets = useMemo(()=>{
    const a4=[],a2=[],a1=[],a05=[],a0=[];
    Object.entries(fullMap).forEach(([t,m])=>{
      if (m===4) a4.push([t,m]);
      else if (m===2) a2.push([t,m]);
      else if (m===1) a1.push([t,m]);
      else if (m===0.5) a05.push([t,m]);
      else if (m===0) a0.push([t,m]);
    });
    return {a4,a2,a1,a05,a0};
  }, [fullMap]);

  // show-more
  const [visibleCount, setVisible] = useState(12);
  useEffect(()=> setVisible(12), [query, allowRestricted, showMega, onlyFinal, useAbilities, useHidden, pickedTypes, mode]);

  // ---- UI ----
  const displayName = mode==='pokemon'
    ? (query ? query : '—')
    : (pickedTypes.length ? pickedTypes.join(' / ') : '—');

  const commit = (name) => { setQuery(name); setOpenSug(false); setHi(0); };

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
            <div className="relative">
              <input
                className="w-full p-3 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring focus:ring-indigo-500"
                value={query}
                placeholder="e.g., Charizard"
                onChange={e=>{ setQuery(e.target.value); setOpenSug(true); setHi(0); }}
                onFocus={()=> setOpenSug(true)}
                onKeyDown={(e)=>{
                  if (!openSug || suggestions.length===0) return;
                  if (e.key==='ArrowDown'){ e.preventDefault(); setHi((hi+1)%suggestions.length); }
                  else if (e.key==='ArrowUp'){ e.preventDefault(); setHi((hi-1+suggestions.length)%suggestions.length); }
                  else if (e.key==='Enter' || e.key==='Tab'){ e.preventDefault(); commit(suggestions[hi] ?? suggestions[0]); }
                  else if (e.key==='Escape'){ setOpenSug(false); }
                }}
                onBlur={()=> setTimeout(()=> setOpenSug(false), 120)}
              />
              {openSug && suggestions.length>0 && (
                <ul className="absolute left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl shadow-xl max-h-72 overflow-auto z-10">
                  {suggestions.map((n,i)=>(
                    <li key={n}
                        className={`px-3 py-2 cursor-pointer ${i===hi?'bg-slate-700':'hover:bg-slate-700/60'}`}
                        onMouseDown={()=> commit(n)}>
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {TYPES.map(t=>{
                  const sel = pickedTypes.includes(t);
                  return (
                    <button key={t}
                      onClick={()=>{
                        setPickedTypes(prev => prev.includes(t)
                          ? prev.filter(x=>x!==t)
                          : (prev.length>=2 ? [prev[1],t] : [...prev,t]));
                      }}
                      className={`flex items-center justify-center gap-2 px-2 py-2 rounded-xl border bg-slate-800/60 border-white/10 ${sel?'ring-2 ring-indigo-500':''}`}>
                      <TypeBadge t={t}/>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs opacity-70 mt-2">Pick up to 2 types.</div>
            </>
          )}
        </Card>

        {/* Target card */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {target?.id ? (
                <img src={artFromId(target.id)} alt={displayName} className="w-20 h-20 object-contain drop-shadow"/>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-slate-700 grid place-items-center text-slate-300 text-sm">
                  {displayName?.[0] || "?"}
                </div>
              )}
              <div>
                <div className="font-semibold text-white text-base">{displayName}</div>
                <div className="mt-2 text-sm flex gap-2 flex-wrap items-center">
                  <span className="opacity-70">Types:</span>
                  {activeTypes?.length ? activeTypes.map(t => <TypeBadge key={t} t={t}/>) : <em className="opacity-60">unknown</em>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500" checked={useHidden} onChange={e=>setUseHidden(e.target.checked)}/>
                Hidden Ability
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500" checked={showNeutral} onChange={e=>setShowNeutral(e.target.checked)}/>
                Show Neutral
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="accent-indigo-500" checked={showResists} onChange={e=>setShowResists(e.target.checked)}/>
                Show Resists
              </label>
            </div>
          </div>

          {/* Weakness/Neutral/Resists */}
          <div className="mt-3 text-sm flex flex-col gap-2">
            {/* weaknesses: x4 + x2 */}
            <Row title="Weaknesses:">
              {[...Object.entries(weaknesses)]
                .map(([t,m])=>({t, m}))
                .sort((a,b)=> b.m-a.m)
                .map(({t,m})=> <Chip key={t} t={t} m={m}/>)
              }
            </Row>

            {showNeutral && (
              <Row title="Neutral:">
                {Object.entries(weaknessTable(activeTypes))
                  .filter(([,m])=>m===1)
                  .map(([t,m])=> <Chip key={t} t={t} m={m}/>)
                }
              </Row>
            )}

            {showResists && (
              <Row title="Resists:">
                {Object.entries(weaknessTable(activeTypes))
                  .filter(([,m])=>m===0.5 || m===0)
                  .sort((a,b)=> a[1]-b[1])
                  .map(([t,m])=> <Chip key={t} t={t} m={m}/>)
                }
              </Row>
            )}
          </div>
        </Card>

        {/* Counters */}
        <Card title="Suggested counters" right={
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" className="accent-indigo-500"
                     checked={showMega} onChange={e=>setShowMega(e.target.checked)}/>
              Show Mega forms
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" className="accent-indigo-500"
                     checked={allowRestricted} onChange={e=>setAllowRestricted(e.target.checked)}/>
              Allow restricted legendaries
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" className="accent-indigo-500"
                     checked={onlyFinal} onChange={e=>setOnlyFinal(e.target.checked)}/>
              Only fully evolved
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" className="accent-indigo-500"
                     checked={useAbilities} onChange={e=>setUseAbilities(e.target.checked)}/>
              Use ability heuristics (beta)
            </label>
          </div>
        }>
          {picks.length ? (
            <>
              <ul className="grid gap-3">
                {picks.slice(0,visibleCount).map(({ attacker, hitType, mult, score, damagePotential, risk })=>{
                  const sprite = artFromId(attacker.id);
                  return (
                    <li key={attacker.slug || attacker.name}
                        className="bg-slate-800 rounded-xl p-4 ring-1 ring-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {sprite ? (
                          <img src={sprite} alt={attacker.name} className="w-12 h-12 object-contain drop-shadow"/>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-700 grid place-items-center text-slate-300 text-sm">
                            {(attacker.name||'?')[0]}
                          </div>
                        )}
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
                          <Bar label="Damage potential" value={damagePotential} grad="linear-gradient(90deg,#22c55e,#eab308)"/>
                          <Bar label="Incoming damage" value={risk} grad="linear-gradient(90deg,#60a5fa,#ef4444)"/>
                        </div>
                        <div className="opacity-60 mt-1">Score {score}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {picks.length>visibleCount && (
                <div className="mt-3 flex justify-center">
                  <button onClick={()=>setVisible(c=>c+10)}
                          className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm border border-white/10">
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
            <li>We consider **real learned** ≥70 BP STAB moves only.</li>
            <li>NFEs get penalties (baby 0.65, mid 0.80, final 1.00). Toggle “Only fully evolved” to hide NFEs.</li>
            <li>Ability heuristics are simplified (weather/engines/pulses/adaptability/huge power). Target can toggle Hidden Ability.</li>
            <li>No EVs, items, or full turn-by-turn calc; this is a fast heuristic.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

// small UI bits
const Row = ({title, children}) => (
  <div className="relative flex items-start gap-2 flex-wrap pl-28">
    <div className="absolute left-0 top-0 font-semibold text-white text-base">{title}</div>
    {children}
  </div>
);
const Chip = ({t,m}) => (
  <div className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-white/10 bg-slate-800">
    <TypeBadge t={t}/> <span className="text-xs opacity-80">x{m}</span>
  </div>
);
const Bar = ({label, value, grad}) => (
  <div>
    <div className="opacity-70">{label}</div>
    <div className="w-36 h-2 bg-slate-700 rounded-full overflow-hidden">
      <div className="h-full" style={{width:`${value}%`, background:grad}}/>
    </div>
  </div>
);
