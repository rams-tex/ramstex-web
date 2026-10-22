// Diagnóstico: ¿se puede leer la tabla "Disponible" de JHK (la misma de su web) sin iniciar sesión?
import { writeFileSync, mkdirSync } from "node:fs";
const T = process.env.JHK_TOKEN;
const out = [];
for (const tok of ["", T]) {
  const u = `https://www.jhktshirt.com/stock/index.php/es/depositos/ajaxloadstock?use_ks=1&tipo=available&almacen=5&producto=54&prodname=SWRA290&token=${encodeURIComponent(tok)}`;
  try {
    const r = await fetch(u, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    const h = await r.text();
    out.push(`== token ${tok ? "API" : "vacío"}: HTTP ${r.status}, ${h.length} bytes, tiene Ivory: ${/Ivory/.test(h)}`);
    out.push(h.replace(/\s+/g, " ").slice(0, 1500));
  } catch (e) { out.push("error " + e.message); }
}
mkdirSync("diagnostico", { recursive: true });
writeFileSync("diagnostico/jhk.txt", out.join("\n").replaceAll(T, "(token)"));
console.log(out.join("\n").replaceAll(T, "(token)").slice(0, 3000));
