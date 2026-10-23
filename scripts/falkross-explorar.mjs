// Diagnóstico Falk&Ross: lista de estilos, ficha de cada estilo y (si hay credenciales) stock.
// Guarda un resumen sin precios en diagnostico/falkross*.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
mkdirSync("diagnostico", { recursive: true });
const out = [];
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : ""; };
const all = (x, t) => [...x.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, "g"))].map(m => m[1]);
const lang = (x, t, l) => { const b = tag(x, t); return b ? tag(b, l) : ""; };

async function get(u, opt = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u, { ...opt, signal: AbortSignal.timeout(90000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
      out.push(`HTTP ${r.status} ${u}`);
    } catch (e) { out.push(`error ${e.message} ${u}`); }
    await new Promise(r => setTimeout(r, 2000 * 2 ** i));
  }
  return null;
}

const list = await get("http://download.falk-ross.eu/ws/falkross-stylelist.xml");
if (!list) { out.push("No se pudo descargar la lista"); writeFileSync("diagnostico/falkross.txt", out.join("\n")); process.exit(0); }
const styles = all(list, "style").map(s => ({ nr: tag(s, "style_nr"), url: tag(s, "url_style_xml") }));
out.push(`Estilos en la lista: ${styles.length}`);
out.push("Ejemplo lista: " + list.slice(0, 600).replace(/\s+/g, " "));

const res = [];
let first = true, i = 0;
async function worker() {
  while (i < styles.length) {
    const s = styles[i++];
    const x = await get(s.url);
    if (!x) continue;
    if (first) { first = false; writeFileSync("diagnostico/falkross-ejemplo.xml", x.slice(0, 60000)); }
    const skus = all(x, "sku");
    res.push({
      nr: s.nr, brand: tag(x, "brand_name"), code: tag(x, "supplier_article_code"),
      es: lang(x, "style_name", "es"), en: lang(x, "style_name", "en"),
      main: (x.match(/<style_category_main>\s*([^<]*)/) || [])[1]?.trim() || "",
      sub: all(x, "style_category_sub").map(c => tag(c, "es") || tag(c, "en")).join("|"),
      gender: all(x, "style_gender_group").join("|"),
      pics: all(x, "style_picture").map(p => tag(p, "shottype")).join(""),
      colors: new Set(skus.map(k => tag(k, "sku_color_code"))).size,
      sizes: [...new Set(skus.map(k => tag(k, "sku_size_name")))].join(" "),
      skus: skus.length, ean: tag(skus[0] || "", "sku_ean"),
      closeout: skus.length && skus.every(k => tag(k, "sku_closeout") === "1") ? 1 : 0,
    });
  }
}
await Promise.all([worker(), worker(), worker()]);
res.sort((a, b) => a.nr.localeCompare(b.nr));
out.push(`Fichas leídas: ${res.length}`);

// Marcas
const br = {}; for (const r of res) br[r.brand] = (br[r.brand] || 0) + 1;
out.push("Marcas: " + Object.entries(br).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(", "));
const cm = {}; for (const r of res) cm[r.main + " > " + r.sub] = (cm[r.main + " > " + r.sub] || 0) + 1;
out.push("Categorías: " + Object.entries(cm).sort((a, b) => b[1] - a[1]).slice(0, 80).map(([b, n]) => `${b} ${n}`).join(" ;; "));

// Cruce con TopTex por marca + código del fabricante
const tt = JSON.parse(readFileSync("data/toptex.json", "utf8"));
const nb = b => (b || "").toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9]/g, "");
const ttBrands = new Set(tt.map(p => nb(p.brand)));
const common = Object.keys(br).filter(b => ttBrands.has(nb(b)));
out.push("Marcas en ambos: " + common.map(b => `${b} (F&R ${br[b]}, TopTex ${tt.filter(p => nb(p.brand) === nb(b)).length})`).join(", "));
for (const b of common) {
  out.push(`\n## ${b}`);
  out.push("TopTex: " + tt.filter(p => nb(p.brand) === nb(b)).map(p => `${p.ref}=${p.name}`).join(" | "));
  out.push("F&R: " + res.filter(r => r.brand === b).map(r => `${r.code}=${r.es || r.en}`).join(" | "));
}
writeFileSync("diagnostico/falkross-estilos.json", JSON.stringify(res));

// Stock (solo si hay credenciales)
const U = process.env.FALKROSS_USER, P = process.env.FALKROSS_PASSWORD;
if (U && P) {
  const auth = { headers: { Authorization: "Basic " + Buffer.from(`${U}:${P}`).toString("base64"), "Cache-Control": "no-cache", Connection: "close" } };
  const csv = await get("https://ws.falk-ross.eu/webservice/R03_000/stockinfo/falkross_de.csv", auth, 3);
  if (csv) {
    const l = csv.trim().split(/\r?\n/);
    out.push(`\nStock CSV: ${l.length - 1} SKU, cabecera ${l[0]}; ejemplo: ${l.slice(1, 6).join(" / ")}`);
    out.push(`SKU con verde+azul > 0: ${l.slice(1).filter(x => { const c = x.split(";"); return +c[1] + +c[3] > 0; }).length}`);
  } else out.push("Stock CSV: sin respuesta");
} else out.push("\nStock: faltan los secretos FALKROSS_USER / FALKROSS_PASSWORD");

writeFileSync("diagnostico/falkross.txt", out.join("\n").replaceAll(P || "\u0000", "(pw)"));
