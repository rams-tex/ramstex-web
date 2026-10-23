// Diagnóstico 2 Falk&Ross: ¿las fotos se sirven por https?, ¿hay vistas de espalda por color?, y stock.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
mkdirSync("diagnostico", { recursive: true });
const out = [];
const head = async u => { try { const r = await fetch(u, { method: "GET", signal: AbortSignal.timeout(60000) }); const b = await r.arrayBuffer(); return `${r.status} ${r.headers.get("content-type")} ${b.byteLength}B`; } catch (e) { return "error " + e.message; } };
for (const nr of ["99967", "11033", "10209"]) {
  const x = await (await fetch(`http://download.falk-ross.eu/ws/R000-011/xml/${nr}.xml`)).text().catch(() => "");
  const pics = [...x.matchAll(/<sku_color_picture>([^<]+)</g)].map(m => m[1]);
  const sp = [...x.matchAll(/<filename><!\[CDATA\[([^\]]+)\]\]>/g)].map(m => m[1]);
  out.push(`\n## ${nr}: fotos color ${new Set(pics).size}, fotos estilo ${sp.join(" ")}`);
  const f = pics[0]; if (!f) continue;
  for (const u of [`https://download.falk-ross.eu/ws/picture/${f}`, `http://download.falk-ross.eu/ws/picture/${f}`,
    `http://download.falk-ross.eu/ws/picture/${f.replace("_f-", "_b-")}`, `http://download.falk-ross.eu/ws/picture/${f.replace("_f-", "_m-")}`,
    `https://www.falk-ross.eu/media/${f}`]) out.push(`${u} -> ${await head(u)}`);
}
const U = process.env.FALKROSS_USER, P = process.env.FALKROSS_PASSWORD;
if (U && P) {
  out.push(`\nUsuario: ${U.length} car., empieza ${U.slice(0, 4)}, espacios ${/\s/.test(U)}; contraseña ${P.length} car., espacios ${/\s/.test(P)}`);
  const u = U.trim(), p = P.trim();
  const h = { Authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64"), "Cache-Control": "no-cache", Connection: "close", "Content-type": "application/x-www-form-urlencoded" };
  for (const [m, url] of [["GET", "R03_000/stockinfo/product/10209?format=csv"], ["POST", "R03_000/stockinfo/product/10209?format=csv"], ["GET", "R01_000/stockinfo/product/10209?format=csv"], ["GET", "R03_000/stockinfo/falkross_de.csv"]]) {
    try {
      const r = await fetch("https://ws.falk-ross.eu/webservice/" + url, { method: m, headers: m === "POST" ? { ...h, "Content-Length": "0" } : h, body: m === "POST" ? "" : undefined, signal: AbortSignal.timeout(120000) });
      const t = await r.text(); const l = t.trim().split(/\r?\n/);
      out.push(`${m} ${url} -> HTTP ${r.status} ${r.headers.get("www-authenticate") || ""}: ${l.length} líneas | ${t.slice(0, 300).replace(/\s+/g, " ")}`);
      if (r.ok && l.length > 2) out.push(`con verde+azul>0: ${l.slice(1).filter(x => { const c = x.split(";"); return +c[1] + +c[3] > 0; }).length}`);
    } catch (e) { out.push(m + " " + url + " error " + e.message); }
  }
} else out.push("\nStock: faltan secretos");
writeFileSync("diagnostico/falkross2.txt", out.join("\n").replaceAll(P || "\u0000", "(pw)"));
