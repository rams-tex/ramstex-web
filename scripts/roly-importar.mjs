// Importa el catálogo de Roly (sin precios ni stock) a data/roly.json,
// con el mismo formato que data/toptex.json para que la web los trate igual.
import { writeFileSync, mkdirSync } from "node:fs";
const BASE = "https://clientsws.gorfactory.es:2096";
const USER = process.env.ROLY_USER, PASS = process.env.ROLY_PASSWORD;
if (!USER || !PASS) { console.error("Faltan secretos de Roly"); process.exit(1); }

async function call(path, opts = {}) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + path, opts);
    if (r.ok) return r.json();
    console.log("Reintento", r.status, path.slice(0, 60));
    await new Promise(res => setTimeout(res, 3000 * (i + 1)));
  }
  throw new Error("Fallo " + path);
}
const login = await call("/api/v1.1/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: USER, password: PASS }) });
const H = { headers: { Authorization: "Bearer " + login.token } };
// Marcas del grupo (Roly y Stamina). Si una marca no responde, se sigue con las demás.
const BRANDS = ["roly", "stamina"];
const items = [], models = {}, brandLog = [];
for (const b of BRANDS) {
  try {
    const cat = await call(`/api/v1.1/item/getcatalog?lang=es-ES&brand=${b}`, H);
    const mod = await call(`/api/v1/model/get?lang=es-ES&brand=${b}`, H);
    const its = (cat.item || []).map(i => ({ ...i, _brand: b }));
    items.push(...its);
    for (const m of mod.models || []) models[m.modelcode] = m;
    brandLog.push(`${b}: ${new Set(its.map(i => i.modelcode)).size} modelos`);
  } catch (e) { brandLog.push(`${b}: sin datos (${e.message})`); }
}
console.log(brandLog.join(" | "));

// Familia de Roly -> familia/subfamilia equivalentes a las de TopTex (así entran en las mismas categorías de la web)
const FAM = {
  "CAMISETAS": ["Ropa", "Camisetas"], "POLOS": ["Ropa", "Polos"], "SUDADERAS": ["Ropa", "Sudaderas"],
  "JERSEYS": ["Ropa", "Jerseys / Cárdigans"], "REBECA-CARDIGAN": ["Ropa", "Jerseys / Cárdigans"],
  "CHAQUETAS": ["Ropa", "Chaquetas"], "ROPA ABRIGO": ["Ropa", "Chaquetas"], "SOFTSHELLS": ["Ropa", "Chaquetas"],
  "PARKAS": ["Ropa", "Chaquetas"], "POLARES": ["Ropa", "Chaquetas"], "CORTAVIENTOS": ["Ropa", "Chaquetas"],
  "CHUBASQUEROS": ["Ropa", "Chaquetas"], "CHALECOS": ["Ropa", "Chalecos"],
  "PANTALONES": ["Ropa", "Pantalones"], "PANTALONES CORTOS": ["Ropa", "Bermudas / Shorts"], "BERMUDAS": ["Ropa", "Bermudas / Shorts"],
  "LEGGINGS": ["Ropa", "Pantalones"], "FALDAS": ["Ropa", "Faldas"], "CAMISAS": ["Ropa", "Camisas / Sobrecamisas"],
  "DELANTALES": ["Ropa", "Delantales"], "BATAS": ["Ropa", "Batas de trabajo"], "BUZOS - MONOS": ["Ropa", "Monos"],
  "IGNÍFUGOS": ["Ropa", "Monos"], "ALTA VISIBILIDAD": ["Ropa", "Chalecos"],
  "CONJUNTOS DEPORTIVOS": ["Ropa", "Camisetas deportiva"], "ROPA DEPORTIVA": ["Ropa", "Camisetas deportiva"],
  "PADDLE": ["Ropa", "Camisetas deportiva"], "PETOS DEPORTIVOS": ["Ropa", "Petos"], "CHANDALS": ["Ropa", "Chaquetas"],
  "BAÑADORES": ["Ropa", "Bañadores"], "BODIES": ["Ropa", "Bodys"],
  "CALZADO": ["Calzado y accesorios", "Zapatos Lifestyle / Ocio"], "ZAPATO LABORAL": ["Calzado y accesorios", "Calzado de Seguridad"],
  "CALCETAS Y CALCETINES": ["Ropa interior", "Calcetines"], "ROPA INTERIOR": ["Ropa interior", "Ropas interior"],
  "BOLSAS": ["Equipaje", "Bolsas"], "MOCHILAS": ["Equipaje", "Bolsas"],
  "GORROS": ["Headwear & Accesorios", "Gorros"], "GORRAS": ["Headwear & Accesorios", "Gorras"], "PAÑUELOS": ["Ropa Accesorios", "Pañuelos"],
};
// Subfamilias más precisas según la ropa (alta visibilidad, pantalones dentro de chándal, etc.)
// Stamina (merchandising) va a su propio apartado de la web, con estas categorías
const MERCH = [
  ["m-tec", /\b(technology|sound|chargers|usb_|tech_accessories|technology_multifunc)/],
  ["m-esc", /\b(writing_office|writing|notebooks|diaries_calendars|office_accessories|ball_pens|pencils)\b/],
  ["m-taz", /\b(eating_drinkware|bottles_thermos_flas|mugs|take_away)\b/],
  ["m-bol", /\b(bags_travel|bags|bags_travel_backpack|trolley|travel_accessories|cooler_bags)\b/],
  ["m-eve", /\b(party|conferences_fairs|cheering|hats_bands|trophies)\b/],
  ["m-ver", /\b(summer|beach_items|sunglasses|bags_coolers)\b/],
  ["m-inv", /\b(winter|rain|cold)\b/],
  ["m-dep", /\b(sport_selfcare|selfcare|sport_leisure|cosmetic|travel_caps)\b/],
  ["m-nav", /\b(christmas)\b/],
  ["m-out", /\b(outdoor|tools_pets|tools|car_accessories|pets_accessories)\b/],
  ["m-hog", /\b(home_gifts|kitchen|keyrings|decoration_games)\b/],
];
const merchOf = ids => (MERCH.find(m => m[1].test(ids)) || ["m-hog"])[0];
function famOf(it) {
  const f = (it.family || "").trim(), n = (it.itemname || "").toUpperCase();
  if (it._brand === "stamina") return ["Merchandising", f ? f.charAt(0) + f.slice(1).toLowerCase().replace(/\bbluetooth\b/, "Bluetooth").replace(/\busb\b/, "USB") : "Varios"];
  if (f === "ALTA VISIBILIDAD" || f === "IGNÍFUGOS" || f === "CHANDALS" || f === "CONJUNTOS DEPORTIVOS") {
    if (/^CAMISETA/.test(n)) return ["Ropa", "Camisetas"];
    if (/^POLO/.test(n)) return ["Ropa", "Polos"];
    if (/^SUDADERA/.test(n)) return ["Ropa", "Sudaderas"];
    if (/^PANTAL/.test(n)) return ["Ropa", "Pantalones"];
    if (/^CHALECO/.test(n)) return ["Ropa", "Chalecos"];
    if (/^MONO|^BUZO/.test(n)) return ["Ropa", "Monos"];
    return ["Ropa", "Chaquetas"];
  }
  return FAM[f];
}
// Sectores (para el filtro "Uso o sector")
function worldOf(ids) {
  const w = [];
  if (/horeca/.test(ids)) w.push("CHR y profesiones de la restauración");
  if (/workwear|industry|fire_retardant|food|highviz/.test(ids)) w.push("Ropa de trabajo");
  if (/highviz/.test(ids)) w.push("EPI");
  if (/san_est|sanitary/.test(ids)) w.push("Salud, belleza e higiene");
  if (/sports|equip|chnd|cam_sp|\bpd\b/.test(ids)) w.push("Deporte");
  if (/basic|cam_po|t_shirts|swe/.test(ids)) w.push("Promoción y organización de eventos", "Venta al por menor");
  return w;
}
// Color: nombre bonito y familia de color
const cap = s => String(s || "").toLowerCase().replace(/(^|\s|\/)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const DOM = [["Blanco", /blanc|crudo|hueso|natural/], ["Negro", /negr/], ["Gris", /gris|plomo|antracita|vigore|grafito|perla|plata|acero/],
  ["Azul", /azul|marino|royal|celeste|turquesa|denim|navy|petr|indigo|cian|aqua|lago|oceano/], ["Rojo", /rojo|granate|burdeos|vino|coral|cereza/],
  ["Verde", /verde|kaki|caqui|militar|botella|oliva|lima|menta|kelly|pistacho|musgo/], ["Amarillo", /amarill|mostaza|limon|oro/],
  ["Naranja", /naranja|calabaza|teja|mandarina/], ["Rosa", /rosa|fucsia|roseton|salm/], ["Violeta", /morado|violeta|purpura|lila|malva|berenjena/],
  ["Marrón", /marr|chocolate|camel|tabaco|cuero/], ["Beige", /beige|arena|piedra|vainilla|crema|topo|visón|vison/]];
const domOf = n => { const s = String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return DOM.filter(d => d[1].test(s)).map(d => d[0]).slice(0, 2); };
const listOf = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);

// Agrupar por modelo
const byModel = new Map();
for (const it of items) {
  if (!it.modelcode || !famOf(it)) continue;
  if (!byModel.has(it.modelcode)) byModel.set(it.modelcode, []);
  byModel.get(it.modelcode).push(it);
}
const products = [];
for (const [code, rows] of byModel) {
  const a = rows[0], m = models[code] || {};
  const [fam, sub] = famOf(a);
  // Nombre: "CAMISETA ATOMIC 150 T/XS BLANCO" -> "Camiseta Atomic 150"
  const full = a.itemname.replace(/\s+T\/\S+.*$/, "").trim().replace(/\bM\/L\b/i, "MANGA LARGA").replace(/\bM\/C\b/i, "MANGA CORTA");
  const MW = new Set(String(a.modelname || "").toUpperCase().replace(/\b(WOMAN|CHILD|KIDS?|L\/S|S\/S)\b/g, "").split(/\s+/).filter(Boolean));
  const ACC = { pantalon: "pantalón", calcetin: "calcetín", algodon: "algodón", nautico: "náutico", termica: "térmica", termico: "térmico", tecnica: "técnica", tecnico: "técnico", chandal: "chándal", camion: "camión", ignifugo: "ignífugo", ignifuga: "ignífuga", futbol: "fútbol", woman: "mujer", child: "infantil", kids: "infantil", kid: "infantil" };
  const TYPE = { PANTALONES: "Pantalón", CAMISETAS: "Camiseta", POLOS: "Polo", SUDADERAS: "Sudadera", CHAQUETAS: "Chaqueta", BERMUDAS: "Bermuda", LEGGINGS: "Leggings", CAMISAS: "Camisa", CHALECOS: "Chaleco", PARKAS: "Parka", SOFTSHELLS: "Softshell", POLARES: "Polar" };
  let hv = false;
  let words = full.split(/\s+/).filter(w => { if (/^AV$/i.test(w)) { hv = true; return false; } return true; });
  if (words.length && MW.has(words[0].toUpperCase()) && TYPE[a.family]) words.unshift(TYPE[a.family]);
  let name = words.map((w, k) => MW.has(w.toUpperCase()) ? cap(w) : (ACC[w.toLowerCase()] || w.toLowerCase())).join(" ")
    .replace(/^(camiseta|camisa|top) tirantes/, "$1 de tirantes").replace(/^(sudadera|chaqueta|parka|cortavientos) capucha/, "$1 con capucha")
    .replace(/\s+/g, " ").trim();
  if (hv) name += " alta visibilidad";
  name = name.charAt(0).toUpperCase() + name.slice(1);
  const kids = rows.some(r => r.isforchildren === "True");
  const isMerch = a._brand === "stamina";
  const gen = [];
  if (isMerch) {}
  else if (sub === "Bodys") gen.push("Bebes");
  else {
    const g = a.gender;
    if (g === "Hombre" || g === "Mujer" || g === "Unisex") gen.push(g);
    if (kids) gen.push("Niños");
  }
  const comp = (a.composition || "").replace(/\s+/g, " ").trim();
  const g = comp.match(/(\d{2,3})\s*g\/m/);
  const colors = new Map();
  for (const r of rows) {
    if (colors.has(r.colorcode)) continue;
    const views = listOf(r.viewsimages);
    colors.set(r.colorcode, {
      code: String(r.colorcode), n: cap(r.colorname), hex: "", dom: domOf(r.colorname),
      img: views[0] || r.productimage || "", views: [views.find(v => /_2_1\.jpg$/.test(v)), views.find(v => /_7_1\.jpg$/.test(v))].filter(Boolean), new: r.isnovelty === "True" ? 1 : 0,
    });
  }
  const sizes = isMerch ? [] : [...new Map(rows.slice().sort((x, y) => (x.sizecode || "").localeCompare(y.sizecode || "")).map(r => [r.sizename, 1])).keys()];
  const modelImgs = listOf(m.images).filter(u => /\/model\//.test(u));
  const mainImg = a.modelimage || modelImgs[0] || [...colors.values()][0]?.img;
  const imgs = [...new Set([mainImg, ...modelImgs].filter(Boolean))].slice(0, 6);
  const obs = String(a.observations || "").split("·").map(s => s.trim().replace(/[.,]$/, "")).filter(s => s && !/estándares|marca/i.test(s));
  const ids = a.categoriesids || "";
  const desc = String(a.description || "").replace(/·/g, ". ").replace(/\s*\.\s*\./g, ".").replace(/\s+/g, " ").trim();
  products.push({
    ref: code, name, fam, sub, gen, comp, peso: g ? g[1] + " g/m²" : "", desc, args: obs.slice(0, 4),
    org: /rolyeco/.test(ids) ? 1 : 0, img: imgs, colors: [...colors.values()], sizes,
    brand: a._brand === "stamina" ? "Stamina" : "Roly", style: "", fit: /oversize/i.test(desc + name) ? "Oversize" : /entallad|ajustad|slim/i.test(desc) ? "Entallado" : "",
    world: worldOf(ids), act: [], nolabel: /etiqueta (removible|desprendible|arrancable)|sin etiqueta|tear.?away/i.test(a.observations + desc) ? 1 : 0,
    oeko: 0, rec: /reciclad/i.test(comp + desc) ? 1 : 0, big: sizes.some(s => /^[4-9]XL$/.test(s)) ? 1 : 0,
    hood: /capucha/i.test(desc + name) ? 1 : 0, cert: [], finish: "", neck: "", pockets: "", waterproof: /impermeable/i.test(desc) ? "Sí" : "",
    sizecodes: Object.fromEntries(rows.map(r => [r.sizecode, r.sizename])),
    created: rows.some(r => r.isnovelty === "True") ? "2026" : "", source: a._brand, alt: [a.modelid].filter(Boolean),
    ...(isMerch ? { merch: merchOf(ids), world: [] } : {}),
  });
}
mkdirSync("data", { recursive: true });
writeFileSync("data/roly.json", JSON.stringify(products));
const fams = {};
for (const p of products) fams[p.fam + " / " + p.sub] = (fams[p.fam + " / " + p.sub] || 0) + 1;
const out = [brandLog.join(" | "), `Roly + Stamina: ${products.length} modelos (${items.length} referencias de color y talla)`, ...Object.entries(fams).sort((a, b) => b[1] - a[1]).map(x => "  " + x.join(": "))];
writeFileSync("data/roly-resumen.txt", out.join("\n"));
console.log(out.join("\n"));
