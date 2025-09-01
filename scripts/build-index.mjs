// ==========================
// FILE: scripts/build-index.mjs
// ==========================
/* Build a compact dex for the app: types, id, power, strong STABs,
 * and ability tags (normal + hidden when supported).
 * Node 18+ recommended.
 */

const POKE_LIMIT = 20000;
const MOVE_LIMIT = 20000;
const CONCURRENCY = 12;
const STRONG_BP = 70;
const OUT_FILE = 'public/data/index.json';

// Battle-ineligible/ride-mode forms to exclude
const EXCLUDE_SLUGS = new Set([
  // Koraidon ride builds
  'koraidon-limited-build',
  'koraidon-sprinting-build',
  'koraidon-swimming-build',
  'koraidon-gliding-build',
  // Miraidon ride/utility modes
  'miraidon-low-power-mode',
  'miraidon-drive-mode',
  'miraidon-aquatic-mode',
  'miraidon-glide-mode'
]);

// Abilities we model in the UI scoring — keep in sync with ABILITY_EFFECTS in App.jsx
const SUPPORTED_ABILITIES = new Set([
  'drizzle','drought','primordial-sea','desolate-land',
  'sand-stream','snow-warning','orichalcum-pulse','hadron-engine',
  'huge-power','adaptability',
  'levitate','flash-fire','water-absorb','storm-drain','volt-absorb','lightning-rod'
]);

// Certain signature moves sometimes lack BP in older data — force them
const FORCE_STRONG = { 'collision-course': 100, 'electro-drift': 100 };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, tries = 4) {
  let last; for (let i=0;i<tries;i++){ try{ const r = await fetch(url); if(!r.ok) throw new Error(`${r.status}`); return await r.json(); } catch(e){ last=e; await sleep(250*(i+1)); } } throw last; }

function pickAbilityTags(abilities){
  if(!Array.isArray(abilities)) return { normal:null, hidden:null };
  let normal=null, hidden=null;
  for (const a of abilities){
    const name = a?.ability?.name?.toLowerCase();
    if(!name) continue;
    if(a.is_hidden){ if(!hidden && SUPPORTED_ABILITIES.has(name)) hidden = name; }
    else { if(!normal && SUPPORTED_ABILITIES.has(name)) normal = name; }
  }
  // Fallback: if only one total ability and it's supported, use it as normal
  if(!normal && !hidden){
    const only = abilities.length===1 ? abilities[0]?.ability?.name?.toLowerCase() : null;
    if (only && SUPPORTED_ABILITIES.has(only)) normal = only;
  }
  return { normal: normal||null, hidden: hidden||null };
}

function calcPower(stats){
  if(!Array.isArray(stats)) return 80;
  let atk=80, spa=80, sum=0; for(const s of stats){ const n=s?.stat?.name; const b=s?.base_stat??80; sum+=b; if(n==='attack') atk=b; if(n==='special-attack') spa=b; }
  return Math.round(Math.max(atk,spa) + (sum/12));
}
function toTypeName(t){ if(!t) return null; const n=t.toLowerCase(); return n[0].toUpperCase()+n.slice(1); }

async function buildMoveIndex(){
  const list = await getJson(`https://pokeapi.co/api/v2/move?limit=${MOVE_LIMIT}`);
  const out = {}; const all=list.results||[]; let done=0;
  for(let i=0;i<all.length;i+=CONCURRENCY){
    await Promise.all(all.slice(i,i+CONCURRENCY).map(async(m)=>{ try{ const d=await getJson(m.url); const name=d.name.toLowerCase(); const bp=FORCE_STRONG[name] ?? d.power ?? null; out[name]={ type:d.type?.name||null, power:bp }; } catch{} }));
    done+=Math.min(CONCURRENCY, all.length-i); process.stdout.write(`\r • ${done}/${all.length} moves…`);
  }
  process.stdout.write('\n'); return out;
}

function isStrong(mi, want){ if(!mi) return false; if(!mi.type) return false; if(mi.type.toLowerCase()!==want.toLowerCase()) return false; const p=mi.power??0; return (p && p>=STRONG_BP); }

async function buildDex(moveIndex){
  const list = await getJson(`https://pokeapi.co/api/v2/pokemon?limit=${POKE_LIMIT}`);
  const all = list.results || [];
  const out = []; const names=[];

  for(let i=0;i<all.length;i+=CONCURRENCY){
    const batch = await Promise.all(all.slice(i,i+CONCURRENCY).map(async(p)=>{
      try{
        const d = await getJson(p.url); // /pokemon/{slug}
        const species = await getJson(d.species.url);
        const apiSlug = d.name.toLowerCase(); if(EXCLUDE_SLUGS.has(apiSlug)) return null;
        const id = d.id;
        const types=(d.types||[]).sort((a,b)=>a.slot-b.slot).map(t=>toTypeName(t.type.name)).filter(Boolean);

        // Strong STAB types from learnset
        const stabTypes=new Set((types||[]).map(t=>t.toLowerCase()));
        const strong=new Set();
        for(const mv of d.moves||[]){ const mname=(mv.move?.name||'').toLowerCase(); const mi=moveIndex[mname]; if(!mi) continue; if(stabTypes.has(mi.type?.toLowerCase()) && isStrong(mi, mi.type)){ strong.add(toTypeName(mi.type)); } }

        const { normal, hidden } = pickAbilityTags(d.abilities);
        const restricted = !!(species.is_legendary || species.is_mythical);
        const power = calcPower(d.stats);
        const isMega = /-mega/.test(apiSlug) || /-primal/.test(apiSlug);

        return { name: apiSlug, apiSlug, id, types, power, restricted, isMega, strong: Array.from(strong), abilityTag: normal||hidden||null, abilityTags: { normal: normal||null, hidden: hidden||null } };
      } catch { return null; }
    }));

    for(const x of batch){ if(!x) continue; out.push(x); names.push(x.name); }
    process.stdout.write(`\rFetched ${out.length} Pokémon…`);
  }
  process.stdout.write('\n');

  const filtered = out.filter(p => p.types && p.types.length);
  return { pokemon: filtered, names: Array.from(new Set(names)).sort() };
}

(async () => {
  console.log('Building move index…');
  const moveIndex = await buildMoveIndex();
  console.log('Loading Pokémon details…');
  const { pokemon, names } = await buildDex(moveIndex);
  const payload = { version: 2, generatedAt: new Date().toISOString(), count: pokemon.length, names, pokemon };
  const fs = await import('node:fs/promises');
  await fs.mkdir('public/data', { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${OUT_FILE} with ${pokemon.length} entries`);
})().catch(err => { console.error(err); process.exit(1); });
