// Crea la imagen de "Merchandising" de la portada: varios productos de Stamina
// colocados sobre un fondo cálido, como un bodegón. Resultado: merch-home.jpg
import sharp from "sharp";
const B = "https://static.gorfactory.es/images/models/";
const W = 1600, H = 1200, BG = { r: 238, g: 232, b: 224 };
// [imagen, x, y, ancho, alto, giro]
const ITEMS = [
  ["7124/model/large/7124_03_1_1", 70, 110, 560, 600, -4],     // mochila
  ["4122/model/large/4122_281_1_1", 600, 70, 260, 560, 0],     // botella
  ["8073/model/large/8073_31_1_1", 860, 90, 380, 480, 6],      // libreta
  ["7030/model/large/7030_60_1_1", 1220, 120, 330, 260, 0],    // gorra
  ["1641/model/large/1641_02_1_1", 1240, 420, 300, 280, 0],    // taza
  ["1061/model/large/1061_60_1_1", 110, 740, 330, 330, 0],     // altavoz
  ["2010/model/large/2010_31_1_1", 470, 700, 380, 380, 35],    // bolígrafo
  ["1288/model/large/1288_60_1_1", 830, 690, 300, 300, -20],   // batería
  ["7053/model/large/7053_48_1_1", 1150, 720, 380, 400, 0],    // lanyard
];
const layers = [];
for (const [p, x, y, w, h, rot] of ITEMS) {
  const r = await fetch(B + p + ".jpg");
  if (!r.ok) { console.log("No se pudo descargar", p); continue; }
  let img = sharp(Buffer.from(await r.arrayBuffer())).trim({ background: "#ffffff", threshold: 12 });
  img = sharp(await img.toBuffer()).resize(w, h, { fit: "inside" });
  if (rot) img = sharp(await img.toBuffer()).rotate(rot, { background: "#ffffff" });
  const buf = await img.flatten({ background: "#ffffff" }).toBuffer();
  const meta = await sharp(buf).metadata();
  layers.push({ input: buf, left: Math.round(x + (w - Math.min(w, meta.width)) / 2), top: Math.round(y + (h - Math.min(h, meta.height)) / 2), blend: "multiply" });
}
await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
  .composite(layers).jpeg({ quality: 84, progressive: true, mozjpeg: true }).toFile("merch-home.jpg");
await sharp("merch-home.jpg").resize(900).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toFile("merch-home-900.jpg");
console.log("Imagen creada con", layers.length, "productos");
