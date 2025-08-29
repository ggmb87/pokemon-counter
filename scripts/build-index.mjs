// scripts/build-index.mjs
// Requires Node 18+ (global fetch). You have Node 22 — perfect.
import fs from "fs/promises";

const API = "https://pokeapi.co/api/v2";
const UA = "pokemon-counter/1.0 (contact: you@example.com)";

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Robust fetch: retries on network errors + 429/5xx with backoff
async function getJson(url, tries = 0) {
  const MAX = 8;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      const wait = Math.min(500 * 2 ** tries, 8000);
      await sleep(wait);
      return getJson(url, tries + 1);
    }
    throw new Error(`HTTP ${res.status} on ${url}`);
  } catch (err) {
    if (tries < MAX) {
      const wait = Math.min(500 * 2 ** tries, 8000);
      await sleep(wait);
      return getJson(url, tries + 1);
    }
    console.error("getJson failed after retries:", url, err?.code || err?.message);
    throw err;
  }
}

function Cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function capType(s) { return Cap(s); }
function capWordsHyphen(s) { return (s || "").split("-").map(Cap).join(" "); }
function displayName(slug) {
  if (slug.includes("-mega")) {
    const form = slug.includes("-mega-x") ? "Mega X" : slug.includes("-mega-y") ? "Mega Y" : "Mega";
    const base = slug.replace(/-mega(-[a-z])?/, "");
    return `${capWordsHyphen(base)} (${form})`;
  }
  return capWordsHyphen(slug);
}

async function queue(items, fn, concurrency = 3, label = "jobs") {
  let i = 0, active = 0, done = 0;
  return new Promise((resolve, reject) => {
    const next = () => {
      if (i >= items.length && active === 0) return resolve();
      while (active < concurrency && i < items.length) {
        const item = items[i++];
        active++;
        fn(item)
          .then(() => {
            active--; done++;
            if (done % 100 === 0) console.log(` • ${done}/${items.length} ${label}…`);
            next();
          })
          .catch(reject);
      }
    };
    next();
  });
}

// ---------- 1) species (for restricted flags) ----------
console.log("Loading species list…");
const speciesList = await getJson(`${API}/pokemon-species?limit=20000`);
const speciesFlags = new Map(); // species-slug -> {legendary,mythical}

await queue(
  speciesList.results,
  async (s) => {
    const js = await getJson(s.url);
    speciesFlags.set(js.name, { legendary: !!js.is_legendary, mythical: !!js.is_mythical });
  },
  6,
  "species"
);

// ---------- 2) pokemon forms ----------
console.log("Loading Pokémon index…");
const all = await getJson(`${API}/pokemon?limit=20000`);

// keep default forms + megas; skip gmax/totem which skew movesets
const keep = all.results.filter((p) => {
  const n = p.name;
  if (n.includes("-gmax") || n.includes("-totem")) return false;
  return true; // allow regional/alt forms; megas included
});

const out = [];
const moveNames = new Set();

async function loadMon(entry) {
  const d = await getJson(entry.url);
  const id = d.id;
  const slug = d.name;                     // e.g., "tyranitar-mega"
  const isMega = slug.includes("-mega");
  const types = d.types.sort((a, b) => a.slot - b.slot).map((t) => capType(t.type.name));
  const stats = Object.fromEntries(d.stats.map((s) => [s.stat.name, s.base_stat]));
  const atk = stats.attack || 0, spa = stats["special-attack"] || 0;

  // Scale to ~70–100 for our simple scoring (peaks near high ATK/SPA)
  const power = Math.max(70, Math.min(100, Math.round(Math.max(atk, spa) * 0.6)));

  // moves (names only for now)
  const monsMoves = d.moves.map((m) => m.move.name);
  monsMoves.forEach((n) => moveNames.add(n));

  // Restricted = legendary or mythical (by species)
  const sf = speciesFlags.get(d.species.name) || { legendary: false, mythical: false };
  const restricted = !!(sf.legendary || sf.mythical);

  out.push({
    name: displayName(slug),
    apiSlug: slug,
    id,
    types,
    power,
    _moveNames: monsMoves, // temp: used to compute 'strong'
    restricted,
    isMega
  });
}

console.log("Loading Pokémon details (this can take a bit) …");
await queue(keep, loadMon, 3, "pokemon");

// ---------- 3) unique moves ----------
console.log("Loading unique moves…");
const moveArr = Array.from(moveNames);
const moveMap = new Map();

await queue(
  moveArr,
  async (name) => {
    const m = await getJson(`${API}/move/${name}`);
    moveMap.set(name, {
      type: capType(m.type.name),
      power: m.power,                  // may be null
      cls: m.damage_class?.name || "status" // 'physical'|'special'|'status'
    });
  },
  4,
  "moves"
);

// ---------- 4) compute 'strong' types (≥70 BP, damaging, STAB) ----------
for (const p of out) {
  const typeSet = new Set(p.types);
  const strong = new Set();
  for (const mn of p._moveNames) {
    const mv = moveMap.get(mn);
    if (!mv) continue;
    if (!mv.power || mv.power < 70) continue;
    if (mv.cls === "status") continue;
    if (!typeSet.has(mv.type)) continue; // require STAB
    strong.add(mv.type);
  }
  p.strong = Array.from(strong);
  delete p._moveNames;
}

// ---------- 5) names list for autocomplete ----------
const names = speciesList.results.map((r) => r.name);

// ---------- 6) write file ----------
await fs.mkdir("public/data", { recursive: true });
const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  count: out.length,
  names,
  pokemon: out
};
await fs.writeFile("public/data/index.json", JSON.stringify(payload));
console.log(`Wrote public/data/index.json with ${out.length} entries`);
