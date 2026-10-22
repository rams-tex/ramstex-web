// Diagnóstico: tabla "Disponible" de JHK con el token (filas clave) para comparar con la web.
import { writeFileSync, mkdirSync } from "node:fs";
const T = process.env.JHK_TOKEN, out = [];
for (const [ref, id] of [["SWRA290", 54], ["SWKNGOVER", 678]]) {
  const u = `https://www.jhktshirt.com/stock/index.php/es/depositos/ajaxloadstock?use_ks=1&tipo=available&almacen=5&producto=${id}&prodname=${ref}&token=${encodeURIComponent(T)}`;
  const h = await (await fetch(u, { headers: { "X-Requested-With": "XMLHttpRequest" } })).text();
  out.push(`== ${ref} ${(h.match(/nroprendas">([^<]*)/) || [])[1]} ${(h.match(/strdate">([^<]*)/) || [])[1]}`);
  for (const tr of h.split(/<tr/).slice(1)) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (/White|Black|Ivory|Total|XS/.test(cells.join(" "))) out.push(cells.join("|"));
  }
}
mkdirSync("diagnostico", { recursive: true });
writeFileSync("diagnostico/jhk.txt", out.join("\n").replaceAll(T, "(token)"));
