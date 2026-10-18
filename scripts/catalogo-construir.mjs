// Convierte data/toptex.json en los archivos ligeros que usa la web:
//   data/catalogo.json      -> listado con todo lo necesario para buscar y filtrar
//   data/fichas/<cat>.json  -> descripción y detalles, que se cargan al abrir una ficha
// No incluye precios ni marcas de proveedor.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const src = JSON.parse(readFileSync("data/toptex.json", "utf8"));

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
  ["otros", "Más ropa", () => true],
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
const brandRank = b => /^(Kariban|Kariban Premium|Native Spirit)$/i.test(b || "") ? 0 : /^(Kimood|K-up|PROACT|WK)/i.test(b || "") ? 1 : 2;
const genRank = g => { g = g || []; if (g.includes("Unisex")) return 0; if (g.includes("Hombre")) return 1; if (g.includes("Mujer")) return 2; return 3; };
const GEN = { Hombre: "H", Mujer: "M", Unisex: "U", "Niños": "N", Bebes: "B" };
const COLFIX = { Mulicolor: "Multicolor", "Diseño": "Estampado" };

const brands = [...new Set(src.map(p => p.brand).filter(Boolean))].sort((a, b) => b.length - a.length);
const brandRe = brands.length ? new RegExp("\\b(" + brands.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b\\s*[®™]?", "gi") : null;
const clean = t => {
  let s = String(t || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  if (brandRe) s = s.replace(brandRe, "");
  return s.replace(/(?:\s+[A-Z0-9][\w-]*)*\s*\S*[™®]\S*/g, "").replace(/\s+([,.])/g, "$1").replace(/\s*\([\d-]+\)/g, "").replace(/["“”]/g, "").replace(/\s{2,}/g, " ").trim();
};
const stem = u => String(u || "").replace(/^https?:\/\/[^/]+\//, "").replace(/\.(jpg|png)$/i, "");
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
  const cat = CATS.find(c => c[2](p.fam, p.sub));
  const sub = SUBFIX[p.sub] || p.sub || cat[1];
  const flags = [
    p.org || p.rec ? "e" : "", p.nolabel ? "l" : "", p.big ? "x" : "", p.oeko ? "k" : "",
    colors.some(c => c.new) || (p.created && p.created >= "2026") ? "n" : "", p.hood ? "h" : "",
  ].join("");
  items.push({
    r: p.ref, n: clean(p.name), c: cat[0], s: subI(sub),
    g: [...new Set((p.gen || []).map(g => GEN[g]).filter(Boolean))].join(""),
    w: grams(p.peso), f: flags, u: usoOf(p.world).map(worldI),
    st: clean(p.style), i: stem(main),
    k: colors.map(c => [String(c.n || "").replace(/\s*\(x?\d+\)/gi, "").trim(), /^#?[0-9a-f]{6}$/i.test(c.hex || "") ? "#" + c.hex.replace("#", "") : "", [...new Set((c.dom || []).map(d => COLFIX[d] || d))].map(domI), stem(c.img)]),
    o: brandRank(p.brand) * 10 + genRank(p.gen),
    z: (p.sizes || []).length ? [p.sizes[0], p.sizes[p.sizes.length - 1]].filter((v, i, a) => a.indexOf(v) === i).join(" a ") : "",
  });
  (fichas[cat[0]] ??= {})[p.ref] = {
    d: clean(p.desc), a: (p.args || []).map(clean).filter(Boolean), comp: p.comp || "", peso: p.peso || "",
    img: (p.img || []).map(stem), sizes: p.sizes || [], fit: p.fit || "", fin: p.finish || "", neck: p.neck || "",
    pk: p.pockets || "", wp: p.waterproof || "", cert: [...(p.cert || []), p.oeko ? "OEKO-TEX" : "", p.rec ? "Materiales reciclados" : ""].filter(Boolean),
  };
}

// Orden recomendado: categorías principales primero; dentro, las prendas con más colores
const catOrder = Object.fromEntries(CATS.map((c, i) => [c[0], i]));
items.sort((a, b) => catOrder[a.c] - catOrder[b.c] || a.o - b.o || b.k.length - a.k.length);

const counts = {};
for (const it of items) counts[it.c] = (counts[it.c] || 0) + 1;
const cats = CATS.filter(c => counts[c[0]]).map(c => [c[0], c[1], counts[c[0]]]);

writeFileSync("data/catalogo.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), cats, subs: SUBS, world: WORLD, doms: DOMS, items }));
rmSync("data/fichas", { recursive: true, force: true });
mkdirSync("data/fichas", { recursive: true });
for (const [c, v] of Object.entries(fichas)) writeFileSync(`data/fichas/${c}.json`, JSON.stringify(v));
console.log(`Catálogo: ${items.length} productos en ${cats.length} categorías`);
console.log(cats.map(c => `${c[1]}: ${c[2]}`).join(" | "));
