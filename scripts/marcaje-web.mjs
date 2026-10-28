// Zonas de marcaje de Makito para el diseñador de la web (lo que se publica): una copia reducida de data/makito-marcaje/
// (la genera «Marcaje Makito»; aquí no se cambia nada de ese proceso). Por producto solo lo que usa el diseñador:
// areas [{id, lab, mm, box, img, col, forma, quad, tec}] y tecnicas.json con nombre, colores máx., a todo color, mínimo y puntadas.
// Uso: node scripts/marcaje-web.mjs data/makito-marcaje _site/data/marcaje
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const [SRC = "data/makito-marcaje", OUT = "_site/data/marcaje"] = process.argv.slice(2);
if (!existsSync(SRC)) { console.log("Sin " + SRC + ": el diseñador de merchandising queda sin zonas"); process.exit(0); }
mkdirSync(OUT, { recursive: true });
const T = JSON.parse(readFileSync(join(SRC, "tecnicas.json"), "utf8"));
const tec = {};
for (const [id, t] of Object.entries(T)) {
  const o = { name: t.name, max: t.max ?? null, full: !!t.full };
  if (t.minQ) o.minQ = t.minQ;
  if (t.puntadas) o.puntadas = t.puntadas;
  tec[id] = o;
}
writeFileSync(join(OUT, "tecnicas.json"), JSON.stringify(tec));
let prods = 0, areas = 0, conZona = 0;
for (const f of readdirSync(SRC).filter(f => /^m-[a-z]+\.json$/.test(f))) {
  const d = JSON.parse(readFileSync(join(SRC, f), "utf8")), o = {};
  for (const [ref, p] of Object.entries(d)) {
    const as = (p.areas || []).filter(a => a.mm && a.mm[0] > 0 && a.mm[1] > 0 && (a.tec || []).some(([id]) => tec[id])).map(a => {
      const x = { id: a.id, lab: a.lab || a.pos || a.id, mm: a.mm, tec: a.tec.filter(([id]) => tec[id]) };
      if (a.box && a.img) { x.box = a.box; x.img = a.img; if (a.col) x.col = 1; if (a.forma) x.forma = a.forma; if (a.quad) x.quad = a.quad; conZona++; }
      return x;
    });
    if (!as.length) continue;
    o[ref] = { areas: as }; prods++; areas += as.length;
  }
  writeFileSync(join(OUT, f), JSON.stringify(o));
}
console.log(`Marcaje para la web: ${prods} productos · ${areas} áreas (${conZona} con zona dibujada) · ${Object.keys(tec).length} técnicas`);
