// Diagnóstico: lista de modelos y tabla "Disponible" de JHK con el token de la API.
import { writeFileSync, mkdirSync } from "node:fs";
const T = process.env.JHK_TOKEN, out = [];
const B = "https://www.jhktshirt.com/stock/index.php/es/depositos/";
for (const [name, u] of [
  ["search", B + "search?token=" + encodeURIComponent(T)],
  ["todos", B + "ajaxloadstock?use_ks=1&tipo=available&almacen=5&producto=&prodname=&token=" + encodeURIComponent(T)],
  ["categoria", B + "ajaxloadstock?use_ks=1&tipo=available&almacen=5&grupo=3&categoria=&producto=&token=" + encodeURIComponent(T)],
]) {
  try {
    const r = await fetch(u, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    const h = await r.text();
    const opts = [...h.matchAll(/<option value="(\d+)"[^>]*>\s*([A-Z0-9]+)\s*-/g)].length;
    const tablas = (h.match(/id="dataExistence"/g) || []).length;
    out.push(`== ${name}: HTTP ${r.status}, ${h.length} bytes, opciones de modelo: ${opts}, tablas: ${tablas}`);
    out.push(h.replace(/\s+/g, " ").slice(0, 600));
  } catch (e) { out.push(name + " error " + e.message); }
}
mkdirSync("diagnostico", { recursive: true });
writeFileSync("diagnostico/jhk.txt", out.join("\n").replaceAll(T, "(token)"));
