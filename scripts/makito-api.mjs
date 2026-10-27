// Cliente de SOLO LECTURA para la API B2B de Makito (https://apis.makito.es).
// - Login con MAKITO_CLIENT_ID / MAKITO_CLIENT_SECRET -> token JWT (dura 60 min; se renueva solo).
// - Límite de la API: cubo de 100 peticiones que se rellena a 25 por minuto. Aquí se hace como mucho
//   1 petición cada 2,5 s (24/min) y, si la API avisa de que quedan pocas (x-ratelimit-remaining) o
//   responde 429, se espera más.
// - Nunca se llama a pedidos (/orders): solo catálogo, stock, configuración de marcaje y fotos.
export const MAKITO = "https://apis.makito.es";
const ALLOWED = /^\/(catalog|stock|print-config)\//;
let token = "", tokenAt = 0, last = 0, remaining = 100;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function slot() {
  const gap = remaining < 10 ? 6000 : remaining < 30 ? 3500 : 2500;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
}
export async function makitoLogin() {
  const id = process.env.MAKITO_CLIENT_ID, secret = process.env.MAKITO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Faltan los secretos MAKITO_CLIENT_ID y MAKITO_CLIENT_SECRET");
  await slot();
  const r = await fetch(MAKITO + "/access/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: id, clientSecret: secret }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error("Login de Makito rechazado (HTTP " + r.status + ")");
  token = j.token; tokenAt = Date.now();
}
// GET de solo lectura. raw=true devuelve los bytes (fotos).
export async function makitoGet(path, { raw = false, tries = 4 } = {}) {
  const rel = path.replace(MAKITO, "");
  if (!ALLOWED.test(rel)) throw new Error("Ruta no permitida (solo lectura): " + rel.slice(0, 40));
  for (let t = 0; t < tries; t++) {
    if (!token || Date.now() - tokenAt > 50 * 60000) await makitoLogin();
    await slot();
    let r;
    try { r = await fetch(MAKITO + rel, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(120000) }); }
    catch (e) { await sleep(10000); continue; }
    const rem = r.headers.get("x-ratelimit-remaining"); if (rem != null) remaining = +rem;
    if (r.status === 429) { remaining = 0; await sleep(65000); continue; }
    if (r.status === 401) { token = ""; continue; }
    if (r.status >= 500) { await sleep(15000); continue; }
    if (!r.ok) { const e = new Error("HTTP " + r.status + " " + rel.slice(0, 80)); e.status = r.status; throw e; }
    return raw ? Buffer.from(await r.arrayBuffer()) : await r.json();
  }
  throw new Error("Sin respuesta de Makito: " + rel.slice(0, 80));
}
