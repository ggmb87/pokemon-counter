/* scripts/build-index.mjs
 * Build a compact dex for the app: types, id, power, strong STABs, abilityTag.
 * Node 18+ (global fetch) recommended.
 */

const POKE_LIMIT = 20000;        // plenty
const MOVE_LIMIT = 20000;        // plenty
const CONCURRENCY = 12;          // parallel fetches
const STRONG_BP = 70;            // >= this counts as "strong"
const OUT_FILE = 'public/data/index.json';

// Forms that are not battle-eligible (ride modes, etc.)
const EXCLUDE_SLUGS = new Set([
  'koraidon-limited-build',
  'koraidon-sprinting-build',
  'koraidon-swimming-build',
  'koraidon-gliding-build',
  'miraidon-low-power-mode',
  'miraidon-drive-mode'
]);

// Abilities that influence our heuristics (must match the UI's map)
const SUPPORTED_ABILITIES = new Set([
  'drizzle', 'drought', 'primordial-sea', 'desolate-land',
  'sand-stream', 'snow-warning', 'orichalcum-pulse', 'hadron-engine',
  'huge-power', 'adaptability'
]);

// Signature / special moves we want to treat as strong if PokeAPI reports odd BP in some gens
const FORCE_STRONG = {
  'collision-course': 100,   // Koraidon
  'electro-drift': 100       // Miraidon
};

// --- small helpers ----------------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      last = e;
      await sleep(250 * (i + 1));
    }
  }
  throw last;
}

function pickMostLikelyAbility(abilities) {
  // Prefer non-hidden if it’s supported, otherwise hidden if supported, otherwise first supported.
  if (!Array.isArray(abilities)) return null;
  const names = abilities
    .map(a => ({ name: a.ability?.name?.toLowerCase(), hidden: !!a.is_hidden }))
    .filter(a => a.name);

  // 1) non-hidden supported
  const nonHidden = names.find(a => !a.hidden && SUPPORTED_ABILITIES.has(a.name));
  if (nonHidden) return nonHidden.name;
  // 2) hidden supported
  const hidden = names.find(a => a.hidden && SUPPORTED_ABILITIES.has(a.name));
  if (hidden) return hidden.name;
  // 3) any supported
  const any = names.find(a => SUPPORTED_ABILITIES.has(a.name));
  return any?.name ?? null;
}

function calcPower(stats) {
  // lightweight "how hard can it hit" score: favor the better of Atk/SpA, with a small total bonus.
  if (!Array.isArray(stats)) return 80;
  let atk = 80, spa = 80, sum = 0;
  for (const s of stats) {
    const n = s?.stat?.name;
    const b = s?.base_stat ?? 80;
    sum += b;
    if (n === 'attack') atk = b;
    if (n === 'special-attack') spa = b;
  }
  return Math.round(Math.max(atk, spa) + (sum / 12)); // ~80–135 typical
}

function toTypeName(t) {
  if (!t) return null;
  const n = t.toLowerCase();
  return n[0].toUpperCase() + n.slice(1);
}

// --- 1) Build a move index: name -> {type, power} ---------------------------
async function buildMoveIndex() {
  const list = await getJson(`https://pokeapi.co/api/v2/move?limit=${MOVE_LIMIT}`);
  const all = list.results || [];
  const out = {};
  let done = 0;
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    await Promise.all(
      all.slice(i, i + CONCURRENCY).map(async (m) => {
        try {
          const d = await getJson(m.url);
          const name = d.name.toLowerCase();
          const bp = FORCE_STRONG[name] ?? d.power ?? null;
          out[name] = { type: d.type?.name || null, power: bp };
        } catch {_=>_}
      })
    );
    done += Math.min(CONCURRENCY, all.length - i);
    process.stdout.write(`\r • ${done}/${all.length} moves…`);
  }
  process.stdout.write('\n');
  return out;
}

// Is this move "strong" in type T? (≥STRONG_BP and physical/special; ignore status)
function isStrong(move, wantType) {
  if (!move) return false;
  if (!move.type) return false;
  if (move.type.toLowerCase() !== wantType.toLowerCase()) return false;
  const p = move.power ?? 0;
  return (p && p >= STRONG_BP);
}

// --- 2) Build the dex -------------------------------------------------------
async function buildDex(moveIndex) {
  // Start from the "pokemon" list so we include forms/meg as separate slugs
  const list = await getJson(`https://pokeapi.co/api/v2/pokemon?limit=${POKE_LIMIT}`);
  const all = list.results || [];

  const out = [];
  const names = [];

  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      all.slice(i, i + CONCURRENCY).map(async (p) => {
        try {
          const d = await getJson(p.url); // /pokemon/{slug}
          const species = await getJson(d.species.url); // species info (legendary/mythical)
          const id = d.id;
          const apiSlug = d.name.toLowerCase();
          if (EXCLUDE_SLUGS.has(apiSlug)) return null;   // <- skip non-battle forms
          
          const types = (d.types || [])
            .sort((a, b) => a.slot - b.slot)
            .map(t => toTypeName(t.type.name))
            .filter(Boolean);

          // gather learnset -> which STAB types have strong moves?
          const stabTypes = new Set((types || []).map(t => t.toLowerCase()));
          const strong = new Set();
          for (const mv of d.moves || []) {
            const mname = (mv.move?.name || '').toLowerCase();
            const mi = moveIndex[mname];
            if (!mi) continue;
            if (stabTypes.has(mi.type?.toLowerCase()) && isStrong(mi, mi.type)) {
              strong.add(toTypeName(mi.type));
            }
          }

          const restricted = !!(species.is_legendary || species.is_mythical);

          // pick a supported ability if present
          let abilityTag = pickMostLikelyAbility(d.abilities);

          // Megas/primals/box legends often have unique abilities already returned by /pokemon;
          // nothing else to do. If PokeAPI ever returns empty (rare), leave null.

          const power = calcPower(d.stats);

          // try to spot Megas/Primals from the slug
          const isMega = /-mega/.test(apiSlug) || /-primal/.test(apiSlug);

          return {
            name: apiSlug,     // we keep the slug as "name" for matching in the app
            apiSlug,
            id,
            types,
            power,
            restricted,
            isMega,
            strong: Array.from(strong),
            abilityTag: abilityTag || null,
          };
        } catch {
          return null;
        }
      })
    );

    for (const x of batch) {
      if (!x) continue;
      out.push(x);
      names.push(x.name);
    }
    process.stdout.write(`\rFetched ${out.length} Pokémon…`);
  }
  process.stdout.write('\n');

  // Small cleanup: keep only sensible entries
  const filtered = out.filter(p => p.types && p.types.length);

  return { pokemon: filtered, names: Array.from(new Set(names)).sort() };
}

// --- main -------------------------------------------------------------------
(async () => {
  console.log('Building move index…');
  const moveIndex = await buildMoveIndex();

  console.log('Loading Pokémon details…');
  const { pokemon, names } = await buildDex(moveIndex);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    count: pokemon.length,
    names,
    pokemon
  };

  const fs = await import('node:fs/promises');
  await fs.mkdir('public/data', { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${OUT_FILE} with ${pokemon.length} entries`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
