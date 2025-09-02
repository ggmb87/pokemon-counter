// node scripts/build-index.mjs
// Builds public/data/index.json with:
// - every Pokémon form (clean display names)
// - types, id, isMega, restricted
// - offense (max Atk/SpA), stage + isFinal
// - learnedStrong: array of types where the mon learns ≥70 BP STAB
// - abilityTagNormal / abilityTagHidden (for small set of impactful abilities)
// - names[] for autocomplete (pretty names)
// Excludes ride/mission-only forms (koraidon/miraidon modes, etc.)

import fs from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';

// --- helpers ---
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
const getJson = async (url) => {
  for (let i=0;i<3;i++){
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch(e){
      if (i===2) throw e;
      await sleep(200+i*250);
    }
  }
};

const typeCap = s => s[0].toUpperCase()+s.slice(1);
const toSlug = s => (s||'').toLowerCase().replace(/[^a-z0-9- ]/g,'').trim().replace(/ +/g,'-');

const ABILITY_MAP = new Map(
  [
    'drizzle','drought','primordial-sea','desolate-land','sand-stream','snow-warning',
    'orichalcum-pulse','hadron-engine','huge-power','pure-power','adaptability'
  ].map(x=>[x,x])
);

// quick restricted definition (mythical/legendary/paradox/box/primals, etc.)
const isRestricted = (species) =>
  !!(species.is_legendary || species.is_mythical || /paradox|ultra beast/i.test(species.generation?.name||'')); // simple heuristic

// forms we do NOT want in the index
const EXCLUDE_NAME_PARTS = [
  'aquatic-mode','glide-mode','sprinting-build','swimming-build','limited-build','gliding-build'
];

// pretty “Name (Form)” builder
function prettyNameFromPokemon(p) {
  const base = p.species.name;
  const raw = p.name;
  let form = raw.replace(base, '').replace(/^-/, '');
  if (!form) return cap(base);

  // normalize popular forms
  form = form
    .replace(/-mega-x$/,' (Mega X)')
    .replace(/-mega-y$/,' (Mega Y)')
    .replace(/-mega$/,' (Mega)')
    .replace(/-primal$/,' (Primal)')
    .replace(/-alola$/,' (Alolan)')
    .replace(/-hisui$/,' (Hisuian)')
    .replace(/-galar$/,' (Galarian)')
    .replace(/-paldea$/,' (Paldean)');

  if (!/[()]/.test(form)) form = ` (${capWords(form.replace(/-/g,' '))})`;
  return `${cap(base)}${form}`;
}
const cap = s => s ? s[0].toUpperCase()+s.slice(1) : s;
const capWords = s => s.split(' ').map(cap).join(' ');

// evolution stage (0/1/2…) and isFinal
async function getStageInfo(species) {
  const chain = await getJson(species.evolution_chain.url);
  // walk chain and locate this species, then see if it has evolves_to
  const findNode = (node, depth=0) => {
    if (node.species.name === species.name) {
      return { depth, isFinal: (node.evolves_to||[]).length===0 };
    }
    for (const child of node.evolves_to || []) {
      const f = findNode(child, depth+1);
      if (f) return f;
    }
    return null;
  };
  const res = findNode(chain.chain, 0);
  return res || { depth: species.evolves_from_species ? 1 : 0, isFinal: true };
}

// --- move index (type + power) ---
async function buildMoveIndex() {
  // 900+ moves; get all pages
  let url = `${API}/move?limit=2000`;
  const idx = new Map();
  while (url) {
    const page = await getJson(url);
    for (const m of page.results) {
      const d = await getJson(m.url);
      const pow = d.power ?? 0;
      const t = typeCap(d.type.name);
      idx.set(d.name, { type: t, power: pow });
    }
    url = page.next;
  }
  return idx;
}

const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];

// --- MAIN ---
(async () => {
  console.log('Building move index…');
  const MOVE_INDEX = await buildMoveIndex();

  console.log('Loading Pokémon details…');
  // grab all pokemon?limit big enough
  const list = await getJson(`${API}/pokemon?limit=20000`);
  const out = [];
  const names = [];

  for (const row of list.results) {
    const poke = await getJson(row.url);

    // skip weird ride forms etc
    if (EXCLUDE_NAME_PARTS.some(k => poke.name.includes(k))) continue;

    // types
    const types = poke.types.map(t => typeCap(t.type.name));

    // species (for names/restricted/evo info)
    const species = await getJson(poke.species.url);
    const restricted = isRestricted(species);

    // stage info
    let stage = 0, isFinal = true;
    try {
      const si = await getStageInfo(species);
      stage = si.depth;
      isFinal = si.isFinal;
    } catch { /* fallback ok */ }

    // abilities (normal vs hidden)
    let abilityTagNormal = null, abilityTagHidden = null;
    for (const a of poke.abilities) {
      const key = a.ability.name.toLowerCase();
      if (ABILITY_MAP.has(key)) {
        if (a.is_hidden) abilityTagHidden = ABILITY_MAP.get(key);
        else abilityTagNormal = ABILITY_MAP.get(key);
      }
    }

    // learnedStrong types (≥70 power & STAB)
    const learned = new Set();
    for (const mv of poke.moves) {
      const rec = MOVE_INDEX.get(mv.move.name);
      if (!rec) continue;
      const t = rec.type;
      if (rec.power >= 70 && types.includes(t)) learned.add(t);
    }
    const learnedStrong = Array.from(learned);

    const offense = Math.max(
      poke.stats.find(s=>s.stat.name==='attack')?.base_stat ?? 0,
      poke.stats.find(s=>s.stat.name==='special-attack')?.base_stat ?? 0
    );

    const display = prettyNameFromPokemon(poke);
    const record = {
      name: display,           // pretty
      slug: poke.name,         // exact slug for PokeAPI calls / sprites
      id: poke.id,
      types,
      offense,
      stage,                   // 0/1/2…
      isFinal,
      isMega: /-mega/.test(poke.name),
      restricted,
      abilityTagNormal,
      abilityTagHidden,
      learnedStrong
    };

    out.push(record);
    names.push(display);
    // polite pacing
    if (out.length % 50 === 0) await sleep(40);
  }

  const payload = { pokemon: out, names };
  await fs.mkdir('public/data', { recursive: true });
  await fs.writeFile('public/data/index.json', JSON.stringify(payload));
  console.log(`Wrote public/data/index.json with ${out.length} entries`);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
