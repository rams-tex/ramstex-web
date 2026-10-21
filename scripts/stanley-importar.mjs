// Importa el catálogo de Stanley/Stella (API productsV2 + imágenes) a data/stanley.json, con el formato
// de los demás proveedores. Sin precios. Las fotos NO se enlazan a su servidor (no lo permiten):
// se guardan con el prefijo "T:" y scripts/stanley-fotos.mjs las descarga y las sirve desde ramstex.com.
import { writeFileSync } from "node:fs";

const BASE = "https://api.stanleystella.com/webrequest/";
async function call(path, extra = {}) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db_name: "production_api", user: process.env.STANLEY_USER, password: process.env.STANLEY_PASSWORD, ...extra }, id: 0 }) });
  const j = await r.json();
  if (j.error) throw new Error(path + ": " + JSON.stringify(j.error).slice(0, 300));
  return typeof j.result === "string" ? JSON.parse(j.result) : j.result;
}

const styles = await call("productsV2/get_json", { LanguageCode: "es_ES", Published: true });
const images = await call("products_imagesV2/get_json", { LanguageCode: "es_ES" });

// Nombre de producto en castellano
const TYPE = {
  "Camisetas": "Camiseta", "Camisetas sin mangas": "Camiseta sin mangas", "Sudaderas con capucha": "Sudadera con capucha",
  "Sudaderas de cuello redondo": "Sudadera de cuello redondo", "Sudaderas con cremallera": "Sudadera con cremallera", "Polo sweatshirt": "Sudadera polo",
  "Pantalones": "Pantalón", "Shorts": "Pantalón corto", "Camisas": "Camisa", "Canvas Jacket": "Chaqueta de lona", "Cortavientos": "Cortavientos",
  "Waterproof Jacket": "Chaqueta impermeable", "Chaquetas acolchadas": "Chaqueta acolchada", "Chaqueta acolchada ligera": "Chaqueta acolchada ligera",
  "Polar Fleece": "Forro polar", "Softshells": "Chaqueta softshell", "Sherpa": "Chaqueta sherpa", "Gorros": "Gorro", "Sombrero": "Sombrero",
  "Polos": "Polo", "Bolsas": "Bolsa", "Neceseres": "Neceser", "Bodies": "Body de bebé", "Baberos": "Babero",
};
const GENW = { Unisex: "unisex", Hombre: "de hombre", Mujer: "de mujer", Infantil: "infantil", "Bebé": "de bebé", Bebe: "de bebé" };
const GENL = { Unisex: "Unisex", Hombre: "Hombre", Mujer: "Mujer", Infantil: "Niños", "Bebé": "Bebes", Bebe: "Bebes" };
function famSub(s) {
  const t = s.Type || "", c = s.CategoryCode || "";
  if (/sin mangas/i.test(t)) return ["Ropa", "Tirantes"];
  if (c === "TEES") return ["Ropa", "Camisetas"];
  if (/^Polo sweatshirt$/i.test(t) || c === "SWEATSHIRTS") return ["Ropa", "Sudaderas"];
  if (/^Polos$/.test(t)) return ["Ropa", "Polos"];
  if (/^Camisas$/.test(t)) return ["Ropa", "Camisas / Sobrecamisas"];
  if (/^Shorts$/.test(t)) return ["Ropa", "Bermudas / Shorts"];
  if (/^Pantalones$/.test(t)) return ["Ropa", "Pantalones"];
  if (/Gorros|Sombrero/.test(t)) return ["Headwear & Accesorios", /Gorros/.test(t) ? "Gorros" : "Sombreros & accesorios"];
  if (/Bolsas|Neceseres/.test(t)) return ["Equipaje", /Neceseres/.test(t) ? "Neceseres" : "Bolsas"];
  if (/Bodies|Baberos/.test(t)) return ["Ropa", "Bebé"];
  return ["Ropa", "Chaquetas"];
}
// Composición en castellano: "50%Cotton - Recycled Open End Carded, 50% Cotton - Organic ..." -> "50% algodón reciclado, 50% algodón orgánico"
const MAT = { cotton: "algodón", polyester: "poliéster", elastane: "elastano", viscose: "viscosa", nylon: "nailon", polyamide: "poliamida", wool: "lana", lyocell: "lyocell", linen: "lino", modal: "modal", acrylic: "acrílico" };
function comp(s) {
  return String(s || "").split(",").map(part => {
    const m = part.match(/(\d+)\s*%\s*([A-Za-z]+)(.*)/); if (!m) return part.trim();
    const mat = MAT[m[2].toLowerCase()] || m[2].toLowerCase();
    const q = /recycled/i.test(m[3]) ? " reciclado" : /organic/i.test(m[3]) ? " orgánico" : "";
    return `${m[1]}% ${mat}${q && /a$/.test(mat) ? q.replace(/o$/, "a") : q}`;
  }).filter(Boolean).join(", ");
}
// Color dominante a partir del código hexadecimal (para el filtro de color)
function dom(hex) {
  const m = String(hex || "").match(/^#?([0-9a-f]{6})$/i); if (!m) return [];
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  if (l > 0.9 && s < 0.25) return ["Blanco"];
  if (l < 0.16) return ["Negro"];
  if (s < 0.12) return ["Gris"];
  if (h >= 20 && h < 55 && l > 0.68) return ["Beige"];
  if (h >= 10 && h < 45 && l < 0.42) return ["Marrón"];
  if (h < 12 || h >= 345) return [l > 0.7 ? "Rosa" : "Rojo"];
  if (h < 40) return ["Naranja"];
  if (h < 66) return ["Amarillo"];
  if (h < 170) return ["Verde"];
  if (h < 255) return ["Azul"];
  if (h < 290) return ["Violeta"];
  return ["Rosa"];
}
const stem = img => img ? "T:" + img.FName : "";
const SIZE_ORDER = ["2XS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];

// Imágenes por estilo y color
const imgBy = {};
for (const x of images) {
  if (x.PhotoStyle === "Businesswear") continue;
  ((imgBy[x.StyleCode] ??= {})[x.ColorCode] ??= []).push(x);
}
const pick = (list, type, shoot, style = "Main") => (list || []).filter(x => x.PhotoTypeCode === type && x.PhotoShootCode === shoot && x.PhotoStyle === style).sort((a, b) => a.PhotoSequenceCode - b.PhotoSequenceCode)[0];

const out = [];
for (const s of styles) {
  const vars = (s.Variants || []).filter(v => v.Published);
  if (!vars.length) continue;
  const byColor = new Map();
  for (const v of vars.sort((a, b) => a.ColorSequence - b.ColorSequence || a.SizeSequence - b.SizeSequence)) {
    if (!byColor.has(v.ColorCode)) byColor.set(v.ColorCode, { v, sizes: [] });
    byColor.get(v.ColorCode).sizes.push(v.SizeCode);
  }
  const imgs = imgBy[s.StyleCode] || {};
  const colors = [...byColor.values()].map(({ v }) => {
    const li = imgs[v.ColorCode];
    const front = pick(li, "Packshot", "Front") || pick(li, "Studio", "Front");
    return {
      code: v.ColorCode, n: v.Color, hex: (v.HexaColorCode || "").replace("#", ""), dom: dom(v.HexaColorCode),
      img: stem(front), views: [pick(li, "Packshot", "Back"), pick(li, "Studio", "Front"), pick(li, "Studio", "Back")].filter(x => x && x !== front).map(stem),
      new: v.NewStyle ? 1 : 0,
    };
  }).filter(c => c.img);
  if (!colors.length) continue;
  const main = (s.MainPicture || [])[0];
  const mainColor = main ? main.ColorCode : colors[0].code, li = imgs[mainColor];
  const duo = Object.values(imgs).flat().find(x => x.PhotoTypeCode === "Duo" && x.PhotoStyle === "Main");
  const pics = [main ? "T:" + main.FName : stem(pick(li, "Studio", "Front")), stem(pick(li, "Studio", "Back")), stem(duo)].filter(Boolean);
  const v0 = vars[0];
  const type = TYPE[s.Type] || s.Type || "Prenda";
  const styleName = String(s.StyleName || "").replace(/^(Stanley|Stella)\s+/i, "");
  const [fam, sub] = famSub(s);
  const sizes = [...new Set(vars.map(v => v.SizeCode))].sort((a, b) => (SIZE_ORDER.indexOf(a) + 1 || 99) - (SIZE_ORDER.indexOf(b) + 1 || 99));
  const any = k => vars.some(v => v[k]);
  out.push({
    ref: s.StyleCode, name: `${type} ${GENW[s.Gender] || ""} ${styleName}`.replace(/\s+/g, " ").trim(),
    fam, sub, gen: [GENL[s.Gender]].filter(Boolean), brand: "Stanley/Stella", source: "stanley",
    comp: comp(v0.CompositionList), peso: v0.Weight ? v0.Weight + " g/m²" : "",
    desc: String(s.ShortDescription || "").trim().replace(/([^.])$/, "$1."),
    args: [String(v0.ConstructionList || "").trim(), String(v0.FinishList || "").trim(), ...String(s.LongDescription || "").split(/\n+/).map(x => x.trim())].filter(Boolean).slice(0, 5),
    org: any("GOTS") || any("OCS100") || any("OCSBlended") || any("GOTS85") || any("GOTS80") || any("OEKOTexOrganic") ? 1 : 0,
    rec: Object.keys(v0).some(k => /^GRS/.test(k) && vars.some(v => v[k])) || any("OEKOTexRecycled") ? 1 : 0,
    oeko: vars.some(v => v.OEKOTex) ? 1 : 0, nolabel: 0, hood: /capucha/i.test(s.Type + " " + s.ShortDescription) ? 1 : 0,
    img: pics, colors, sizes, style: "", fit: s.Fit || "", neck: s.Neckline || "",
    world: s.StyleMainsSegments === "Businesswear" ? ["Negocios"] : [], created: vars.some(v => v.NewStyle) ? "2026" : "",
  });
}
writeFileSync("data/stanley.json", JSON.stringify(out));
const n = out.reduce((a, p) => a + p.colors.length, 0);
console.log(`Stanley/Stella: ${out.length} modelos, ${n} colores, ${new Set(out.flatMap(p => [...p.img, ...p.colors.flatMap(c => [c.img, ...c.views])])).size} fotos`);
