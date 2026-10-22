// Diagnóstico: ¿la página de pedido de JHK (stock 24h y 48/72h) se puede leer con el token de la API?
import { writeFileSync, mkdirSync } from "node:fs";
const T = process.env.JHK_TOKEN, out = [];
for (const u of [
  `https://www.jhktshirt.com/crm/es/pedidos/newd?reference=swkngover&token=${encodeURIComponent(T)}`,
  `https://www.jhktshirt.com/app/es/api/${T}/clothes/5/SWKNGOVER/stock.json`,
  `https://www.jhktshirt.com/app/es/api/${T}/stock/5/SWKNGOVER.json`,
]) {
  try {
    const r = await fetch(u, { redirect: "manual" });
    const h = await r.text();
    out.push(`== ${u.replace(T, "(token)")} -> HTTP ${r.status} ${r.headers.get("location") ? "redirige a " + r.headers.get("location").replace(T, "(token)") : ""}, ${h.length} bytes, stocknob: ${h.includes("stocknob")}`);
    out.push(h.replace(/\s+/g, " ").slice(0, 300));
  } catch (e) { out.push("error " + e.message); }
}
mkdirSync("diagnostico", { recursive: true });
writeFileSync("diagnostico/jhk.txt", out.join("\n").replaceAll(T, "(token)"));
