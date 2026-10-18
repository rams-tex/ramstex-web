// Pide a TopTex el catálogo completo como archivo (result_in_file) y muestra cómo responde.
import { writeFileSync, mkdirSync } from "node:fs";
const BASE = "https://api.toptex.io";
const KEY = process.env.TOPTEX_API_KEY, USER = process.env.TOPTEX_USER, PASS = process.env.TOPTEX_PASSWORD;
const out = [];
const a = await (await fetch(BASE + "/v3/authenticate", { method: "POST", headers: { "x-api-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ username: USER, password: PASS }) })).json();
const H = { headers: { "x-api-key": KEY, "x-toptex-authorization": a.token } };
const r = await fetch(BASE + "/v3/products/all?lang=es&usage_right=b2b_b2c&result_in_file=1", H);
const t = await r.text(); out.push("result_in_file -> " + r.status + " " + t.replace(/token=[^&"]+/g, "token=(oculto)").slice(0, 800));
mkdirSync("diagnostico", { recursive: true }); writeFileSync("diagnostico/toptex-archivo.txt", out.join("\n")); console.log(out.join("\n").slice(0, 300));
