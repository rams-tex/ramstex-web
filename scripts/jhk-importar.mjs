// Importa el catálogo de JHK (sin precios ni stock) a data/jhk.json,
// con el mismo formato que data/toptex.json para que la web los trate igual.
import { writeFileSync, mkdirSync } from "node:fs";
const T = process.env.JHK_TOKEN;
if (!T) { console.error("Falta el secreto JHK_TOKEN"); process.exit(1); }
const B = `https://www.jhktshirt.com/app/es/api/${T}`;
const IMG = "https://s3-eu-west-1.amazonaws.com/resources.jhktshirt.com/pictures/";

async function get(path) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(B + path); if (r.ok) return await r.json(); } catch (e) {}
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return null;
}
const SUB = {
  camisetas: ["Ropa", "Camisetas"], sudaderas: ["Ropa", "Sudaderas"], polos: ["Ropa", "Polos"], polares: ["Ropa", "Chaquetas"],
  camisas: ["Ropa", "Camisas / Sobrecamisas"], pantalones: ["Ropa", "Pantalones"], chaquetas: ["Ropa", "Chaquetas"],
  cortavientos: ["Ropa", "Chaquetas"], "body-bebe": ["Ropa", "Bodys"], jerseis: ["Ropa", "Jerseys / Cárdigans"],
  "alta-visibilidad": ["Ropa", "Chalecos"],
};
const TYPE = { Camisetas: "Camiseta", Sudaderas: "Sudadera", Polos: "Polo", Chaquetas: "Chaqueta", "Camisas / Sobrecamisas": "Camisa", Pantalones: "Pantalón", Bodys: "Body", "Jerseys / Cárdigans": "Jersey", Chalecos: "Chaleco", "Bermudas / Shorts": "Bermuda" };
// Si un producto solo aparece en una "línea", se deduce el tipo por el nombre
function subFromName(n) {
  n = n.toLowerCase();
  if (/\bmono\b|overall|coverall/.test(n)) return ["Ropa", "Monos"];
  if (/pantal/.test(n)) return SUB.pantalones; if (/cazadora|chaqueta/.test(n)) return SUB.chaquetas; if (/camiseta/.test(n)) return SUB.camisetas; if (/chaqueta|parka/.test(n)) return SUB.chaquetas;
  if (/polo/.test(n)) return SUB.polos; if (/sweat|hood|sudadera|crew/.test(n)) return SUB.sudaderas;
  if (/fleece|polar/.test(n)) return SUB.polares; if (/shirt.*(long|oxford|popelin)|camisa|oxford/.test(n) && !/t-shirt|tshirt/.test(n)) return SUB.camisas;
  if (/short|bermuda/.test(n)) return ["Ropa", "Bermudas / Shorts"]; if (/pant|trouser|jogger|legging/.test(n)) return SUB.pantalones;
  if (/vest|chaleco|gilet/.test(n)) return ["Ropa", "Chalecos"]; if (/jacket|softshell|parka|anorak|coat|chaqueta/.test(n)) return SUB.chaquetas;
  if (/apron|delantal/.test(n)) return ["Ropa", "Delantales"]; if (/body/.test(n)) return SUB["body-bebe"];
  if (/tank|tirantes/.test(n)) return ["Ropa", "Tirantes"]; if (/boxer|brief|underwear/.test(n)) return ["Ropa interior", "Boxers / Caleçons"];
  return SUB.camisetas;
}
const cats = await get("/gallery/categories.json") || [];
const found = new Map(); // ref -> { name, image, gen:Set, sub, lines:Set }
const add = (p, gen, sub, line) => {
  const e = found.get(p.reference) || { name: p.name, image: p.image, gen: new Set(), sub: null, lines: new Set() };
  if (gen) e.gen.add(gen); if (sub && !e.sub) e.sub = sub; if (line) e.lines.add(line);
  found.set(p.reference, e);
};
const GEN = { hombre: "Hombre", mujer: "Mujer", infantil: "Niños" };
for (const c of cats) {
  if (c.slug && c.categories) for (const s of Object.values(c.categories)) {
    for (const p of (await get(`/gallery/${s.slug}/main/${c.slug}/products.json`)) || []) add(p, s.slug === "body-bebe" ? "Bebes" : GEN[c.slug], SUB[s.slug]);
  }
  if (c.slug && !c.categories) for (const p of (await get(`/gallery/${c.slug}/products.json`)) || []) add(p, null, null, c.slug);
  if (!c.slug && c.categories) for (const l of Object.values(c.categories)) for (const p of (await get(`/gallery/${l.slug}/products.json`)) || []) add(p, null, null, l.slug);
}
for (const p of (await get(`/gallery/alta-visibilidad/main/professional/products.json`)) || []) add(p, null, SUB["alta-visibilidad"], "professional");
console.log("Modelos encontrados:", found.size);

const cap = s => String(s || "").toLowerCase().replace(/(^|\s|\/|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const DOM = [["Blanco", /white|blanc|natural|ivory|cream|ecru/], ["Negro", /black|negr/], ["Gris", /grey|gray|graphite|silver|ash|melange|anthracite|charcoal/],
  ["Azul", /blue|navy|royal|turquoise|aqua|teal|denim|indigo|ocean|petrol/], ["Rojo", /red|burgundy|wine|cherry|coral|maroon/],
  ["Verde", /green|khaki|olive|lime|mint|army|bottle|kelly|forest|sage|jade/], ["Amarillo", /yellow|gold|mustard|lemon/],
  ["Naranja", /orange|tangerine/], ["Rosa", /pink|fuchsia|rose|salmon|mauve/], ["Violeta", /purple|violet|lilac|lavender|plum/],
  ["Marrón", /brown|chocolate|mocha|camel|caramel|coffee|tobacco/], ["Beige", /beige|sand|stone|butter|nude|taupe/]];
const domOf = n => DOM.filter(d => d[1].test(String(n).toLowerCase())).map(d => d[0]).slice(0, 2);
const strip = h => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const refs = [...found.keys()];
const products = [];
const N = 6;
await Promise.all(Array.from({ length: N }, async (_, w) => {
  for (let i = w; i < refs.length; i += N) {
    const ref = refs[i], e = found.get(ref);
    const p = await get(`/clothes/5/${encodeURIComponent(ref)}/product.json`);
    if (!p || !p.reference) continue;
    let [fam, sub] = (e.sub && !e.lines.has("professional")) ? e.sub : subFromName(p.name || e.name);
    if (/\bvest\b|chaleco/i.test(p.name || "") && sub === "Chaquetas") sub = "Chalecos";
    const html = String(p.description_html || "");
    const first = strip((html.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || p.description_plain || "");
    const lis = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => strip(m[1])).filter(Boolean);
    const comp = lis.find(l => /%/.test(l)) || "";
    const g = String(p.composicion || "").match(/(\d{2,3})\s*g/);
    let gen = [...e.gen];
    if (gen.includes("Hombre") && gen.includes("Mujer")) gen = ["Unisex", ...gen.filter(x => x === "Niños" || x === "Bebes")];
    if (!gen.length) gen = /lady|woman|mujer/i.test(p.name) ? ["Mujer"] : /kid|child|infant|niñ/i.test(p.name) ? ["Niños"] : ["Unisex"];
    // Nombre: tipo de prenda + nombre del modelo, sin "Man/Lady/Kid"
    const raw = String(p.name || e.name).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    let who = /\b(lady|woman|women)\b/i.test(raw) ? "mujer" : /\b(kids?|child|children|junior)\b/i.test(raw) ? "infantil" : /\bman\b|\bmen\b/i.test(raw) && gen.length === 1 && gen[0] === "Hombre" ? "hombre" : "";
    const extras = [];
    let model = raw
      .replace(/\b(lady|woman|women|kids?|child|children|junior|man|men)\b/ig, " ")
      .replace(/\b(t-?shirts?|camiseta|sweatshirt|sweat|shirt|pants|trousers|jacket|vest|polo)\b/ig, m => { if (/sweat/i.test(m)) return " "; return " "; })
      .replace(/\bfull[ -]?zip\b/ig, () => { extras.push("con cremallera"); return " "; })
      .replace(/\bhood(ed|ie)?\b/ig, () => { extras.push("con capucha"); return " "; })
      .replace(/\bcrew ?neck\b/ig, () => { extras.push("cuello redondo"); return " "; })
      .replace(/\bv-?neck\b/ig, () => { extras.push("cuello de pico"); return " "; })
      .replace(/\btank( top)?\b/ig, () => { extras.push("de tirantes"); return " "; })
      .replace(/\b(long sleeves?|ls)\b/ig, () => { extras.push("manga larga"); return " "; })
      .replace(/\b(short sleeves?|ss)\b/ig, () => { extras.push("manga corta"); return " "; })
      .replace(/\bking ?size\b/ig, () => { extras.push("tallas grandes"); return " "; })
      .replace(/\bpique\b/ig, "piqué").replace(/\bbaby\b/ig, "bebé").replace(/\bwlt\b/ig, "").replace(/\bmedia cremallera\b/ig, "media cremallera").replace(/\bkangaroo\b/ig, "canguro")
      .replace(/[\/]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const type = TYPE[sub] || "";
    let name = [(type && !new RegExp("^" + type, "i").test(model) ? type : ""), model, ...[...new Set(extras)], who].filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();
    if (type && name.toLowerCase() === type.toLowerCase()) name += " " + ref;
    const colors = Object.values(p.colors || {}).sort((a, b) => +a.r_order - +b.r_order).map(c => ({
      n: cap(c.name), hex: "", dom: domOf(c.name), img: `${IMG}sku/jhktshirt_${ref.toLowerCase()}_${String(c.reference).toLowerCase()}.jpg`, views: ["back", "side"].map(v => `${IMG}sku/jhktshirt_${ref.toLowerCase()}_${String(c.reference).toLowerCase()}_${v}.jpg`), new: 0,
    }));
    const sizes = Object.values(p.sizes || {}).sort((a, b) => +a.r_order - +b.r_order).map(s => s.name);
    const imgs = (p.images || []).map(u => (u.startsWith("//") ? "https:" : "") + u).filter(Boolean);
    const lines = [...e.lines].join(" ");
    products.push({
      ref, name, fam, sub, gen, comp, peso: g ? g[1] + " g/m²" : "", desc: first, args: lis.filter(l => l !== comp).slice(0, 4),
      org: /organic|orgánic/i.test(p.name + html) ? 1 : 0, img: imgs.length ? imgs : [e.image].filter(Boolean), colors, sizes,
      brand: "JHK", style: "", fit: /oversize/i.test(p.name + first) ? "Oversize" : /slim|entallad|ajustad/i.test(first) ? "Entallado" : "",
      world: [/workwear|professional/.test(lines) ? "Ropa de trabajo" : "", /sport/.test(lines) ? "Deporte" : "", /professional/.test(lines) && /visib/i.test(p.name + first) ? "EPI" : ""].filter(Boolean),
      act: [], nolabel: /etiqueta[s]? (removible|desprendible)|sin etiqueta/i.test(html) ? 1 : 0, oeko: /oeko/i.test(html) ? 1 : 0,
      rec: /reciclad/i.test(html) ? 1 : 0, big: sizes.some(s => /^(3XL|4XL|5XL|XXXL)$/i.test(s)) || /curves|plus|king/i.test(lines + p.name) ? 1 : 0,
      hood: /capucha|hood/i.test(p.name + first) ? 1 : 0, cert: [], finish: "", neck: "", pockets: "", waterproof: /impermeable/i.test(html) ? "Sí" : "",
      created: "", source: "jhk",
    });
  }
}));
mkdirSync("data", { recursive: true });
writeFileSync("data/jhk.json", JSON.stringify(products));
const fams = {};
for (const p of products) fams[p.sub] = (fams[p.sub] || 0) + 1;
const out = [`JHK: ${products.length} modelos`, ...Object.entries(fams).sort((a, b) => b[1] - a[1]).map(x => "  " + x.join(": "))];
writeFileSync("data/jhk-resumen.txt", out.join("\n"));
console.log(out.join("\n"));
