// Prueba del FTP de Sol's: lista las carpetas y muestra el principio de cada fichero CSV/XML.
// Usuario y contraseña vienen de los secretos de GitHub (SOLS_FTP_USER / SOLS_FTP_PASSWORD), nunca del código.
import { Client } from "basic-ftp";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const out = [], log = s => { out.push(s); console.log(s); };
const c = new Client(30000);
try {
  await c.access({ host: "csv.sols.es", user: process.env.SOLS_FTP_USER, password: process.env.SOLS_FTP_PASSWORD, secure: false });
  log("Conectado. Carpeta inicial: " + await c.pwd());
  const walk = async (dir, depth) => {
    const list = await c.list(dir);
    for (const f of list) {
      const p = (dir === "/" ? "" : dir) + "/" + f.name;
      log(`${"  ".repeat(depth)}${f.isDirectory ? "[dir] " : ""}${p}  ${f.size} bytes  ${f.modifiedAt ? f.modifiedAt.toISOString() : f.rawModifiedAt || ""}`);
      if (f.isDirectory && depth < 2) await walk(p, depth + 1);
      else if (/\.(csv|xml|txt)$/i.test(f.name)) {
        mkdirSync("tmp", { recursive: true });
        const local = "tmp/" + f.name;
        try {
          await c.downloadTo(local, p);
          const txt = readFileSync(local, "latin1");
          log("----- " + p + " (" + txt.split(/\r?\n/).length + " líneas; primeras)\n" + txt.split(/\r?\n/).slice(0, 6).join("\n") + "\n-----");
        } catch (e) { log("  no se pudo descargar: " + e.message); }
      }
    }
  };
  await walk("/", 0);
} catch (e) { log("Error: " + e.message); }
c.close();
mkdirSync("diagnostico", { recursive: true });
writeFileSync("diagnostico/sols.txt", out.join("\n"));
