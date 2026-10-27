// Hojas de contacto para revisar el encuadre: fotos con el contorno medido (azul) y la zona de impresión (rojo),
// calculada con dzGeom de index.html, igual que en el diseñador.
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { contexto } from "./encuadres-lista.mjs";

const T = 300, COLS = 8;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function diagnostico(dir, fotos, med, bajar) {
  mkdirSync(dir, { recursive: true });
  const ctx = contexto();
  const az = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  const lado = az(fotos.filter(x => /^s/.test(x.k)));
  const fijas = lado.filter(x => /^NS305$/.test(x.ref)).slice(0, 1);
  const tt = lado.filter(x => x.sup === "toptex" && !fijas.includes(x)), fr = lado.filter(x => x.sup !== "toptex");
  const hojas = [
    ["laterales-1", [...fijas, ...tt.slice(0, 32 - fijas.length), ...fr.slice(0, 8)]],
    ["laterales-2", [...tt.slice(32, 64), ...fr.slice(8, 16)]],
    ["delante-espalda", az(fotos.filter(x => x.k === "f" || x.k === "b")).slice(0, 24)],
  ];
  for (const [nom, lista] of hojas) {
    const tiles = [];
    for (const x of lista) {
      const buf = await bajar(x.url); if (!buf) continue;
      const { data, info } = await sharp(buf).flatten({ background: "#ffffff" }).resize(T, T, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height;
      const B = ctx.DZ_TPL[x.tpl], tpl = { bw: B.bw, cuerpo: !!B.cuerpo, z: {} };
      for (const p of Object.keys(B.z)) tpl.z[p] = Object.assign({ dx: 0 }, B.z[p]);
      const side = /^s/.test(x.k);
      const pos = side ? (x.k === "sl" ? "mi" : x.k === "sr" ? "md" : x.side === "d" ? "md" : "mi") : Object.keys(tpl.z).find(p => tpl.z[p].v === (x.k === "b" ? "b" : "f"));
      if (!pos || !tpl.z[pos]) continue;
      const sup = ctx.DZ_SUP[x.sup] || ctx.DZ_DEF;
      let f = med[x.st] ? ctx.dzEnc({ s: { [x.st]: med[x.st] } }, { r: x.ref }, x.st) : null, medida = !!f;
      if (!f) f = Object.assign({}, (side && sup.sfr) || (side ? { x0: .3, y0: sup.fr.y0, x1: .7, y1: sup.fr.y1, bw: .4 } : sup.fr));
      const g = ctx.dzGeom({ im: { naturalWidth: W, naturalHeight: H }, fr: f, kind: side ? "side" : "front", flip: false, sup: x.sup }, tpl, pos, W, H, "full");
      const ax = (g.ax - g.ox) / g.z, ay = (g.ay - g.oy) / g.z, aw = g.aw / g.z, ah = g.ah / g.z;
      const det = f.sx != null ? "manga medida" : "manga por defecto";
      const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${f.x0 * W}" y="${f.y0 * H}" width="${(f.x1 - f.x0) * W}" height="${(f.y1 - f.y0) * H}" fill="none" stroke="#2a6df4" stroke-width="1" stroke-dasharray="${medida ? "" : "4 3"}"/>
        <rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="rgba(230,0,0,.18)" stroke="#e00000" stroke-width="2"/>
        <text x="4" y="${H - 6}" font-family="sans-serif" font-size="12" fill="#000">${esc(x.ref + " " + x.k + " · " + (side ? det : medida ? "medida" : "sin medida"))}</text>
        <text x="4" y="14" font-family="sans-serif" font-size="11" fill="#555">${esc((x.col || "").slice(0, 30))}</text></svg>`;
      const px = T - W, py = T - H; /* foto entera, centrada en su casilla */
      tiles.push(await sharp(await sharp(data, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer())
        .extend({ left: px >> 1, right: px - (px >> 1), top: py >> 1, bottom: py - (py >> 1), background: "#ffffff" }).png().toBuffer());
    }
    if (!tiles.length) continue;
    const rows = Math.ceil(tiles.length / COLS);
    await sharp({ create: { width: COLS * T, height: rows * T, channels: 3, background: "#dddddd" } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % COLS) * T, top: Math.floor(i / COLS) * T })))
      .jpeg({ quality: 78 }).toFile(`${dir}/${nom}.jpg`);
    console.log("Hoja", nom, tiles.length, "fotos");
  }
}

