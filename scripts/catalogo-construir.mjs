// Convierte data/toptex.json en los archivos ligeros que usa la web:
//   data/catalogo.json      -> listado con todo lo necesario para buscar y filtrar
//   data/fichas/<cat>.json  -> descripción y detalles, que se cargan al abrir una ficha
// No incluye precios ni marcas de proveedor.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const src = JSON.parse(readFileSync("data/toptex.json", "utf8"));
// Otros proveedores con el mismo formato (si existen)
for (const f of ["data/roly.json", "data/jhk.json"]) { try { src.push(...JSON.parse(readFileSync(f, "utf8"))); } catch (e) {} }

// Categorías de la web (nombre propio de Ramstex) a partir de familia/subfamilia del proveedor
const CATS = [
  ["camisetas", "Camisetas", (f, s) => f === "Ropa" && /^(Camisetas|Camisetas deportiva|Tirantes)$/.test(s)],
  ["polos", "Polos", (f, s) => f === "Ropa" && s === "Polos"],
  ["sudaderas", "Sudaderas y jerseys", (f, s) => f === "Ropa" && /^(Sudaderas|Jerseys \/ Cárdigans)$/.test(s)],
  ["chaquetas", "Chaquetas y chalecos", (f, s) => f === "Ropa" && /^(Chaquetas|Chalecos acolchados|Chalecos|Ponchos)$/.test(s)],
  ["camisas", "Camisas", (f, s) => f === "Ropa" && /^Camisas/.test(s)],
  ["pantalones", "Pantalones y shorts", (f, s) => f === "Ropa" && /^(Pantalones|Bermudas \/ Shorts|Vaqueros|Faldas)$/.test(s)],
  ["trabajo", "Ropa de trabajo y hostelería", (f, s) => f === "Ropa" && /^(Delantales|Batas de trabajo|Túnicas|Petos|Monos)$/.test(s)],
  ["gorras", "Gorras y gorros", (f) => f === "Headwear & Accesorios"],
  ["bolsas", "Bolsas y mochilas", (f) => f === "Equipaje"],
  ["calzado", "Calzado", (f) => f === "Calzado y accesorios"],
  ["interior", "Ropa interior y calcetines", (f) => f === "Ropa interior"],
  ["hogar", "Hogar", (f) => f === "Línea de hogar"],
  ["complementos", "Complementos", (f) => /^(Ropa Accesorios|Accesorios|Equipamientos deportivos)$/.test(f)],
  ["otros", "Más ropa", (f) => f !== "Merchandising"],
  // Apartado de Merchandising (Stamina): la categoría viene ya decidida en p.merch
  ["m-tec", "Tecnología", null], ["m-esc", "Escritura y oficina", null], ["m-taz", "Tazas, botellas y menaje", null],
  ["m-bol", "Bolsas, mochilas y viaje", null], ["m-eve", "Ferias, fiestas y eventos", null], ["m-ver", "Verano y playa", null],
  ["m-inv", "Invierno y lluvia", null], ["m-dep", "Deporte y cuidado personal", null], ["m-hog", "Hogar y regalos", null],
  ["m-out", "Herramientas, coche y outdoor", null], ["m-nav", "Navidad", null],
];
// Nombres de subfamilia más claros
const SUBFIX = {
  "Camisetas deportiva": "Camisetas deportivas", "Camisas / Sobrecamisas": "Camisas y sobrecamisas", "Camisas / Blusas": "Blusas",
  "Jerseys / Cárdigans": "Jerseys y cárdigans", "Bermudas / Shorts": "Bermudas y shorts", "Boxers / Caleçons": "Bóxers",
  "Ropas interior": "Ropa interior", "Poches d'identité": "Portadocumentos", "Bandes réfléchissantes": "Bandas reflectantes",
  "Gorro Bobs": "Gorros bob", "Pañuelos / Bufandas / Bragas de cuello": "Bufandas y bragas de cuello", "Sombreros & accesorios": "Sombreros",
  "Cintas Cabeza": "Cintas para la cabeza", "Zapatos Lifestyle / Ocio": "Zapatillas y ocio", "Calzado de Seguridad": "Calzado de seguridad",
  "Accesorios Equipaje": "Accesorios de viaje", "Sujetadores Deporte": "Sujetadores deportivos", "Tirantes": "Camisetas de tirantes",
};
// "Uso o sector": agrupa los sectores del proveedor en pocos grupos claros
const USO = [
  ["Empresas y uniformes", /^(Recepción|Negocios|Venta al por menor|Artesanía y comercio|Distribución logística)$/],
  ["Ropa de trabajo y seguridad", /^(Ropa de trabajo|EPI|Industria y seguridad|Jardinería y bricolaje|Logística Instalación Seguridad)/],
  ["Hostelería y restauración", /^(CHR y profesiones de la restauración|Restauración)$/],
  ["Eventos y merchandising", /^(Promoción y organización de eventos|Medios de comunicación y merchandising|Souvenir y licencias|Festivales|Fan Zone|Turismo y cultura)/],
  ["Deporte y equipos", /^(Deporte|Deportes|Después del partido|Antes del partido|Entrenamiento|Jugadores|Clubes Deportivos|Aficionados|Multideporte|Uniforme deportivo)/],
  ["Colegios y universidades", /^(Escuela y universidad|Schoolwear)$/],
  ["Viaje, playa y camping", /^(Compras y playa|Viaje|Campings|Tiendas de temporada)$/],
  ["Navidad", /^(Navidad|Espíritu navideño)$/],
  ["Salud y belleza", /^Salud/],
];
const usoOf = list => [...new Set((list || []).map(w => (USO.find(u => u[1].test(w)) || [])[0]).filter(Boolean))];
// Orden recomendado: primero la gama principal (Kariban), adultos antes que infantil
const brandRank = b => /^(Kariban|Kariban Premium|Native Spirit)$/i.test(b || "") ? 0 : /^(Kimood|K-up|PROACT|WK|Roly|Stamina)/i.test(b || "") ? 1 : 2;
const genRank = g => { g = g || []; if (g.includes("Unisex")) return 0; if (g.includes("Hombre")) return 1; if (g.includes("Mujer")) return 2; return 3; };
// Manga, cuello y corte (fit): del dato del proveedor o, si falta, del nombre y la descripción
const nrm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const TOPS = new Set(["camisetas", "polos", "sudaderas", "camisas", "trabajo", "otros"]);
function sleeveOf(p, cat) {
  if (!TOPS.has(cat) && cat !== "chaquetas") return "";
  const a = nrm(p.name + " " + p.style), d = nrm(p.desc);
  for (const t of [a, d]) {
    if (/sin mangas|tirantes|\bdesmangad/.test(t)) return "Sin mangas";
    if (/mangas? larga|manga 3\/4|mangas 3\/4/.test(t)) return "Manga larga";
    if (/mangas? corta/.test(t)) return "Manga corta";
  }
  if (cat === "camisetas" || cat === "polos") return "Manga corta";
  if (cat === "sudaderas" || cat === "chaquetas") return "Manga larga";
  return "";
}
function neckOf(p, cat) {
  if (cat === "chaquetas") return p.hood ? "Con capucha" : "";
  if (!TOPS.has(cat)) return "";
  if (p.hood) return "Con capucha";
  const nk = nrm(p.neck), t = nrm(p.name + " " + p.style + " " + p.desc.slice(0, 220));
  const all = nk + " " + t;
  if (/cremallera/.test(nk) || /(1\/4|cuarto de) cremallera|cuello con cremallera|media cremallera/.test(t)) return "Cuello con cremallera";
  if (/pico|cuello en v\b|cuello v\b/.test(all)) return "Cuello de pico";
  if (/chimenea|cuello alto|cuello vuelto|cuello cisne/.test(all)) return "Cuello alto";
  if (/mao|mandarin/.test(all)) return "Cuello mao";
  if (cat === "polos" || /botones/.test(nk)) return cat === "camisas" ? "Cuello camisero" : "Cuello polo";
  if (cat === "camisas") return "Cuello camisero";
  if (/redondo|barco|marinero/.test(all) || cat === "camisetas") return "Cuello redondo";
  if (cat === "sudaderas") return "Cuello redondo";
  return "";
}
function fitOf(p) {
  const f = nrm(p.fit), t = nrm(p.name + " " + p.style);
  if (/oversize|amplio|loose|holgad/.test(f + " " + t)) return "Oversize / amplio";
  if (/slim|entallad|skinny|ajustad|cenid/.test(f + " " + t)) return "Entallado / slim";
  if (/recto|regular|confortable|clasic/.test(f)) return "Regular / recto";
  return "";
}
const GEN = { Hombre: "H", Mujer: "M", Unisex: "U", "Niños": "N", Bebes: "B" };
const COLFIX = { Mulicolor: "Multicolor", "Diseño": "Estampado" };

const brands = [...new Set(src.map(p => p.brand).filter(Boolean))].sort((a, b) => b.length - a.length);
const brandRe = brands.length ? new RegExp("\\b(" + brands.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b\\s*[®™]?", "gi") : null;
const clean = t => {
  let s = String(t || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  if (brandRe) s = s.replace(brandRe, "");
  return s.replace(/(?:\s+[A-Z0-9][\w-]*)*\s*\S*[™®]\S*/g, "").replace(/\s+([,.])/g, "$1").replace(/\s*\([\d-]+\)/g, "").replace(/["“”]/g, "").replace(/\s{2,}/g, " ").trim();
};
const stem = u => { u = String(u || ""); if (/resources\.jhktshirt\.com\/pictures\//.test(u)) return "J:" + u.replace(/^.*resources\.jhktshirt\.com\/pictures\//, "").replace(/\.(jpg|png)(\?.*)?$/i, ""); if (/static\.gorfactory\.es\/images\/models\//.test(u)) return "R:" + u.replace(/^.*\/images\/models\//, "").replace(/\.(jpg|png)$/i, ""); return u.replace(/^https?:\/\/[^/]+\//, "").replace(/\.(jpg|png)$/i, ""); };
const grams = t => { const m = String(t || "").match(/(\d+)/); return m ? +m[1] : 0; };

const idx = arr => v => { let i = arr.indexOf(v); if (i < 0) { arr.push(v); i = arr.length - 1; } return i; };
const SUBS = [], WORLD = [], DOMS = [];
const subI = idx(SUBS), worldI = idx(WORLD), domI = idx(DOMS);

const items = [], fichas = {};
const seen = new Set();
for (const p of src) {
  if (!p.ref || seen.has(p.ref)) continue;
  const colors = (p.colors || []).filter(c => c.img || c.n);
  const main = p.img?.[0] || colors[0]?.img;
  if (!main) continue; // sin ninguna foto no se publica
  seen.add(p.ref);
  const cat = p.merch ? CATS.find(c => c[0] === p.merch) : CATS.find(c => c[2] && c[2](p.fam, p.sub));
  if (!cat) continue;
  if (p.merch) {
    // Stamina pone el color al final del nombre ("Mochila Dronte negro"): se quita
    for (const c of p.colors || []) { const cn = nrm(c.n); if (cn && nrm(p.name).endsWith(" " + cn)) { p.name = p.name.slice(0, p.name.length - c.n.length).trim(); break; } }
    p.name = p.name.replace(/\s+(natural|negro|blanco|plata|transparente|surtido|multicolor|azul|rojo|verde|gris|dorado|marrón|marron)$/i, "");
    p.sub = ({ "Christmas": "Navidad", "Premium & tools": "Herramientas", "Packaging especiales": "Packaging", "Summer": "Verano", "Colegiales": "Infantil" })[p.sub] || p.sub;
    const FIX = { baterias: "baterías", informatica: "informática", termicas: "térmicas", articulos: "artículos", "accesorios coctels": "coctelería", boton: "botón", camping: "camping" };
    p.sub = String(p.sub || "").replace(/[a-záéíóúñ ]+/gi, w => FIX[w.toLowerCase()] ? (w[0] === w[0].toUpperCase() ? FIX[w.toLowerCase()].charAt(0).toUpperCase() + FIX[w.toLowerCase()].slice(1) : FIX[w.toLowerCase()]) : w)
      .split(" ").map(w => FIX[w.toLowerCase()] ? (w[0] === w[0].toUpperCase() ? FIX[w.toLowerCase()].charAt(0).toUpperCase() + FIX[w.toLowerCase()].slice(1) : FIX[w.toLowerCase()]) : w).join(" ");
  }
  const sub = SUBFIX[p.sub] || p.sub || cat[1];
  const flags = [
    p.org || p.rec ? "e" : "", p.nolabel ? "l" : "", p.big ? "x" : "", p.oeko ? "k" : "",
    colors.some(c => c.new) || (p.created && p.created >= "2026") ? "n" : "", p.hood ? "h" : "",
  ].join("");
  items.push({
    r: p.ref, n: clean(p.name), c: cat[0], s: subI(sub), ...(p.alt?.length ? { v: p.alt } : {}),
    g: [...new Set((p.gen || []).map(g => GEN[g]).filter(Boolean))].join(""),
    w: grams(p.peso), f: flags, u: usoOf(p.world).map(worldI),
    st: clean(p.style), i: stem(main),
    k: colors.map(c => [String(c.n || "").replace(/\s*\(x?\d+\)/gi, "").trim(), /^#?[0-9a-f]{6}$/i.test(c.hex || "") ? "#" + c.hex.replace("#", "") : "", [...new Set((c.dom || []).map(d => COLFIX[d] || d))].map(domI), stem(c.img)]),
    o: brandRank(p.brand) * 10 + genRank(p.gen),
    m: sleeveOf(p, cat[0]), cu: neckOf(p, cat[0]), ft: fitOf(p),
    z: (p.sizes || []).length ? [p.sizes[0], p.sizes[p.sizes.length - 1]].filter((v, i, a) => a.indexOf(v) === i).join(" a ") : "",
  });
  (fichas[cat[0]] ??= {})[p.ref] = {
    d: clean(p.desc), a: (p.args || []).map(clean).filter(Boolean), comp: p.comp || "", peso: p.peso || "",
    img: (p.img || []).map(stem), sizes: p.sizes || [], cv: colors.map(c => (c.views || []).map(stem)), cc: colors.map(c => c.code || ""), src: p.source || "toptex", fit: p.fit || "", fin: p.finish || "", neck: p.neck || "",
    pk: p.pockets || "", wp: p.waterproof || "", cert: [...(p.cert || []), p.oeko ? "OEKO-TEX" : "", p.rec ? "Materiales reciclados" : ""].filter(Boolean),
  };
}

// Productos repetidos. Se unen en una sola ficha:
//  - la misma prenda en versión orgánica (ORG) y "en conversión" (IC);
//  - la misma foto con el mismo nombre salvo cantidades o medidas (p. ej. toallas 30x50 / 50x100).
// No se unen productos distintos que comparten foto (un conjunto: chaqueta y pantalón, leggings y top…).
{
  let H = {};
  try { H = JSON.parse(readFileSync("data/huellas.json", "utf8")); } catch (e) {}
  const nameKey = n => nrm(n).replace(/\bic\b/g, "").replace(/[\d.,]+\s*(x\s*[\d.,]+)?\s*(cm|mm|ml|l|m|g|unidades|uds?)?\b/g, "").replace(/[-–(),]/g, " ").replace(/\s+/g, " ").trim();
  const keyOf = it => {
    const base = it.r.replace(/(ORG|IC)$/, "");
    if (base !== it.r) return "ref:" + base;
    const h = H[it.r]?.h;
    return h ? "img:" + h + "|" + it.c + "|" + nameKey(it.n) : "ref:" + it.r;
  };
  const groups = new Map();
  for (const it of items) { const k = keyOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const keep = new Set();
  for (const g of groups.values()) {
    g.sort((a, b) => b.k.length - a.k.length || (/ORG$/.test(b.r) - /ORG$/.test(a.r)) || a.r.localeCompare(b.r));
    const main = g[0]; keep.add(main);
    if (g.length > 1) {
      main.v = [...(main.v || []), ...g.slice(1).flatMap(x => [x.r, ...(x.v || [])])];
      main.n = main.n.replace(/\s+IC\b/, "");
      if (g.some(x => !/(ORG|IC)$/.test(x.r))) main.n = main.n.replace(/\s*-?\s*\d+\s*x\s*\d+\s*cm\b/i, "").replace(/\bde \d+ /i, "de ");
      main.n = main.n.replace(/\s{2,}/g, " ").trim();
      console.log("  unidos:", [main.r, ...main.v].join(" + "), "·", main.n);
    }
  }
  const before = items.length;
  for (let i = items.length - 1; i >= 0; i--) if (!keep.has(items[i])) items.splice(i, 1);
  console.log(`Repetidos unidos: ${before - items.length}`);
}

// Orden recomendado: categorías principales primero; dentro, las prendas con más colores
const catOrder = Object.fromEntries(CATS.map((c, i) => [c[0], i]));
items.sort((a, b) => catOrder[a.c] - catOrder[b.c] || a.o - b.o || b.k.length - a.k.length);

const counts = {};
for (const it of items) counts[it.c] = (counts[it.c] || 0) + 1;
const cats = CATS.filter(c => counts[c[0]]).map(c => [c[0], c[1], counts[c[0]], c[0].startsWith("m-") ? 1 : 0]);

writeFileSync("data/catalogo.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), cats, subs: SUBS, world: WORLD, doms: DOMS, items }));
rmSync("data/fichas", { recursive: true, force: true });
mkdirSync("data/fichas", { recursive: true });
for (const [c, v] of Object.entries(fichas)) writeFileSync(`data/fichas/${c}.json`, JSON.stringify(v));
console.log(`Catálogo: ${items.length} productos en ${cats.length} categorías`);
console.log(cats.map(c => `${c[1]}: ${c[2]}`).join(" | "));
