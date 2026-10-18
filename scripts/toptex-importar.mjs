// Importa el catálogo de TopTex (sin precios) a data/toptex.json
// y genera data/toptex-resumen.txt con el recuento por familia y subfamilia.
import { writeFileSync, mkdirSync } from "node:fs";
const BASE = "https://api.toptex.io";
const KEY = process.env.TOPTEX_API_KEY, USER = process.env.TOPTEX_USER, PASS = process.env.TOPTEX_PASSWORD;
if (!KEY || !USER || !PASS) { console.error("Faltan secretos de TopTex"); process.exit(1); }

const es = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v.es || "") : (typeof v === "string" ? v : "");
const esList = a => Array.isArray(a) ? a.map(es).filter(Boolean) : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function json(path, opts) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + path, opts);
    if (r.ok) return r.json();
    console.log("Reintento", r.status, path.slice(0, 80)); await sleep(3000 * (i + 1));
  }
  throw new Error("Fallo " + path);
}
const auth = await json("/v3/authenticate", { method: "POST", headers: { "x-api-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ username: USER, password: PASS }) });
const H = { headers: { "x-api-key": KEY, "x-toptex-authorization": auth.token } };

const PAGE = 100; const raw = []; const pagelog = [];
for (let page = 1; page <= 200; page++) {
  const d = await json(`/v3/products/all?lang=es&usage_right=b2b_b2c&page_size=${PAGE}&page_number=${page}`, H);
  const items = d.items || (Array.isArray(d) ? d : []);
  pagelog.push(`p${page}: ${items.length} (total_count=${d.total_count}, page_number=${d.page_number}) claves=${Object.keys(d).join(',')} ${items.length?'':JSON.stringify(d).slice(0,300)}`);
  console.log(pagelog.at(-1));
  if (!items.length) break;
  raw.push(...items);
  if (items.length < PAGE && raw.length >= Number(d.total_count || 0)) break;
}
const weight = p => { for (const c of p.colors || []) for (const s of c.sizes || []) if (s.coatingWeight_fr) return s.coatingWeight_fr; return ""; };
const products = raw.filter(p => p.saleState === "active").map(p => {
  const colors = (p.colors || []).filter(c => c.saleState !== "inactive").map(c => ({
    n: es(c.colors), hex: (c.colorsHexa || [])[0] || "", dom: esList(c.colorsDominant),
    img: c.packshots?.["FACE SIDE"]?.url_packshot || Object.values(c.packshots || {})[0]?.url_packshot || "",
    new: (c.sizes || []).some(s => s.isNew) ? 1 : 0,
  }));
  const sizes = [...new Set((p.colors || []).flatMap(c => (c.sizes || []).map(s => es(s.sizeCountry) || s.size)))];
  return {
    ref: p.catalogReference, name: es(p.designation), fam: es(p.family), sub: es(p.sub_family),
    gen: esList(p.gender), comp: es(p.composition), peso: weight(p), desc: es(p.description),
    args: [es(p.salesArguments), es(p.salesArguments2), es(p.salesArguments3)].filter(Boolean),
    org: esList(p.organic).length ? 1 : 0, img: (p.images || []).map(i => i.url_image).filter(Boolean).slice(0, 6),
    colors, sizes,
  };
});

mkdirSync("data", { recursive: true });
writeFileSync("data/toptex.json", JSON.stringify(products));
const fam = {};
for (const p of products) { fam[p.fam] ??= { n: 0, subs: {} }; fam[p.fam].n++; fam[p.fam].subs[p.sub] = (fam[p.fam].subs[p.sub] || 0) + 1; }
const lines = [`Productos activos: ${products.length} (de ${raw.length})`, "Páginas: " + pagelog.slice(0,3).join(" | ") + " … " + pagelog.slice(-2).join(" | "), ""];
for (const [f, v] of Object.entries(fam).sort((a, b) => b[1].n - a[1].n)) {
  lines.push(`${f}: ${v.n}`);
  for (const [s, n] of Object.entries(v.subs).sort((a, b) => b[1] - a[1])) lines.push(`   - ${s}: ${n}`);
}
writeFileSync("data/toptex-resumen.txt", lines.join("\n"));
console.log(lines.slice(0, 5).join("\n"));
