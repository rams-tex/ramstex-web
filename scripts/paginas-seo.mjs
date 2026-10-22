// Genera, al publicar, una página real para cada categoría y producto (para que Google las encuentre),
// además de sitemap.xml, robots.txt y 404.html. La web sigue funcionando igual: estas páginas cargan
// la misma aplicación, con el contenido ya escrito para que Google y el visitante lo vean al momento.
// Uso: node scripts/paginas-seo.mjs _site
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prodSlug } from "./seo-categorias.mjs";

const OUT = process.argv[2] || "_site";
const SITE = "https://ramstex.com";
const html = readFileSync(join(OUT, "index.html"), "utf8");
const D = JSON.parse(readFileSync("data/catalogo.json", "utf8"));
const FICHAS = {};
for (const f of readdirSync("data/fichas")) FICHAS[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join("data/fichas", f), "utf8"));

// ---------- CSS y JS compartidos (una sola descarga que el navegador guarda) ----------
const build = (html.match(/var BUILD="([^"]*)"/) || [])[1] || "dev";
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const js = scripts[scripts.length - 1][1];
writeFileSync(join(OUT, "app.css"), css);
writeFileSync(join(OUT, "app.js"), js);

// Colores y fotos de categoría: los mismos datos que usa la web
const pick = name => new Function(js.match(new RegExp("var " + name + "=[^\\n]*;"))[0] + "return " + name + ";")();
const DOMHEX = pick("DOMHEX"), NAMEHEX = pick("NAMEHEX"), TILEPIC = pick("TILEPIC");

// ---------- Utilidades ----------
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const fmt = n => n.toLocaleString("es-ES");
const isM = c => c.startsWith("m-");
const CS = Object.fromEntries(D.cats.map(c => [c[0], c]));
const cURL = c => (isM(c) ? "/merchandising/" : "/catalogo/") + CS[c][4] + "/";
const pURL = it => "/producto/" + prodSlug(it.r, it.n) + "/";
const GENL = { H: "Hombre", M: "Mujer", U: "Unisex", N: "Niños", B: "Bebés" };
const isR = st => st.startsWith("R:"), isJ = st => st.startsWith("J:"), isS = st => st.startsWith("S:"), isT = st => st.startsWith("T:");
const isPack = st => st.startsWith("packshots/") || (isR(st) && st.indexOf("/views/") > 0) || (isJ(st) && st.indexOf("sku/") === 2) || (isS(st) && st[2] === "n" && st.length > 10) || (isT(st) && st[2] === "P");
function imgURL(st, w) {
  if (isR(st)) return "https://static.gorfactory.es/images/models/" + st.slice(2) + ".jpg";
  if (isJ(st)) return "https://s3-eu-west-1.amazonaws.com/resources.jhktshirt.com/pictures/" + st.slice(2) + ".jpg";
  if (isT(st)) return SITE + "/st/" + st.slice(2).replace(/\.\w+$/, "") + ".webp";
  if (isS(st)) return "https://s7g3.scene7.com/is/image/soloinvest/" + st.slice(2) + "?wid=" + w;
  return "https://cdn.europeancatalog.com/" + st + (isPack(st) ? ".png" : ".jpg") + "?w=" + w;
}
const img = (st, w, alt, extra = "") => st ? `<img${isPack(st) ? ' class="pack"' : ""} src="${esc(imgURL(st, w))}" alt="${esc(alt)}"${extra}>` : "";
function dotColor(k) {
  if (k[1]) return k[1];
  const nn = norm(k[0]);
  for (const [w, h] of NAMEHEX) if (nn.includes(w)) return h;
  return (k[2].length && DOMHEX[D.doms[k[2][0]]]) || "#DDD";
}
const cut = (s, n) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";

// ---------- Plantilla ----------
const VIEW_HOME = html.indexOf('<div id="view-home">');
const VIEW_CAT = html.indexOf("<!-- =============== CATÁLOGO");
if (VIEW_HOME < 0 || VIEW_CAT < 0 || !html.includes("<!--seo-->")) throw new Error("No encuentro las marcas de la plantilla en index.html");
const T = html
  .replace(/<style>[\s\S]*?<\/style>/, `<link rel="stylesheet" href="/app.css?v=${build}">`)
  .replace(scripts[scripts.length - 1][0], `<script src="/app.js?v=${build}"></script>`);
const tHome0 = T.indexOf('<div id="view-home">'), tHome1 = T.indexOf("<!-- =============== CATÁLOGO");
const TPL = T.slice(0, tHome0) + '<div id="view-home" hidden></div>\n\n' + T.slice(tHome1);

function head({ title, desc, path, image, ld, noindex }) {
  const url = SITE + path;
  return `<!--seo-->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" id="canon" href="${esc(url)}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ramstex">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image || SITE + "/portada-900.png")}">
<meta name="twitter:card" content="summary_large_image">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}
<!--/seo-->`;
}
const crumbs = list => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: list.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path })) });

function page(tpl, h, view, content, ref) {
  let s = tpl.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, h);
  if (view === "cat") {
    s = s.replace('<div id="view-cat" hidden>', '<div id="view-cat">');
    for (const [id, val] of Object.entries(content)) {
      const re = new RegExp(`(<[^>]+id="${id}"[^>]*>)([\\s\\S]*?)(</(?:h1|p|div)>)`);
      if (!re.test(s)) throw new Error("Falta #" + id);
      s = s.replace(re, (m, a, b, c) => (id === "landing" || id === "catlay" ? a.replace(/ hidden/, "") : a) + val + c);
    }
    if (content.landing !== undefined) s = s.replace('<div class="catlay" id="catlay">', '<div class="catlay" id="catlay" hidden>');
  } else {
    s = s.replace('<div id="view-prod" hidden>', '<div id="view-prod">').replace('<div class="wrap cat" id="prod"></div>', `<div class="wrap cat" id="prod" data-pre="${esc(ref)}">${content}</div>`)
      .replace(/<h1 id="cattitle">[^<]*<\/h1>/, '<h1 id="cattitle"></h1>');
  }
  return s;
}
function write(path, s) {
  const dir = join(OUT, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), s);
}

// Tarjeta igual que en la web (sin los botones de color, que añade la aplicación)
function card(it) {
  const href = pURL(it), tag = it.f.includes("n") ? "Novedad" : it.f.includes("e") ? "Ecológico" : "";
  return `<article class="card"><a class="frame" href="${href}">${img(it.i, 600, it.n, ' loading="lazy" decoding="async"')}${tag ? `<span class="tag">${tag}</span>` : ""}</a>` +
    `<div class="info"><span class="ref">Ref. ${esc(it.r)}</span><h3><a href="${href}">${esc(it.n)}</a></h3><div class="meta">${esc(D.subs[it.s])}${it.w ? " · " + it.w + " g/m²" : ""}</div>` +
    `<div class="cname">${it.k.length} ${it.k.length === 1 ? "color" : "colores"}</div><div class="cardbtns"><a class="more" href="${href}">Ver ficha</a><button class="add" type="button">Añadir</button></div></div></article>`;
}
function chips(sec, cur) {
  const list = D.cats.filter(c => !!c[3] === (sec === "merch"));
  return `<a class="chip" data-c="" href="/${sec === "merch" ? "merchandising" : "catalogo"}/"${!cur ? ' aria-current="page"' : ""}>Todas las categorías</a>` +
    list.map(c => `<a class="chip" data-c="${c[0]}" href="${cURL(c[0])}"${cur === c[0] ? ' aria-current="page"' : ""}>${esc(c[1])}<small>${fmt(c[2])}</small></a>`).join("");
}

const urls = ["/"];
const SECS = {
  cat: { path: "/catalogo/", name: "Catálogo", title: "Catálogo de ropa personalizada para empresas | Ramstex", h1: "Elige tu prenda",
    desc: "Catálogo de camisetas, sudaderas, polos, chaquetas, ropa de trabajo, gorras y bolsas para personalizar con tu logo. Filtra por color, gramaje o uso y pide presupuesto." },
  merch: { path: "/merchandising/", name: "Merchandising", title: "Merchandising personalizado para empresas | Ramstex", h1: "Merchandising",
    desc: "Merchandising y regalos de empresa personalizados con tu logo: tazas, botellas, bolígrafos, libretas, tecnología, bolsas y mucho más. Pide presupuesto sin compromiso." },
};

// ---------- Portadas de catálogo y merchandising ----------
for (const [sec, S] of Object.entries(SECS)) {
  const cats = D.cats.filter(c => !!c[3] === (sec === "merch"));
  const n = D.items.filter(it => isM(it.c) === (sec === "merch")).length;
  const sub = sec === "merch"
    ? `Más de ${fmt(Math.floor(n / 100) * 100)} artículos promocionales para personalizar con tu logo: tazas, botellas, bolígrafos, libretas, tecnología, bolsas y mucho más. Añade lo que te interese a tu presupuesto y te respondemos con el diseño y el precio.`
    : `Más de ${fmt(Math.floor(n / 100) * 100)} prendas y productos listos para personalizar con tu logo. Filtra por tipo, color, gramaje o uso, añade lo que te interese a tu presupuesto y te respondemos con el diseño y el precio.`;
  const tiles = cats.map(c => {
    const p = D.items.find(x => x.r === TILEPIC[c[0]]) || D.items.find(x => x.c === c[0]);
    return `<a class="tile${isM(c[0]) ? " m" : ""}" href="${cURL(c[0])}" data-c="${c[0]}"><div class="ph">${p ? img(p.i, 600, "", ' loading="lazy" decoding="async"') : ""}</div><b>${esc(c[1])}</b><span>${fmt(c[2])} productos</span></a>`;
  }).join("");
  const h = head({ title: S.title, desc: S.desc, path: S.path, ld: crumbs([["Inicio", "/"], [S.name, S.path]]) });
  write(S.path, page(TPL, h, "cat", { cattitle: esc(S.h1), catsub: esc(sub), cats: chips(sec), landing: tiles }));
  urls.push(S.path);
}

// ---------- Categorías ----------
for (const c of D.cats) {
  const sec = c[3] ? "merch" : "cat", S = SECS[sec];
  const items = D.items.filter(it => it.c === c[0]);
  const desc = cut(c[7], 158);
  const ph = D.items.find(x => x.r === TILEPIC[c[0]]) || items[0];
  const h = head({ title: c[5] + " | Ramstex", desc, path: cURL(c[0]), image: ph && imgURL(ph.i, 1000),
    ld: crumbs([["Inicio", "/"], [S.name, S.path], [c[1], cURL(c[0])]]) });
  write(cURL(c[0]), page(TPL, h, "cat", {
    cattitle: esc(c[6]), catsub: esc(c[7]), cats: chips(sec, c[0]),
    count: `<b>${fmt(items.length)}</b> productos`,
    grid: items.slice(0, 24).map(card).join(""),
  }));
  urls.push(cURL(c[0]));
}

// ---------- Productos ----------
let nprod = 0;
for (const it of D.items) {
  const f = (FICHAS[it.c] || {})[it.r] || {}, c = CS[it.c], S = SECS[c[3] ? "merch" : "cat"], merch = isM(it.c);
  const gen = it.g.split("").map(x => GENL[x]).filter(Boolean).join(", ");
  const sizes = f.sizes || [];
  const tech = merch ? "impresión o grabado" : "estampado, bordado, serigrafía o DTF";
  const bits = [it.k.length > 1 ? `${it.k.length} colores` : "", sizes.length > 1 ? `tallas ${sizes[0]} a ${sizes[sizes.length - 1]}` : "", f.peso || (it.w ? it.w + " g/m²" : "")].filter(Boolean).join(", ");
  const desc = cut(`Personaliza ${it.n.charAt(0).toLowerCase() + it.n.slice(1)} (ref. ${it.r}) con tu logo: ${tech}.${bits ? " " + bits.charAt(0).toUpperCase() + bits.slice(1) + "." : ""} Pide presupuesto sin compromiso.`, 160);
  const badges = [];
  if (it.f.includes("l")) badges.push("Sin etiqueta: lista para tu marca");
  (f.cert || []).forEach(b => badges.push(b));
  if (it.f.includes("x")) badges.push("Tallas grandes");
  const specs = [["Referencia", it.r + ((it.v || []).length ? " (también " + it.v.join(", ") + ")" : "")], ["Composición", f.comp], ["Gramaje", f.peso], ["Corte", f.fit], [f.src === "sols" ? "Tejido" : "Acabado", f.fin], ["Cuello", f.neck], ["Bolsillos", f.pk], ["Impermeable", f.wp], ["Colores", it.k.length + " disponibles"], ["Personalización", merch ? "Impresión o grabado con tu logo (según el artículo)" : "Estampado, bordado, serigrafía o DTF"]].filter(s => s[1]);
  const pics = f.img && f.img.length ? f.img : [it.i];
  const rel = D.items.filter(x => x.s === it.s && x !== it).slice(0, 4);
  const body = `<a class="back" href="${cURL(it.c)}">Volver al catálogo</a>` +
    `<div class="pd"><div class="pgal"><div class="big">${img(pics[0], 1000, it.n, ' fetchpriority="high"')}</div><div class="thumbs">` +
    pics.map((st, i) => `<button type="button" aria-label="Ver foto" aria-pressed="${i === 0}">${img(st, 200, "", ' loading="lazy"')}</button>`).join("") + `</div></div>` +
    `<div class="pinfo"><span class="ref">Ref. ${esc(it.r)}</span><h1>${esc(it.n)}</h1><div class="meta">${esc(D.subs[it.s])}${gen ? " · " + esc(gen) : ""}</div>` +
    `<h3 class="pcol">Colores (${it.k.length})</h3><div class="dots">${it.k.map(k => `<button type="button" class="dot" style="background:${esc(dotColor(k))}" title="${esc(k[0])}" aria-label="${esc(k[0])}" aria-pressed="false"></button>`).join("")}</div>` +
    (badges.length ? `<div class="badges">${badges.map(b => `<span>${esc(b)}</span>`).join("")}</div>` : "") +
    (f.d ? `<p class="desc">${esc(f.d)}</p>` : "") +
    ((f.a || []).length ? `<ul class="args">${f.a.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : "") +
    (sizes.length ? `<h3>Tallas</h3><div class="sizes">${sizes.map(s => `<span>${esc(s)}</span>`).join("")}</div>` : "") +
    `<h3>Stock disponible</h3><div class="pstock" id="pstock"><p class="meta">Cargando stock…</p></div>` +
    `<h3>Características</h3><dl class="specs">${specs.map(s => `<dt>${s[0]}</dt><dd>${esc(s[1])}</dd>`).join("")}</dl>` +
    `<div class="pbtns"><button class="btn" type="button" id="padd">Añadir a mi presupuesto</button><a class="btn ghost" href="https://wa.me/34682368645?text=${encodeURIComponent("Hola, me interesa este producto del catálogo: " + it.n + " (ref. " + it.r + ")")}" target="_blank" rel="noopener">Preguntar por WhatsApp</a></div></div></div>` +
    `<div class="related" id="related">${rel.length ? `<h2>También te puede interesar</h2><div class="grid">${rel.map(card).join("")}</div>` : ""}</div>`;
  const h = head({ title: `${it.n} personalizable (ref. ${it.r}) | Ramstex`, desc, path: pURL(it), image: imgURL(it.i, 1000),
    ld: crumbs([["Inicio", "/"], [S.name, S.path], [c[1], cURL(it.c)], [it.n, pURL(it)]]) });
  write(pURL(it), page(TPL, h, "prod", body, it.r));
  urls.push(pURL(it)); nprod++;
}

// ---------- 404 (la web completa, para direcciones que ya no existen) ----------
writeFileSync(join(OUT, "404.html"), html.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, head({ title: "Página no encontrada | Ramstex", desc: "Esta página ya no existe. Visita el catálogo de Ramstex.", path: "/", noindex: true })));

// ---------- sitemap.xml y robots.txt ----------
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `<url><loc>${SITE}${esc(u)}</loc></url>`).join("\n") + `\n</urlset>\n`);
writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Páginas SEO: ${D.cats.length} categorías, ${nprod} productos, ${urls.length} direcciones en el sitemap`);
