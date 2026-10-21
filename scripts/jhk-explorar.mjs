// Diagnóstico de stock JHK: muestra los campos de stock de algunos productos tal como los da la API.
import { writeFileSync, mkdirSync } from "node:fs";
const T = process.env.JHK_TOKEN;
const out = [];
for (const ref of ["SWKNGOVER", "SWRAKNG", "TSRA150"]) {
  try {
    const r = await fetch(`https://www.jhktshirt.com/app/es/api/${T}/clothes/5/${ref}/product.json`);
    const p = await r.json();
    out.push(`== ${ref} (status ${r.status})`);
    out.push("claves producto: " + Object.keys(p).join(", "));
    const comb = p.combinations || {};
    for (const [color, sizes] of Object.entries(comb)) {
      for (const [size, v] of Object.entries(sizes || {})) out.push(`${color} ${size} ${JSON.stringify(v)}`);
    }
    // otros campos que puedan contener stock
    for (const [k, v] of Object.entries(p)) if (/stock|inventor|disponib|warehouse|almac/i.test(k)) out.push(`${k}: ${JSON.stringify(v).slice(0, 2000)}`);
    if (ref === "SWKNGOVER") out.push("descripcion: " + JSON.stringify(p.description || p.desc || "").slice(0, 400));
  } catch (e) { out.push(`${ref}: error ${e.message}`); }
}
mkdirSync("diagnostico", { recursive: true });
writeFileSync("diagnostico/jhk.txt", out.join("\n").replaceAll(T, "(token)"));
console.log(out.slice(0, 40).join("\n").replaceAll(T, "(token)"));
