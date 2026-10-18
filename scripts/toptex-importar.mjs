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

// El catálogo completo se pide como archivo (la paginación se corta en 200).
const pagelog = [];
const f = await json(`/v3/products/all?lang=es&usage_right=b2b_b2c&result_in_file=1`, H);
let raw = [];
for (let i = 0; i < 30; i++) {
  const r = await fetch(f.link);
  if (r.ok) { const d = await r.json(); raw = d.items || (Array.isArray(d) ? d : []); if (raw.length) break; }
  pagelog.push(`intento ${i + 1}: ${r.status}`); await sleep(20000);
}
pagelog.push(`archivo: ${raw.length} productos`);
if (!raw.length) { console.error("Archivo vacío", pagelog.join(" | ")); process.exit(1); }
// Foto del color: siempre la de delante si existe (nunca la espalda ni el lateral)
const PKEYS = {};
function frontPackshot(ps) {
  ps = ps || {};
  const keys = Object.keys(ps).filter(k => ps[k]?.url_packshot);
  keys.forEach(k => PKEYS[k] = (PKEYS[k] || 0) + 1);
  const pref = ["FACE SIDE", "FACE", "FRONT", "FRONT SIDE", "MAIN", "FACE ON MODEL"];
  for (const k of pref) if (ps[k]?.url_packshot) return ps[k].url_packshot;
  const k = keys.find(k => !/BACK|DOS|SIDE|PROFIL|LATERAL|DETAIL|ZOOM|INSIDE/i.test(k)) || keys.find(k => !/BACK|DOS/i.test(k)) || keys[0];
  return k ? ps[k].url_packshot : "";
}
const weight = p => { for (const c of p.colors || []) for (const s of c.sizes || []) if (s.coatingWeight_fr) return s.coatingWeight_fr; return ""; };
const products = raw.filter(p => p.saleState === "active").map(p => {
  const colors = (p.colors || []).filter(c => c.saleState !== "inactive").map(c => ({
    n: es(c.colors), hex: (c.colorsHexa || [])[0] || "", dom: esList(c.colorsDominant),
    img: frontPackshot(c.packshots),
    new: (c.sizes || []).some(s => s.isNew) ? 1 : 0,
  }));
  const sizes = [...new Set((p.colors || []).flatMap(c => (c.sizes || []).map(s => es(s.sizeCountry) || s.size)))];
  return {
    ref: p.catalogReference, name: es(p.designation), fam: es(p.family), sub: es(p.sub_family),
    gen: esList(p.gender), comp: es(p.composition), peso: weight(p), desc: es(p.description),
    args: [es(p.salesArguments), es(p.salesArguments2), es(p.salesArguments3)].filter(Boolean),
    org: esList(p.organic).length ? 1 : 0, img: (p.images || []).map(i => i.url_image).filter(Boolean).slice(0, 6),
    colors, sizes,
    brand: p.brand || "", style: esList(p.style)[0] || "", fit: esList(p.fit)[0] || "",
    world: esList(p.world), act: esList(p.activity), nolabel: p.labelType === "no_label" ? 1 : 0,
    oeko: p.oekoTex === "1" ? 1 : 0, rec: (p.recycled || []).filter(Boolean).length ? 1 : 0,
    big: p.largeSizes === "1" ? 1 : 0, hood: p.hood === "Oui" ? 1 : 0, cert: esList(p.organic),
    finish: esList(p.productFinish)[0] || "", neck: esList(p.neckType)[0] || "",
    pockets: esList(p.typePockets)[0] || "", waterproof: esList(p.waterproof)[0] || "",
    created: p.createdDate || "",
  };
});

mkdirSync("data", { recursive: true });
writeFileSync("data/toptex.json", JSON.stringify(products));
const fam = {};
for (const p of products) { fam[p.fam] ??= { n: 0, subs: {} }; fam[p.fam].n++; fam[p.fam].subs[p.sub] = (fam[p.fam].subs[p.sub] || 0) + 1; }
const lines = [`Productos activos: ${products.length} (de ${raw.length})`, "Descarga: " + pagelog.join(" | "), ""];
for (const [f, v] of Object.entries(fam).sort((a, b) => b[1].n - a[1].n)) {
  lines.push(`${f}: ${v.n}`);
  for (const [s, n] of Object.entries(v.subs).sort((a, b) => b[1] - a[1])) lines.push(`   - ${s}: ${n}`);
}
// Muestra de campos disponibles (para diseñar filtros)
const sample = raw.find(p => p.saleState === "active") || raw[0];
const brief = v => { const t = JSON.stringify(v); return t && t.length > 160 ? t.slice(0, 160) + "…" : t; };
lines.push("", "VISTAS DE COLOR: " + JSON.stringify(PKEYS));
lines.push("", "CAMPOS PRODUCTO:");
for (const [k, v] of Object.entries(sample)) if (k !== "colors") lines.push(`  ${k} = ${brief(v)}`);
lines.push("CAMPOS COLOR:");
for (const [k, v] of Object.entries(sample.colors?.[0] || {})) if (k !== "sizes") lines.push(`  ${k} = ${brief(v)}`);
lines.push("CAMPOS TALLA:");
for (const [k, v] of Object.entries(sample.colors?.[0]?.sizes?.[0] || {})) if (!/price/i.test(k)) lines.push(`  ${k} = ${brief(v)}`);
writeFileSync("data/toptex-resumen.txt", lines.join("\n"));
console.log(lines.slice(0, 5).join("\n"));
