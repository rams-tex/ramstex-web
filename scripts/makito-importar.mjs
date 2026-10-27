// Importa el catálogo de Makito (merchandising) desde su API B2B a data/makito.json, con el formato de los demás
// proveedores. SIN precios. Solo lectura: login + /catalog/files (+ /print-config/files para las zonas de marcaje).
// Las fotos de Makito solo se pueden descargar con token (no se pueden enlazar): se guardan con el prefijo "K:"
// y scripts/makito-fotos.mjs las descarga y las sirve desde ramstex.com/mk/.
// Credenciales: secretos MAKITO_CLIENT_ID / MAKITO_CLIENT_SECRET.
import { writeFileSync, mkdirSync } from "node:fs";
import { makitoLogin, makitoGet } from "./makito-api.mjs";

await makitoLogin();
const cat = await makitoGet("/catalog/files?format=JSON&lang=es");
const prods = cat.products || [];
if (prods.length < 1000) throw new Error("Catálogo de Makito demasiado pequeño: " + prods.length);
let print = { products: [], positions: [], techniques: [] };
try { print = await makitoGet("/print-config/files?format=JSON&lang=es"); } catch (e) { console.log("Sin configuración de marcaje:", e.message); }

const nrm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const capWords = s => String(s || "").toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// ---------- Categorías ----------
// Makito da varias rutas "Produccion > PRODUCTOS > Familia > Subfamilia > Tipo"; las genéricas no sirven para clasificar
const GENERIC = /^(Novedades|NOVEDADES|Catálogos|Ofertas Únicas|Premium Line|Artículos sostenibles|Home .*|Materiales|Técnicas de marcaje|Spain Line)$/;
const pathsOf = p => (p.categories || []).map(c => c.replace(/^Produccion > (PRODUCTOS > )?/, "").split(" > ").map(s => s.trim()))
  .filter(a => a.length && !GENERIC.test(a[0]) && !(a[0] === "Verano y playa" && a[1] === "TEMPORADA OUTDOOR"));
// Familia de Makito -> categoría de merchandising de la web
const FAM = {
  "Tecnología y accesorios": "m-tec",
  "Escritura": "m-esc", "Blocs, libretas y notas adhesivas": "m-esc", "Oficina y negocios": "m-esc",
  "Drinkware": "m-taz", "Take away": "m-taz", "Bar, Vino y Hotel": "m-hog",
  "Mochilas": "m-bol", "Bolsas": "m-bol", "Viaje": "m-bol",
  "Eventos y fiesta": "m-eve", "Verano y playa": "m-ver", "Llúvia y frío": "m-inv",
  "Deporte": "m-dep", "Cuidado personal y pharma": "m-dep",
  "Decoración y Hogar": "m-hog", "Regalos y premiums": "m-hog", "Infantil": "m-hog", "Packaging": "m-hog",
  "Herramientas y Bricolaje": "m-out", "Outdoor": "m-out", "Agricultura": "m-out", "Mascotas": "m-out",
  "Navidad": "m-nav", "Sublimación": "m-taz",
};
function merchOf(path) {
  const [f, s = "", t = ""] = path;
  if (f === "Take away" && s === "Neveras") return "m-ver";
  if (f === "Bar, Vino y Hotel" && /Vasos|Set de bebida|Enfriadores/.test(t)) return "m-taz";
  if (f === "Deporte" && /World Cup/.test(s)) return "m-eve";
  if (f === "Oficina y negocios" && /Lanyards|Identificadores/.test(t)) return "m-eve";
  if (f === "Sublimación" && !/circular/i.test(s)) return "m-hog";
  if (f === "Gorras y sombreros") return /Sombreros/.test(s) ? "m-ver" : null; // las gorras van a la ropa
  return FAM[f] || null;
}
// Ropa (Textil y gorras): familia/subfamilia con los nombres que usan los demás proveedores
function ropaOf(p, paths) {
  const t = nrm(p.type), all = paths.map(a => a.join(" > ")).join(" | ");
  const isTextil = paths.some(a => a[0] === "Textil") || /Textil para sublimación/.test(all);
  const isGorra = paths.some(a => a[0] === "Gorras y sombreros" && a[1] === "Gorras");
  if (isGorra || (/^(gorra|visera)\b/.test(t) && !paths.length)) return ["Headwear & Accesorios", /visera/.test(t) ? "Viseras" : "Gorras"];
  if (!isTextil) return null;
  if (/^camiseta/.test(t)) return ["Ropa", /tirantes/.test(t) ? "Tirantes" : /tecnic|deport|sport/.test(nrm(p.type + " " + p.name + " " + p.description)) ? "Camisetas deportiva" : "Camisetas"];
  if (/^polo/.test(t)) return ["Ropa", "Polos"];
  if (/^sudadera/.test(t)) return ["Ropa", "Sudaderas"];
  if (/^chaleco/.test(t)) return ["Ropa", "Chalecos"];
  if (/^(chaqueta|parka|softshell|cortavientos|polar|anorak|forro)/.test(t)) return ["Ropa", "Chaquetas"];
  if (/^(pantalon|bermuda|short|malla)/.test(t)) return ["Ropa", /pantalon/.test(t) ? "Pantalones" : "Bermudas / Shorts"];
  if (/^camisa/.test(t)) return ["Ropa", "Camisas / Sobrecamisas"];
  if (/^(delantal)/.test(t)) return ["Ropa", "Delantales"];
  if (/^(toalla|manta|albornoz)/.test(t)) return null; // va a merchandising (hogar)
  if (/^(braga|bufanda|guante|gorro)/.test(t)) return null; // invierno (merch)
  return null;
}
// Si no hay ruta útil, por el tipo de producto
const BYTYPE = [
  ["m-tec", /power bank|cargador|cable|altavoz|auricular|usb|memoria|raton|alfombrilla|soporte movil|smartwatch|reloj|lampara|camara|adaptador|hub|localizador/],
  ["m-esc", /boligrafo|lapiz|lapices|portaminas|rotulador|marcador|libreta|bloc|cuaderno|agenda|carpeta|portadocumentos|estuche|regla|subrayador|calculadora|calendario|lanyard/],
  ["m-taz", /taza|vaso|bidon|botella|termo|fiambrera|cubiertos|jarra|copa|pajita/],
  ["m-bol", /bolsa|mochila|bolso|trolley|maleta|neceser|rinonera|bandolera|portatodo|petate|saco/],
  ["m-inv", /paraguas|poncho|braga|bufanda|guante|gorro|manta/],
  ["m-ver", /gafas sol|abanico|hinchable|toalla playa|pareo|esterilla|chancla|sombrero|nevera|pelota playa|frisbee/],
  ["m-dep", /toalla|balon|cuerda|banda elastica|botiquin|cepillo|espejo|balsamo|manicura|gel|mascarilla/],
  ["m-out", /navaja|linterna|multiherramienta|flexometro|herramienta|rascador|parasol|brujula|mascota|comedero/],
  ["m-nav", /navidad|navideno|arbol|adorno|bola navidad/],
  ["m-eve", /pulsera|bandera|medalla|trofeo|identificador|silbato|matasuegras|chapa|pin\b/],
];
const typeMerch = p => (BYTYPE.find(([, re]) => re.test(nrm(p.type + " " + p.name))) || ["m-hog"])[0];

// ---------- Colores ----------
// Makito no da el nombre del color: va al final del nombre de la variante ("Cámara Deportiva Komir Rojo", "Polo ... Blanco XS").
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "XXXL", "4XL", "5XL"];
const sizeRank = s => { const b = String(s).replace(/\s*\(.*\)$/, "").toUpperCase(); const i = SIZE_ORDER.indexOf(b); if (i >= 0) return i; const n = parseFloat(b); return isNaN(n) ? 100 : 20 + n / 100; };
const sizeList = p => String(p.sizes || "").split(",").map(s => s.trim()).filter(Boolean);
function tailOf(p, v) {
  let w = String(v.variant_name || "").replace(/\s+S\/T$/i, "").trim().split(/\s+/);
  const sizes = new Set(sizeList(p).map(nrm));
  while (w.length > 1 && (sizes.has(nrm(w[w.length - 1])) || /^(\d{1,2}(-\d{1,2})?|x{0,3}[sml]|[2-6]xl|s\/t)$/i.test(w[w.length - 1]))) w.pop();
  const own = new Set(nrm(p.type + " " + p.name + " " + (p.brand || "")).split(/[ /]+/));
  const tail = [];
  for (let i = w.length - 1; i > 0; i--) { const n = nrm(w[i]); if (!n || own.has(n)) break; tail.unshift(w[i]); }
  return tail.join(" ");
}
// Nombre más habitual de cada código de color en todo el catálogo
const codeNames = {};
for (const p of prods) for (const v of p.variants || []) {
  const t = tailOf(p, v); if (!t || t.split(" ").length > 3) continue;
  const m = (codeNames[v.variant_colorcode] ??= {}); const k = capWords(t); m[k] = (m[k] || 0) + 1;
}
const CODE = Object.fromEntries(Object.entries(codeNames).map(([c, m]) => [c, Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]]));
// Abreviaturas de Makito en los colores ("Azul Cl", "Amarillo F.", "Ver Menta")
const ABBR = { cl: "Claro", "cl.": "Claro", os: "Oscuro", "os.": "Oscuro", osc: "Oscuro", "osc.": "Oscuro", f: "Flúor", "f.": "Flúor", fluor: "Flúor", fluo: "Flúor", ver: "Verde", az: "Azul", am: "Amarillo", nat: "Natural", tr: "Transparente", trans: "Transparente", "trans.": "Transparente", met: "Metalizado", "met.": "Metalizado", gr: "Gris", mar: "Marino", roj: "Rojo", neg: "Negro", bla: "Blanco",
  marron: "Marrón", beig: "Beige", limon: "Limón", sandia: "Sandía", corazon: "Corazón", traslucido: "Translúcido", arbol: "Árbol", futbol: "Fútbol", platano: "Plátano", raton: "Ratón", cafe: "Café", caqui: "Caqui", kaki: "Caqui", fluor: "Flúor", purpura: "Púrpura", lavanda: "Lavanda", bambu: "Bambú", cesped: "Césped", rinon: "Riñón", jamon: "Jamón", balon: "Balón", pinguino: "Pingüino", leon: "León" };
const fixColor = n => n.replace(/\s*\/\s*/g, "/").split(/(\/| )/).map(w => ABBR[w.toLowerCase()] || w).join("").replace(/\bFairtrade\s+/i, "");
function colorName(p, v) {
  const code = v.variant_colorcode;
  if (!code || code === "000") return "Único";
  const t = capWords(tailOf(p, v)), canon = CODE[code];
  return fixColor(canon || (t && t.split(" ").length <= 3 ? t : "") || "Único");
}
const HEX = [
  [/^amarillo fluor/, "e6f53a"], [/^naranja fluor/, "ff7a1a"], [/^verde fluor/, "5ef03c"], [/^rosa fluor/, "ff4fa3"],
  [/^blanco|^white|natural claro/, "ffffff"], [/^negro/, "1a1a1a"], [/^rojo/, "d32f2f"], [/^azul claro|^celeste|^cielo/, "7ec8e3"], [/^marino/, "1f2a44"],
  [/^royal|^azul royal/, "2459c4"], [/^azul/, "1e6fd9"], [/^verde claro|^verde lima|^lima/, "9ccc3c"], [/^verde/, "2e8b3e"], [/^amarillo/, "f7d117"],
  [/^naranja/, "f57c00"], [/^rosa|^fucsia/, "e84a8a"], [/^morado|^lila|^violeta|^purpura/, "7b3fa0"], [/^gris oscuro|^gris marengo|^antracita/, "4a4a4a"],
  [/^gris/, "9e9e9e"], [/^plata|^plateado/, "c0c0c0"], [/^dorado|^oro/, "c9a227"], [/^marron|^chocolate/, "6d4c33"], [/^beige|^crema|^arena/, "e3d5b8"],
  [/^natural/, "e8dcc2"], [/^madera|^bambu|^corcho/, "c49a6c"], [/^transparente|^cristal/, ""], [/^burdeos|^granate/, "7b1f2e"], [/^turquesa|^cian/, "1fb5b5"],
];
const DOM = [["Blanco", /^blanco|white/], ["Negro", /^negro/], ["Gris", /^gris|plat|antracita/], ["Azul", /azul|marino|royal|celeste|turquesa|cielo/], ["Rojo", /^rojo|burdeos|granate/],
  ["Verde", /verde|lima/], ["Amarillo", /amarillo|dorado|oro\b/], ["Naranja", /naranja/], ["Rosa", /rosa|fucsia/], ["Violeta", /morado|lila|violeta|purpura/],
  ["Marrón", /marron|chocolate|madera|bambu|corcho/], ["Beige", /beige|natural|crema|arena/]];
const hexOf = n => { const s = nrm(n); const h = HEX.find(x => x[0].test(s)); return h ? h[1] : ""; };
const domOf = n => { const s = nrm(n); if (/\//.test(s)) return ["Multicolor"]; return DOM.filter(d => d[1].test(s)).map(d => d[0]).slice(0, 2); };

// Erratas de Makito en sus subcategorías
const SUBFIX = { "Acceosrios de bebida": "Accesorios de bebida", "Acceosrios para el frío": "Accesorios para el frío", "Jueguetes mascotas": "Juguetes para mascotas", "Shoftshells": "Softshells",
  "Herramientras automóvil": "Herramientas de automóvil", "Brosas non-woven": "Bolsas non-woven", "Polsas de RPET": "Bolsas de RPET", "Cuidad personal y pharma": "Cuidado personal",
  "Cargadores inalambricos": "Cargadores inalámbricos", "Camaras": "Cámaras", "Lamparas": "Lámparas", "Picninc": "Pícnic", "Vasos, jarrar y copas": "Vasos, jarras y copas",
  "Gadget": "Gadgets", "Llavero": "Llaveros", "Hotel": "Hotel y alojamiento" };
const subName = s => { s = String(s || "").replace(/^Más\s+/i, "").trim(); s = SUBFIX[s] || s; return cap(s); };

// ---------- Fotos ----------
// "https://apis.makito.es/catalog/assets/15246/15246003000/principal/5246-003-P.jpg" -> "K:5246-003-P" (se sirve en /mk/5246-003-P.webp)
const ASSETS = {};
const kst = u => {
  const m = String(u || "").match(/\/catalog\/assets\/(.+?)\/([^/]+?)\.(jpe?g|png|webp)$/i); if (!m) return "";
  const id = m[2].replace(/[^\w.-]/g, "_"); ASSETS[id] = m[1] + "/" + m[2] + "." + m[3]; return "K:" + id;
};
const cleanTxt = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// ---------- Zonas de marcaje (para la ficha; sin precios) ----------
const POS = Object.fromEntries((print.positions || []).map(x => [String(x.id), x.description]));
const TECH = {}; for (const t of print.techniques || []) { const id = String(t.id).split("_")[0]; if (!TECH[id] || /ANTIGUO/.test(TECH[id].rawId)) TECH[id] = { cat: t.category, d: t.description, max: t.maximumColors, full: t.fullColor === "true", rawId: t.id }; }
const AREAS = Object.fromEntries((print.products || []).map(x => [String(x.id), x.areas || []]));
const techOf = s => String(s || "").split(",").map(x => { const m = x.trim().match(/^(\d+)(?:\((\d+)\))?$/); if (!m) return null; const t = TECH[m[1]]; return t ? { c: t.cat, n: t.d, col: m[2] ? +m[2] : (t.full ? 0 : t.max) } : null; }).filter(Boolean);

const out = [], skipped = {};
for (const p of prods) {
  const vars = (p.variants || []).filter(v => v.variant_reference);
  if (!vars.length) { skipped["sin variantes"] = (skipped["sin variantes"] || 0) + 1; continue; }
  const paths = pathsOf(p);
  const ropa = ropaOf(p, paths);
  let merch = null, mpath = paths[0];
  if (!ropa) { for (const a of paths) { merch = merchOf(a); if (merch) { mpath = a; break; } } merch ||= typeMerch(p); }
  // Colores (un color por código; las tallas de la ropa comparten foto)
  const byColor = new Map();
  for (const v of vars) {
    const code = v.variant_colorcode || "000";
    if (!byColor.has(code)) byColor.set(code, { v, sizes: new Map() });
    byColor.get(code).sizes.set(v.variant_size || "000", 1);
  }
  const colors = [...byColor.entries()].map(([code, { v }]) => {
    const n = colorName(p, v);
    return { code, n, hex: hexOf(n), dom: code === "000" ? [] : domOf(n), img: kst(v.variant_image) || "", views: [], new: p.web_new ? 1 : 0 };
  });
  const main = kst(p.image);
  const details = (p.detail_images || []).map(kst).filter(Boolean).slice(0, 3);
  // Foto principal: la de grupo (todos los colores) si hay varios colores; si solo hay uno, la de ese color
  const img = [...new Set([colors.length > 1 || !colors[0]?.img ? main : colors[0].img, ...details].filter(Boolean))];
  if (!img.length && !colors.some(c => c.img)) { skipped["sin fotos"] = (skipped["sin fotos"] || 0) + 1; continue; }
  // Tallas (solo ropa)
  const sizecodes = {};
  if (ropa) {
    const names = sizeList(p).sort((a, b) => sizeRank(a) - sizeRank(b));
    const codes = [...new Set(vars.map(v => v.variant_size).filter(s => s && s !== "000"))].sort();
    for (const v of vars) if (v.variant_size && v.variant_size !== "000") {
      const w = String(v.variant_name || "").trim().split(/\s+/); const last = w[w.length - 1];
      const hit = names.find(s => nrm(s.replace(/\s*\(.*\)$/, "")) === nrm(last) || nrm(s) === nrm(last));
      if (hit) sizecodes[v.variant_size] = hit;
    }
    if (Object.keys(sizecodes).length < codes.length && codes.length === names.length) codes.forEach((c, i) => sizecodes[c] ??= names[i]);
  }
  const sizes = ropa ? [...new Set(Object.values(sizecodes))].sort((a, b) => sizeRank(a) - sizeRank(b)) : [];
  // Nombre: "Cámara Deportiva" + "Komir" -> "Cámara deportiva Komir"
  const type = cap(String(p.type || "").trim().toLowerCase().replace(/\s+adulto\b/, "").replace(/\busb\b/g, "USB").replace(/\brpet\b/g, "RPET").replace(/\bmp3\b/g, "MP3").replace(/\bled\b/g, "LED").replace(/\bpvc\b/g, "PVC"));
  const model = String(p.name || "").replace(/["“”]/g, "").trim();
  const name = (nrm(model).startsWith(nrm(type)) ? model : `${type} ${model}`).replace(/\s+/g, " ").trim();
  const all = paths.map(a => a.join(" > ")).join(" | ");
  const gen = ropa ? [/niñ|infantil|junior|kids/i.test(p.type + " " + all) ? "Niños" : /mujer|señora|woman|lady/i.test(p.type + " " + all) ? "Mujer" : "Unisex"] : [];
  const dims = [["Largo", p.length], ["Alto", p.height], ["Ancho", p.width], ["Diámetro", p.diameter]].filter(x => +x[1] > 0).map(x => `${x[0]} ${+(x[1] / 10).toFixed(1)} cm`).join(" · ");
  const areas = (AREAS[String(p.ref)] || []).map(a => ({ id: a.id, pos: POS[String(a.position)] || "", w: a.width, h: a.height, t: techOf(a.techniques) }));
  const techs = [...new Set(areas.flatMap(a => a.t.map(t => t.c)).filter(Boolean))];
  const material = cleanTxt(p.material);
  const desc = cleanTxt(p.description);
  out.push({
    ref: "MK" + String(p.web_reference || p.ref), name, fam: ropa ? ropa[0] : "Merchandising", sub: ropa ? ropa[1] : subName(mpath?.[2] || mpath?.[1] || type || "Varios"), _ts: !ropa && !mpath ? 1 : 0,
    gen, brand: p.brand ? capWords(p.brand) : "Makito", source: "makito",
    comp: material, peso: ropa && /(\d{2,3})\s*g\s*\/\s*m/i.test(material) ? material.match(/(\d{2,3})\s*g\s*\/\s*m/i)[1] + " g/m²" : "",
    desc: desc && !/[.!?]$/.test(desc) ? desc + "." : desc,
    args: [material ? "Material: " + material : "", dims ? "Medidas: " + dims : "", techs.length ? "Marcaje: " + techs.join(", ").toLowerCase() : "", (p.batteries || []).length ? "Incluye batería" : "", /stock|necesidad|comercial/i.test(p.observations || "") ? "" : cleanTxt(p.observations)].filter(Boolean).slice(0, 5),
    org: /reciclad|rpet|organic|orgánic|bambú|bambu|corcho|caña de trigo|fairtrade/i.test(material + " " + all) || paths.some(a => a[0] === "Artículos sostenibles") || (p.categories || []).some(c => /Artículos sostenibles|Materiales >/.test(c)) ? 1 : 0,
    rec: /reciclad|rpet/i.test(material) ? 1 : 0, oeko: 0, nolabel: 0, hood: /capucha/i.test(p.type + " " + desc) ? 1 : 0, big: sizes.some(s => /^[3-9]XL$/.test(s)) ? 1 : 0,
    img, colors, sizes, sizecodes, style: "", fit: "", neck: "", finish: "", pockets: "", waterproof: /impermeable/i.test(desc) ? "Sí" : "", cert: [],
    world: [], created: p.web_new ? "2026" : "", alt: [String(p.web_reference || p.ref)], mref: String(p.ref),
    ...(merch ? { merch } : {}), areas, assets: Object.fromEntries([...img, ...colors.map(c => c.img)].filter(Boolean).map(s => [s.slice(2), ASSETS[s.slice(2)]])),
  });
}
// Productos sin categoría útil (subcategoría = tipo de producto, en singular): se unen a la subcategoría equivalente
// de su misma categoría si existe ("Bolígrafo" -> "Bolígrafos", "Bloc notas" -> "Blocs de notas")
{
  const plural = w => /[aeiouáéíóú]$/.test(w) ? w + "s" : /z$/.test(w) ? w.slice(0, -1) + "ces" : /s$/.test(w) ? w : w + "es";
  const key = t => nrm(t).replace(/\bde\b|\by\b/g, " ").split(/[ ,]+/).filter(Boolean);
  const subsBy = {};
  for (const p of out) if (p.merch && !p._ts) (subsBy[p.merch] ??= new Set()).add(p.sub);
  for (const p of out) {
    if (p._ts && p.merch) {
      const pl = key(p.sub).map(plural), cands = [...(subsBy[p.merch] || [])];
      const hit = cands.find(c => key(c).join(" ") === pl.join(" ")) || cands.find(c => { const k = key(c); return pl.every((w, i) => k[i] === w); }) || cands.find(c => key(c)[0] === pl[0]);
      if (hit) p.sub = hit;
    }
    delete p._ts;
  }
}
mkdirSync("data", { recursive: true });
writeFileSync("data/makito.json", JSON.stringify(out));
const by = {}; for (const p of out) { const k = p.merch || (p.fam + " / " + p.sub); by[k] = by[k] || [0, 0]; by[k][0]++; by[k][1] += p.colors.length; }
const subs = {}; for (const p of out) if (p.merch) { const k = p.merch + " · " + p.sub; subs[k] = (subs[k] || 0) + 1; }
const lines = [
  `Makito: ${out.length} productos, ${out.reduce((a, p) => a + p.colors.length, 0)} colores, ${prods.reduce((a, p) => a + (p.variants || []).length, 0)} variantes en la API · fotos distintas: ${new Set(out.flatMap(p => [...p.img, ...p.colors.map(c => c.img)]).filter(Boolean)).size}`,
  "Descartados: " + JSON.stringify(skipped),
  "Por categoría (productos / colores):", ...Object.entries(by).sort().map(([k, v]) => `  ${k}: ${v[0]} / ${v[1]}`),
  "Subcategorías de merchandising:", ...Object.entries(subs).sort().map(([k, v]) => `  ${k}: ${v}`),
  "Nombres de color por código:", "  " + Object.entries(CODE).sort().map(x => x.join("=")).join(" · "),
];
writeFileSync("data/makito-resumen.txt", lines.join("\n") + "\n");
console.log(lines.join("\n"));
