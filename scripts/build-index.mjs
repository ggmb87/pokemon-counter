// scripts/build-index.mjs
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ---------------------------
// Config
// ---------------------------
const OUT = path.resolve("public/data/index.json");
const POKEAPI = "https://pokeapi.co/api/v2";

const EXCLUDE_CONTAINS = [
  "-limited-build",
  "-sprinting-build",
  "-swimming-build",
  "-gliding-build",
  "-aquatic-mode",
  "-glide-mode",
  "-gmax",              // raid-only gigantamax
  "-starter",           // ride/overworld variants show up on some endpoints
];

const FORM_LABEL = {
  mega: "Mega",
  primal: "Primal",
  alola: "Alolan",
  hisui: "Hisuian",
  galar: "Galarian",
  paldea: "Paldean",
};

// abilities we model in scoring (same tags used in App)
const ABILITY_TAGS = {
  drizzle: "drizzle",
  drought: "drought",
  "primordial-sea": "primordial-sea",
  "desolate-land": "desolate-land",
  "sand-stream": "sand-stream",
  "snow-warning": "snow-warning",
  "orichalcum-pulse": "orichalcum-pulse",
  "hadron-engine": "hadron-engine",
  "huge-power": "huge-power",
  adaptability: "adaptability",
};

// ---------------------------
// Helpers
// ---------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function titleCase(s) {
  return s.replace(/(^|[\s-])([a-z])/g, (_, sp, c) => sp + c.toUpperCase());
}

function baseAndFormFromSlug(slug) {
  // ex: "garchomp-mega" -> ["garchomp","mega"]
  //     "raichu-alola"  -> ["raichu","alola"]
  const parts = slug.split("-");
  if (parts.length === 1) return { base: slug, form: null };

  // Try matching a known form token at the end
  const tail = parts[parts.length - 1];
  if (FORM_LABEL[tail]) {
    return { base: parts.slice(0, -1).join("-"), form: tail };
  }
  return { base: slug, form: null };
}

function prettyNameFromSlug(slug) {
  const { base, form } = baseAndFormFromSlug(slug);
  const basePretty = titleCase(base.replace(/-/g, " "));
  if (!form) return basePretty;
  const label = FORM_LABEL[form];
  if (!label) return basePretty;
  return `${basePretty} (${label})`;
}

function shouldExclude(slug) {
  const s = slug.toLowerCase();
  return EXCLUDE_CONTAINS.some(x => s.includes(x));
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// ---------------------------
// Build
// ---------------------------
async function main() {
  console.log("Building move index…");
  // not used directly here any more, but we keep the log for continuity
  console.log("Loading Pokémon details…");

  // Fetch the full list of Pokémon endpoints
  const list = await getJson(`${POKEAPI}/pokemon?limit=20000`);
  const all = list.results.map(x => x.name);

  // Filter out clearly unwanted forms
  const wanted = all.filter(name => !shouldExclude(name));

  // Concurrency to be nice to the API
  const CONC = Math.max(4, Math.min(16, os.cpus()?.length || 8));
  let i = 0;
  const out = [];
  const errors = [];

  async function worker() {
    while (i < wanted.length) {
      const idx = i++;
      const slug = wanted[idx];
      try {
        const d = await getJson(`${POKEAPI}/pokemon/${slug}`);
        const types = (d.types || [])
          .sort((a,b)=>a.slot - b.slot)
          .map(t => t.type.name)
          .map(t => t[0].toUpperCase() + t.slice(1));
        const id = d.id;

        // map abilities
        const abl = (d.abilities || [])
          .filter(a => !a.is_hidden) // prefer regular ability for “default ability” use-case
          .map(a => a.ability.name);
        let abilityTag = null;
        if (abl.length === 1 && ABILITY_TAGS[abl[0]]) {
          abilityTag = ABILITY_TAGS[abl[0]];
        } else {
          // If every ability is the same impactful one (rare), still capture it
          const uniq = [...new Set(abl)];
          if (uniq.length === 1 && ABILITY_TAGS[uniq[0]]) abilityTag = ABILITY_TAGS[uniq[0]];
        }

        const pretty = prettyNameFromSlug(slug);
        const entry = {
          name: pretty,     // display name (Garchomp (Mega))
          slug,             // api slug (garchomp-mega)
          id,               // pokeapi numeric id (for artwork url)
          types,            // ["Dragon","Ground"]
          abilityTag,       // optional (null if none of our modelled abilities)
          aliases: [
            pretty.toLowerCase(),
            slug.toLowerCase(),
            titleCase(slug.replace(/-/g, " ")).toLowerCase(), // “Garchomp Mega”
          ],
        };

        out.push(entry);
      } catch (e) {
        errors.push({ slug, e: String(e) });
      }
      // gentle throttle
      await sleep(10);
    }
  }

  await Promise.all(Array.from({ length: CONC }, () => worker()));

  // De-duplicate by slug (keeps one canonical entry)
  const seen = new Map();
  for (const p of out) {
    if (!seen.has(p.slug)) seen.set(p.slug, p);
  }
  const pokemon = Array.from(seen.values()).sort((a,b)=> a.name.localeCompare(b.name));

  const names = pokemon.map(p => p.name); // pretty names used by autocomplete

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify({ pokemon, names }, null, 2), "utf8");
  console.log(`Wrote ${OUT} with ${pokemon.length} entries`);

  if (errors.length) {
    console.log(`(Skipped ${errors.length} entries with errors)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
