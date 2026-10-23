// Importa el catálogo de Falk&Ross (lista de estilos + ficha XML de cada estilo, públicas) a data/falkross.json,
// con el formato de los demás proveedores. Sin precios.
// Los estilos que ya tenemos por TopTex (misma marca + mismo código de fabricante) NO se suben: serían duplicados.
// También guarda data/falkross-sku.json (artículo de 9 cifras -> [ref, color, talla]) para el stock.
// Fotos: se enlazan a download.falk-ross.eu con el prefijo "F:" (uso permitido en la web del cliente según
// sus condiciones de imagen; las fotos con modelo se renuevan cada año, por eso se reimporta cada semana).
import { readFileSync, writeFileSync } from "node:fs";
import { indiceTopTex, esDuplicado } from "./falkross-duplicados.mjs";

const tag = (x, t) => { const m = x.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : ""; };
const all = (x, t) => [...x.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, "g"))].map(m => m[1]);
const es = (x, t) => { const b = tag(x, t); return b ? (tag(b, "es") || tag(b, "en")) : ""; };
const en = b => tag(b, "en") || tag(b, "es");
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(90000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch (e) {}
    await sleep(5000 * 2 ** i);
  }
  return null;
}
const nrm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Categoría: primero por el nombre, si no por la categoría de Falk&Ross
const BYNAME = [
  [/^camiseta.*(tirantes|sin mangas|tank|atleta)|^(camiseta )?(top|tank)\b/, "Ropa", "Tirantes"],
  [/chef|cocin|^bata|^tunica|^casaca|^blusa de trabajo/, "Ropa", "Batas de trabajo"],
  [/^delantal/, "Ropa", "Delantales"],
  [/^camiseta|^t-shirt/, "Ropa", "Camisetas"],
  [/^polo\b/, "Ropa", "Polos"],
  [/^(jersey|cardigan|chaqueta de punto)/, "Ropa", "Jerseys / Cárdigans"],
  [/^sudadera|^chaqueta tipo sudadera|^hoodie/, "Ropa", "Sudaderas"],
  [/^chaleco/, "Ropa", "Chalecos"],
  [/^(chaqueta|cazadora|parka|softshell|cortavientos|abrigo|anorak|polar|micropolar|forro polar|chubasquero|impermeable|traje impermeable|conjunto impermeable|poncho|bomber|gabardina)/, "Ropa", "Chaquetas"],
  [/^(camisa|blusa)/, "Ropa", "Camisas / Sobrecamisas"],
  [/^(short|bermuda|pantalon(es)? corto)/, "Ropa", "Bermudas / Shorts"],
  [/^(pantalon|jog|chandal|legging|falda)/, "Ropa", "Pantalones"],
  [/^(mono|peto)\b/, "Ropa", "Monos"],
  [/^(vestido)/, "Ropa", "Vestidos"],
  [/^(body|babero|pelele)/, "Ropa", "Bodys"],
  [/calcetin/, "Ropa interior", "Calcetines"],
  [/^(boxer|calzoncillo)/, "Ropa interior", "Boxers / Caleçons"],
  [/^(gorra|visera)/, "Headwear & Accesorios", "Gorras"],
  [/^(gorro|beanie)/, "Headwear & Accesorios", "Gorros"],
  [/^sombrero/, "Headwear & Accesorios", "Sombreros & accesorios"],
  [/^(bufanda|braga|panuelo|bandana)/, "Headwear & Accesorios", "Pañuelos / Bufandas / Bragas de cuello"],
  [/^(guante|manopla|miton)/, "Headwear & Accesorios", "Guantes"],
  [/^pasamonta/, "Headwear & Accesorios", "Pasamontañas"],
  [/^(cinta|banda para la cabeza|diadema)/, "Headwear & Accesorios", "Cintas Cabeza"],
  [/^mochila/, "Equipaje", "Mochilas"],
  [/^(maleta|trolley)/, "Equipaje", "Maletas"],
  [/^neceser/, "Equipaje", "Neceseres"],
  [/^(bolsa|bolso|riñonera|rinonera|bandolera|cartera|estuche|saco|tote|shopper|cesta|portatodo|funda)/, "Equipaje", "Bolsas"],
  [/^(toalla|albornoz|toallita|sabana de bano)/, "Línea de hogar", "Baño"],
  [/^(manta|cojin|plaid)/, "Línea de hogar", "Decoración"],
  [/^(mantel|pano|servilleta|agarrador|manopla de cocina)/, "Línea de hogar", "Mesa / Cocina"],
  [/^(zapat|bota|calzado)/, "Calzado y accesorios", "Calzado de trabajo"],
];
const BYSUB = [
  [/Camisetas/, "Ropa", "Camisetas"], [/Polos/, "Ropa", "Polos"], [/Sudaderas/, "Ropa", "Sudaderas"],
  [/Chalecos/, "Ropa", "Chalecos"], [/Chaquetas|Softshell|Polares/, "Ropa", "Chaquetas"], [/Pantalones|Jog pants/, "Ropa", "Pantalones"],
  [/Gorras/, "Headwear & Accesorios", "Gorras"], [/Beanies/, "Headwear & Accesorios", "Gorros"], [/Bolsas/, "Equipaje", "Bolsas"],
  [/Toallas/, "Línea de hogar", "Baño"], [/Zapatos/, "Calzado y accesorios", "Calzado de trabajo"], [/Ropa Interior/, "Ropa interior", "Calcetines"],
];
function famSub(name, subs) {
  const n = nrm(name);
  for (const [re, f, s] of BYNAME) if (re.test(n)) return [f, s];
  for (const [re, f, s] of BYSUB) if (subs.some(x => re.test(x))) return [f, s];
  return ["Ropa Accesorios", "Accesorios"];
}
// Uso o sector (lo traduce catalogo-construir a sus grupos)
const WORLD = [[/Ropa profesional|Alta Visibilidad/, "Ropa de trabajo"], [/Horeca/, "Restauración"], [/Ropa Corporativa/, "Negocios"], [/Deporte/, "Deporte"]];
// Color dominante a partir del nombre (en inglés)
const DOM = [[/white|blanc/, "Blanco"], [/black|jet/, "Negro"], [/navy|blue|royal|azure|sky|denim|turquoise|aqua|petrol|teal|ocean|sapphire|cobalt/, "Azul"],
  [/grey|gray|heather|charcoal|ash|silver|graphite|anthracite|slate|steel|smoke|melange/, "Gris"], [/red|burgundy|cherry|wine|maroon|claret|cardinal|scarlet|bordeaux/, "Rojo"],
  [/green|bottle|kelly|olive|khaki|lime|mint|forest|army|sage|camo|moss|jade|emerald/, "Verde"], [/yellow|gold|sun|lemon|mustard/, "Amarillo"],
  [/orange|tangerine|coral|rust|terracotta/, "Naranja"], [/pink|fuchsia|magenta|rose|raspberry|blush|candy/, "Rosa"], [/purple|violet|lilac|lavender|plum|aubergine|mauve/, "Violeta"],
  [/brown|chocolate|coffee|tan|caramel|camel|cognac|mocha|walnut/, "Marrón"], [/beige|sand|natural|stone|cream|ecru|ivory|oatmeal|nude|vanilla|off white|bone/, "Beige"]];
const domOf = c => { const n = nrm(c); const d = DOM.filter(([re]) => re.test(n)).map(x => x[1]); return d.length > 1 && d.includes("Blanco") && /off white/.test(n) ? ["Beige"] : d.slice(0, 2); };
const GEN = [[/women|ladies|female|damen/, "Mujer"], [/kids|children|youth|junior|boys|girls/, "Niños"], [/baby|infant|toddler/, "Bebes"], [/unisex/, "Unisex"], [/^men$|\bmen\b/, "Hombre"]];
const F = f => f ? "F:" + f.replace(/\.jpg$/i, "") : "";

const tt = JSON.parse(readFileSync("data/toptex.json", "utf8"));
const idx = indiceTopTex(tt);
const usados = new Set();
for (const f of ["data/toptex.json", "data/roly.json", "data/jhk.json", "data/sols.json", "data/stanley.json"]) { try { for (const p of JSON.parse(readFileSync(f, "utf8"))) usados.add(String(p.ref).toUpperCase()); } catch (e) {} }

const list = await get("http://download.falk-ross.eu/ws/falkross-stylelist.xml");
if (!list) throw new Error("No se pudo descargar la lista de estilos de Falk&Ross");
const styles = all(list, "style").map(s => ({ nr: tag(s, "style_nr"), url: tag(s, "url_style_xml") })).filter(s => s.url);

const out = [], skuMap = {}, dup = [], sinFoto = [];
let i = 0;
async function worker() {
  while (i < styles.length) {
    const s = styles[i++];
    const x = await get(s.url);
    if (!x) continue;
    const brand = tag(x, "brand_name"), code = tag(x, "supplier_article_code");
    if (esDuplicado(idx, brand, code)) { dup.push(`${brand} ${code}`); continue; }
    const name = es(x, "style_name").replace(/\s+/g, " ").trim();
    const skus = all(x, "sku").map(k => ({
      art: tag(k, "sku_artnum"), cc: tag(k, "sku_color_code"), cn: tag(k, "sku_color_name"), pic: tag(k, "sku_color_picture"),
      sz: tag(k, "sku_size_name"), so: +tag(k, "sku_size_order") || 0,
    })).filter(k => k.art && k.cc);
    if (!skus.length || !name) continue;
    const subs = all(x, "style_category_sub").map(c => tag(c, "es") || tag(c, "en"));
    const flt = tag(x, "style_filter_list");
    const grp = t => all(flt, t).map(en);
    const pics = all(x, "style_picture").map(p => ({ f: tag(p, "filename"), t: tag(p, "shottype"), pos: +tag(p, "pos") || 0 })).sort((a, b) => a.pos - b.pos);
    // Colores, en el orden en que vienen; fotos: plana del color + fotos de estilo de ese color (modelo, espalda, lados)
    const byColor = new Map();
    for (const k of skus) if (!byColor.has(k.cc)) byColor.set(k.cc, k);
    const colors = [...byColor.values()].map(k => {
      const mine = pics.filter(p => p.f.includes(`_${k.cc}_`) && p.f !== k.pic);
      const order = p => p.t === "m" ? 0 : /_b-/.test(p.f) ? 1 : /_mb-/.test(p.f) ? 2 : 3;
      const img = k.pic || (mine[0] || {}).f;
      return { code: k.cc, n: k.cn, hex: "", dom: domOf(k.cn), img: F(img), views: mine.filter(p => p.f !== img).sort((a, b) => order(a) - order(b)).slice(0, 3).map(p => F(p.f)) };
    }).filter(c => c.img);
    if (!colors.length) { sinFoto.push(`${brand} ${code}`); continue; }
    const model = pics.filter(p => p.t === "m").map(p => F(p.f));
    const imgs = [...new Set([...model.slice(0, 2), colors[0].img, ...pics.filter(p => p.t !== "m").map(p => F(p.f))])].slice(0, 4);
    // Ref visible: código del fabricante; si choca con otro producto, el nº de estilo de Falk&Ross
    let ref = code.toUpperCase().replace(/\s*\(.*?\)\s*/g, "").replace(/[^A-Z0-9-]/g, "");
    if (/^0[A-Z]\d+[A-Z]0$/.test(ref)) ref = ref.slice(1, -1); // Russell: 0R180M0 -> R180M
    if (!ref || usados.has(ref)) ref = "FR" + s.nr;
    usados.add(ref);
    for (const k of skus) skuMap[k.art] = [ref, k.cc, k.sz];
    // Descripción: viñetas; de ahí salen gramaje y composición
    const lines = es(x, "style_description").split(/\n|·/).map(l => l.replace(/^[\s•\-·]+/, "").trim()).filter(Boolean);
    const pesoL = lines.find(l => /^\d+\s*g\/m/.test(l)), peso = pesoL ? (pesoL.match(/^(\d+)/)[1] + " g/m²") : "";
    const compL = lines.filter(l => /\d+\s*%/.test(l) && l !== pesoL);
    const rest = lines.filter(l => l !== pesoL && !compL.includes(l));
    const sizes = [...new Map(skus.sort((a, b) => a.so - b.so).map(k => [k.sz, 1])).keys()];
    const gtxt = grp("style_gender_group").join(" ").toLowerCase() + " " + nrm(name);
    let gen = [...new Set(GEN.filter(([re]) => re.test(gtxt)).map(g => g[1]))];
    if (/\bnin[oa]s?\b|infantil|junior|kids/.test(nrm(name))) gen = ["Niños"];
    else if (/\bmujer\b|women|lady/.test(nrm(name))) gen = ["Mujer"];
    else if (/\bhombre\b/.test(nrm(name)) && !gen.includes("Unisex")) gen = ["Hombre"];
    if (gen.includes("Unisex")) gen = ["Unisex"];
    const [fam, sub] = famSub(name, subs);
    const txt = nrm(name + " " + lines.join(" ") + " " + subs.join(" "));
    out.push({
      ref, name, fam, sub, gen: gen.slice(0, 1), brand, source: "falkross",
      comp: compL.slice(0, 2).join("; "), peso,
      desc: rest.slice(0, 3).join(". ").replace(/\.\./g, ".").replace(/([^.])$/, "$1."),
      args: rest.slice(3, 8),
      org: /organic|organico/.test(txt) ? 1 : 0, rec: /reciclad|recycled/.test(txt) ? 1 : 0,
      oeko: /oeko/.test(nrm(grp("style_certificate_group").join(" "))) ? 1 : 0,
      nolabel: subs.some(x => /Sin etiqueta/.test(x)) ? 1 : 0, hood: /capucha/.test(nrm(name)) ? 1 : 0,
      img: imgs, colors, sizes, style: "", fit: /oversize/.test(txt) ? "Oversize" : "", neck: "",
      world: [...new Set(WORLD.filter(([re]) => subs.some(x => re.test(x))).map(w => w[1]))],
      created: subs.some(x => /NUEVO 2026/.test(x)) ? "2026" : "",
    });
  }
}
await Promise.all([worker(), worker()]);
if (out.length < 300) throw new Error(`Muy pocos estilos de Falk&Ross (${out.length}), no se actualiza`);
out.sort((a, b) => a.ref.localeCompare(b.ref));
writeFileSync("data/falkross.json", JSON.stringify(out));
writeFileSync("data/falkross-sku.json", JSON.stringify(skuMap));
const resumen = `Falk&Ross: ${styles.length} estilos; ${dup.length} ya están en TopTex (no se suben); ${sinFoto.length} sin foto; ${out.length} modelos importados, ${out.reduce((a, p) => a + p.colors.length, 0)} colores\n\nNo subidos por estar ya en TopTex:\n${dup.sort().join("\n")}\n`;
writeFileSync("data/falkross-resumen.txt", resumen);
console.log(resumen.split("\n")[0]);
