// Explora las tarifas de Makito (precio del artículo por cantidades y tarifa de marcaje por técnica) para unas referencias.
// Solo LEE (/price-list y /print-price-list; nunca pedidos). El resultado lleva costes: se escribe en $SALIDA (fuera del repo)
// y el flujo lo cifra antes de guardarlo.
import { writeFileSync } from "node:fs";
import { makitoGet } from "./makito-api.mjs";
const REFS = (process.env.PRECIOS_REFS || "").split(",").map(s => s.trim().replace(/^MK/, "")).filter(Boolean);
const listIn = x => Array.isArray(x) ? x : x && typeof x === "object" ? (Object.values(x).find(Array.isArray) || []) : [];
const res = { fecha: new Date().toISOString(), log: [] };
const pr = await makitoGet("/price-list/files?format=JSON");
const pl = listIn(pr);
res.log.push(`price-list: ${pl.length} filas · claves: ${Object.keys(pl[0] || {}).join(", ")}`);
res.articulos = pl.filter(x => REFS.some(r => String(x.material || x.ref || "").includes(r))).slice(0, 80);
res.muestraArticulo = pl.slice(0, 3);
const pc = await makitoGet("/print-config/files?format=JSON&lang=es");
const pcl = listIn(pc?.products || pc);
res.config = pcl.filter(p => REFS.includes(String(p.id)));
res.tecnicas = pc.techniques;
const pp = await makitoGet("/print-price-list/files?format=JSON");
const ppl = listIn(pp?.printPriceList || pp);
res.log.push(`print-price-list: ${ppl.length} filas · claves raíz: ${pp && !Array.isArray(pp) ? Object.keys(pp).join(", ") : "lista"}`);
res.tarifaMarcaje = ppl;
writeFileSync(process.env.SALIDA || "/tmp/makito-precios.json", JSON.stringify(res));
console.log(res.log.join("\n"));
