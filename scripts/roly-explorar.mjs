// Prueba de conexión con la API de Roly.
// Se conecta con el usuario del área de cliente (guardado como secreto en GitHub),
// y muestra en el registro la ESTRUCTURA de los datos (nombres de campos y un ejemplo),
// sin precios ni datos de acceso. No modifica nada.
const BASE = "https://clientsws.gorfactory.es:2096";
const user = process.env.ROLY_USER, pass = process.env.ROLY_PASSWORD;
if (!user || !pass) { console.error("Faltan los secretos ROLY_USER y ROLY_PASSWORD."); process.exit(1); }

const PRIV = /price|precio|tarifa|cost|discount|descuento|password|token/i;
function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `(${v.length} elementos)`] : [];
  if (v && typeof v === "object") {
    if (depth > 5) return "{…}";
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = PRIV.test(k) ? "(oculto)" : shape(x, depth + 1);
    return o;
  }
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  return v;
}
async function call(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 300); }
  return { status: r.status, data: j };
}

const login = await call("/api/v1.1/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: user, password: pass }),
});
console.log("Login:", login.status);
const token = typeof login.data === "string" ? login.data
  : (login.data?.token || login.data?.access_token || login.data?.accessToken || login.data?.Token);
if (!token) { console.log("Respuesta del login (sin token):", JSON.stringify(shape(login.data))); process.exit(1); }
const H = { headers: { Authorization: "Bearer " + token } };

for (const brand of ["ROLY", "roly", "R", "1"]) {
  const c = await call(`/api/v1/item/categories/tree?lang=es-ES&brand=${brand}`, H);
  console.log(`\n== Categorías (brand=${brand}) -> ${c.status}`);
  if (c.status === 200) { console.log(JSON.stringify(shape(c.data), null, 1).slice(0, 4000)); 
    const cat = await call(`/api/v1.1/item/getcatalog?lang=es-ES&brand=${brand}`, H);
    console.log(`\n== Catálogo (brand=${brand}) -> ${cat.status}`);
    console.log(JSON.stringify(shape(cat.data), null, 1).slice(0, 8000));
    const m = await call(`/api/v1/model/get?lang=es-ES&brand=${brand}`, H);
    console.log(`\n== Modelos (brand=${brand}) -> ${m.status}`);
    console.log(JSON.stringify(shape(m.data), null, 1).slice(0, 5000));
    break;
  } else console.log(JSON.stringify(c.data).slice(0, 300));
}
