// Detecta qué estilos de Falk&Ross ya están en el catálogo vía TopTex (misma marca + mismo código de fabricante),
// para no subirlos dos veces. TopTex antepone su prefijo al código del fabricante (Gildan 5000 -> GI5000,
// B&C TU01T -> CGTU01T, Fruit of the Loom 61-036-0 -> SC61036...), así que se comparan las dos formas normalizadas.
// Informe: node scripts/falkross-duplicados.mjs <estilos.json>
import { readFileSync } from "node:fs";
const FAM = ["result", "russell", "b&c", "fruitoftheloom", "regatta", "beechfield", "bagbase", "flexfit", "gildan", "quadra", "yoko", "spiro", "buildyourbrand", "westfordmill", "kustomkit", "teejays", "stormtech", "henbury", "premier", "babybugz", "larkwood", "towelcity", "shugon", "karlowsky"];
export const familia = b => {
  const n = (b || "").toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9&]/g, "");
  if (n === "classics") return "flexfit"; // la línea "Classics" de Falk&Ross es Flexfit/Yupoong (TopTex la vende como Flexfit)
  return FAM.find(f => n.startsWith(f)) || n;
};
// Mismo producto que TopTex aunque el código no coincida
const MANUAL = { "b&c": ["FU703"] };
function variantes(code, fam) {
  const out = new Set();
  for (const raw of String(code || "").toUpperCase().split(/[\/(]/)) {
    const p = raw.replace(/[^A-Z0-9]/g, ""); if (!p) continue;
    const ks = [p];
    if (/^0/.test(p)) { const q = p.replace(/^0+/, ""); ks.push(q, q.replace(/0$/, "")); }
    for (const k of ks) {
      out.add(k);
      const m = k.match(/^([A-Z]*)0*(\d+)([A-Z]*)$/);
      if (m) {
        out.add(m[1] + m[2] + m[3]);
        if (fam === "result") out.add(m[1] + m[2] + m[3].replace(/[XA]$/, ""));
        if (fam === "russell") out.add(m[2] + m[3]);
        if (fam === "fruitoftheloom") out.add(m[2]);
      }
    }
  }
  return [...out].filter(k => k.length >= 2);
}
const PREF = { gildan: "GI", "b&c": "CG", fruitoftheloom: "SC", flexfit: "FL", yoko: "Y", russell: "RU" };
export function indiceTopTex(tt) {
  const idx = new Map();
  for (const p of tt) {
    const f = familia(p.brand), s = idx.get(f) || new Set(); idx.set(f, s);
    let r = String(p.ref || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const add = c => variantes(c, f).forEach(k => s.add(k));
    add(r);
    const m = r.match(/^([A-Z]{1,3})(\d.*|[A-Z]{1,3}\d.*)$/); // prefijo TopTex genérico
    if (m) { add(m[2]); add(r.replace(/^[A-Z]{2}/, "")); add(r.replace(/^[A-Z]/, "")); }
    if (PREF[f] && r.startsWith(PREF[f])) add(r.slice(PREF[f].length));
    if (f === "gildan") { const g = r.match(/^GI6400([LB]?)$/); if (g) add("64000" + g[1]); }
    if (f === "russell") { const z = r.match(/^RUZT(\d+)(L?)$/); if (z) add(z[1] + (z[2] || "M")); }
    for (const x of (p.name || "").matchAll(/\b(\d\d)-(\d{3})-\d\b/g)) s.add(x[1] + x[2]);
  }
  return idx;
}
export const esDuplicado = (idx, brand, code) => {
  const f = familia(brand), s = idx.get(f); if (!s) return false;
  if ((MANUAL[f] || []).includes(String(code).toUpperCase())) return true;
  let v = variantes(code, f);
  const d = f === "fruitoftheloom" && String(code).match(/^0?(\d\d)-?(\d{3})-?\d$/);
  if (d) v.push(d[1] + d[2]);
  return v.some(k => s.has(k));
};
if (process.argv[2]) {
  const tt = JSON.parse(readFileSync("data/toptex.json", "utf8")), fr = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const idx = indiceTopTex(tt), by = {};
  for (const r of fr) { const f = familia(r.brand); if (!idx.has(f)) continue; (by[f] ??= { d: [], n: [] })[esDuplicado(idx, r.brand, r.code) ? "d" : "n"].push(`${r.code}=${r.es}`); }
  let D = 0; for (const [f, v] of Object.entries(by)) { D += v.d.length; console.log(`\n## ${f}: ${v.d.length} duplicados, ${v.n.length} nuevos\nDUP: ${v.d.join(" | ")}\nNUEVOS: ${v.n.join(" | ")}`); }
  console.log("\nTOTAL duplicados", D, "de", fr.length);
}
