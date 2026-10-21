// Convierte el "Feed de productos" de Sol's (los dos CSV que se descargan, con sesión, en
// sologroup-spain.com → Recursos → Feed de productos → Español) en data/sols.json, con el mismo
// formato que los demás proveedores. NO guarda precios: los CSV traen tarifas y no se suben al repositorio.
// Uso: node scripts/sols-convertir.mjs <SOLOGROUP_models_new_ES.csv> <SOLOGROUP_SKU_products_new_ES.csv>
import { readFileSync, writeFileSync } from "node:fs";

const [fModels, fSkus] = process.argv.slice(2);
if (!fModels || !fSkus) { console.error("Uso: node scripts/sols-convertir.mjs models.csv sku_products.csv"); process.exit(1); }

// CSV con ; y comillas
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === "") q = true; // comillas solo al principio de un campo (un 15" dentro del texto no abre comillas)
    else if (ch === ";") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const M = parseCSV(readFileSync(fModels, "utf8"));
const S = parseCSV(readFileSync(fSkus, "utf8"));

const IMG = "https://s7g3.scene7.com/is/image/soloinvest/";
const sp = s => String(s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const title = s => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
const sizeName = z => (z === "TUN" || z === "TU" ? "Única" : z);
const sizeRank = z => { const i = SIZE_ORDER.indexOf(z); if (i >= 0) return i; const n = parseFloat(z); return isNaN(n) ? 100 : 50 + n / 100; };
const DOM = { BLANC: "Blanco", NOIR: "Negro", GRIS: "Gris", "CHINÉ": "Gris", BLEU: "Azul", VERT: "Verde", ROUGE: "Rojo", ROSE: "Rosa", ORANGE: "Naranja", JAUNE: "Amarillo", VIOLET: "Violeta", MARRON: "Marrón", BEIGE: "Beige", MULTICOLORE: "Multicolor" };
const WORLD = { Corporate: "Negocios", Sport: "Deporte", "Ropa laboral": "Ropa de trabajo", Beachwear: "Compras y playa" };

function famSub(cat, d) {
  const t = d.toLowerCase();
  switch (cat) {
    case "CAMISETA": return ["Ropa", /sin mangas|tirantes/.test(t) ? "Tirantes" : "Camisetas"];
    case "SUDADERA": return ["Ropa", "Sudaderas"];
    case "JERSEY": return ["Ropa", "Jerseys / Cárdigans"];
    case "POLO": return ["Ropa", "Polos"];
    case "CAMISA": return ["Ropa", /blusa/.test(t) ? "Camisas / Blusas" : "Camisas / Sobrecamisas"];
    case "PANTALONES": return ["Ropa", "Pantalones"];
    case "BERMUDAS Y PANTALONES CORTOS": return ["Ropa", "Bermudas / Shorts"];
    case "CHALECO ACOLCHADO": return ["Ropa", "Chalecos acolchados"];
    case "SOFTSHELL": case "CAZADORA Y PARKA": case "POLAR": case "CORTAVIENTOS": case "Chaquetas, blazers y chalecos":
      return ["Ropa", /^chaleco/.test(t) ? "Chalecos" : "Chaquetas"];
    case "DELANTAL": return ["Ropa", "Delantales"];
    case "Falda y vestido": return /vestido/.test(t) ? ["Ropa", "Vestidos"] : ["Ropa", "Faldas"];
    case "BOLSAS": return ["Equipaje", /mochila/.test(t) ? "Mochilas" : "Bolsas"];
    case "GORRA Y GORRO": return ["Headwear & Accesorios", /gorro/.test(t) ? "Gorros" : "Gorras"];
    case "TOALLA Y ALBORNOZ": return ["Línea de hogar", "Baño"];
    case "CORBATAS Y PAJARITAS": return ["Ropa Accesorios", "Corbatas"];
    case "ACCESORIO TEXTIL":
      if (/visera|gorra|gorro|bandana|sombrero/.test(t)) return ["Headwear & Accesorios", /bandana/.test(t) ? "Bandanas" : /visera/.test(t) ? "Gorras" : "Gorros"];
      if (/bufanda|braga|cuello/.test(t)) return ["Headwear & Accesorios", "Pañuelos / Bufandas / Bragas de cuello"];
      return ["Ropa Accesorios", "Accesorios"];
    default: return ["Ropa", cap(cat.toLowerCase())];
  }
}

// Variantes por modelo y color
const byParent = {};
for (const s of S) {
  const p = s["Parent product"]; if (!p) continue;
  const c = s["Color code"];
  const e = ((byParent[p] ??= {})[c] ??= { n: sp(s["Color"]), fam: s["Color family"], sizes: new Set() });
  e.sizes.add(s["Size"]);
}

const out = [];
for (const m of M) {
  const ref = m.SKU.padStart(5, "0");
  const vars = byParent[ref]; if (!vars) continue;
  const short = sp(m["Short description"]).toLowerCase();
  const model = title(sp(m["Product Name"]).replace(/^(SOL'S|NEOBLU|ATF|RTP APPAREL)\s+/i, "").replace(/\b(MEN|WOMEN|KIDS|UNISEX)\b/gi, "").trim());
  const name = cap(short) + (model && !short.includes(model.toLowerCase()) ? " " + model : "");
  const [fam, sub] = famSub(m.category, short);
  const gen = [...new Set(m.Gender.split(",").map(g => g.trim()).map(g => g === "Niño" ? "Niños" : g).filter(g => ["Hombre", "Mujer", "Unisex", "Niños"].includes(g)))];
  if (/\bkids\b/i.test(m["Product Name"])) { gen.length = 0; gen.push("Niños"); }
  if (gen.includes("Unisex")) { gen.length = 0; gen.push("Unisex"); }
  const order = m["Available colors"].split(",").map(x => x.trim()).filter(c => vars[c]);
  for (const c of Object.keys(vars)) if (!order.includes(c)) order.push(c);
  const colors = order.map(c => {
    const v = vars[c], fams = v.fam.split(",").filter(Boolean);
    return {
      code: c, n: v.n, hex: "", dom: fams.length > 2 ? ["Multicolor"] : [...new Set(fams.map(f => DOM[f]).filter(Boolean))],
      img: IMG + "n" + ref + c + "A", views: [IMG + "n" + ref + c + "B", IMG + "n" + ref + c + "C", IMG + "vc" + ref + c + "A"],
      new: m.New === "Yes" ? 1 : 0,
    };
  });
  const allSizes = [...new Set(Object.values(vars).flatMap(v => [...v.sizes]))].sort((a, b) => sizeRank(a) - sizeRank(b));
  const qual = sp(m.Quality).split(/<br\s*\/?>/i).map(sp).filter(Boolean);
  const style = sp(m.Style).split(/<br\s*\/?>/i).map(sp).filter(Boolean);
  const g = String(m["product weight"]).match(/(\d{2,4})\s*gr?\/m/i);
  const certs = k => Object.keys(m).some(h => k.test(h) && m[h]);
  const first = order[0];
  out.push({
    ref, name, fam, sub, gen, brand: sp(m.Brand) || "SOL'S", source: "sols",
    comp: qual[0] || "", peso: g ? g[1] + " g/m²" : "",
    desc: sp(m["Plus Product"]).replace(/\s+(de|by)\s+(SOL'S|NEOBLU|ATF|RTP APPAREL)\b/gi, "").replace(/\b(SOL'S|NEOBLU|ATF|RTP APPAREL)\s*/gi, "").replace(/\s{2,}/g, " ") || cap(short) + ".", args: [...qual.slice(1), ...style].slice(0, 5),
    org: certs(/^(ORGANIC|IC2 GOTS|OFG)/) || /\bBio\b/.test(m.Universe) ? 1 : 0,
    rec: certs(/^(GRS|RECYCLED|rPET)/) || !!sp(m["recycled materials"]) ? 1 : 0,
    oeko: certs(/^OEKOTEX/) ? 1 : 0,
    nolabel: /tear away|no label/i.test(m.label) ? 1 : 0,
    hood: /capucha/i.test(short + " " + style.join(" ")) ? 1 : 0,
    // fotos del modelo puestas en el primer color (sin logotipos), y las del producto como respaldo
    img: [IMG + "m" + ref + "A", IMG + "m" + ref + "B", IMG + "m" + ref + "C"], // fotos principales de Sol's (sols-fotos.mjs añade las del modelo)
    colors, sizes: allSizes.map(sizeName), style: "", fit: "",
    world: [...new Set(m.Universe.split(",").map(u => WORLD[u.trim()]).filter(Boolean))],
    created: m.New === "Yes" ? "2026" : "",
  });
}
writeFileSync("data/sols.json", JSON.stringify(out));
const fams = {}; for (const p of out) fams[p.sub] = (fams[p.sub] || 0) + 1;
console.log(`Sol's: ${out.length} modelos, ${out.reduce((a, p) => a + p.colors.length, 0)} colores`);
console.log(Object.entries(fams).sort((a, b) => b[1] - a[1]).map(x => x.join(": ")).join(" | "));
