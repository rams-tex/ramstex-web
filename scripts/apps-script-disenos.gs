/*
 * Ramstex · Diseños y solicitudes de presupuesto de la web (Google Apps Script)
 * ============================================================================
 * Qué hace este script (una sola dirección /exec para las dos cosas):
 *
 * 1. DISEÑOS: cuando un cliente ha usado el diseñador de la web, la web manda aquí su logo (archivo original)
 *    y la vista previa. El script crea una carpeta en tu Google Drive para ese pedido (fecha + número corto,
 *    por ejemplo «2026-10-26 RX-261026-K7PQ»), guarda dentro los archivos y devuelve el enlace de la carpeta.
 *
 * 2. SOLICITUDES DE PRESUPUESTO: cuando un cliente rellena el formulario «Solicitar presupuesto» de la web:
 *      - te llega un correo a EMAIL_AVISOS con todo el pedido (productos, tallas, diseño, datos del cliente,
 *        plazo, comentarios, enlace a la carpeta de diseños) y el PDF adjunto. Si pulsas «Responder»,
 *        le contestas directamente al cliente.
 *      - el cliente recibe un correo de confirmación con su número de solicitud y el resumen.
 *      - se apunta una línea en la hoja de cálculo «Solicitudes de presupuesto» (se crea sola la primera vez,
 *        dentro de la carpeta CARPETA_ID). En la columna «Estado» puedes ir poniendo Enviado, Aceptado…
 *
 * SI YA TENÍAS EL SCRIPT ANTERIOR FUNCIONANDO (actualizar, unos 5 minutos)
 * ----------------------------------------------------------------------
 * 1. Entra en https://script.google.com y abre el proyecto «Ramstex diseños».
 * 2. Borra todo el código que hay y pega este archivo completo. Pulsa el icono de guardar.
 * 3. Arriba, en el desplegable de funciones (al lado de «Ejecutar» / «Depurar»), elige «autorizar» y pulsa «Ejecutar».
 *    Google te pedirá permiso para enviar correos y usar Hojas de cálculo y Drive: pulsa «Revisar permisos»,
 *    elige tu cuenta y acepta (si sale «Google no ha verificado esta aplicación», pulsa «Configuración avanzada»
 *    → «Ir a Ramstex diseños»). Al terminar, en el registro de ejecución verás el enlace de la hoja de cálculo
 *    «Solicitudes de presupuesto» que se acaba de crear.
 * 4. Pulsa «Implementar» → «Gestionar implementaciones» → el lápiz (Editar) → en «Versión» elige «Nueva versión»
 *    → «Implementar». La URL sigue siendo la misma: no hay que tocar la web.
 * 5. Prueba: en la web añade un producto al presupuesto, pulsa «Solicitar presupuesto» y envía el formulario
 *    con tu propio correo. Te tienen que llegar los dos correos (el de aviso y el de confirmación).
 *
 * PONERLO EN MARCHA DESDE CERO (solo si no existe el proyecto)
 * -----------------------------------------------------------
 * 1. En https://drive.google.com crea una carpeta (por ejemplo «Diseños web»), ábrela y copia el código que sale en
 *    la barra de direcciones después de «/folders/». Pégalo más abajo en CARPETA_ID.
 * 2. En https://script.google.com pulsa «Nuevo proyecto», ponle de nombre «Ramstex diseños», borra lo que aparece,
 *    pega este archivo y guarda. Ejecuta «autorizar» como en el paso 3 de arriba.
 * 3. «Implementar» → «Nueva implementación» → engranaje «Aplicación web»: Ejecutar como «Yo», Quién tiene acceso
 *    «Cualquier usuario» → «Implementar». Copia la «URL de la aplicación web» (termina en /exec) y ponla en la web
 *    (index.html, línea  var DISENO_URL="...";).
 *
 * Comprobar que funciona: abre la URL /exec en el navegador; debe decir {"ok":true,"servicio":"Ramstex diseños",...}.
 * Límite de Google: una cuenta de Gmail puede enviar unos 100 correos al día con este método (cada solicitud usa 2).
 *
 * Importante: los archivos de diseño quedan como «cualquier persona con el enlace puede verlos» para que el enlace
 * funcione sin pedir permisos. Nadie puede encontrarlos sin el enlace. La hoja de cálculo es privada (solo tú).
 */

// ID de la carpeta «Diseños web» de tu Drive. Si se deja vacío, se usa la carpeta principal de Drive.
var CARPETA_ID = "1xzkEmiCjU1n1sDgeoN6ctylc59sx0Zpt";

// A quién llegan los avisos de nuevas solicitudes. Para varios, sepáralos con comas: "info@ramstex.com, otro@ramstex.com"
var EMAIL_AVISOS = "info@ramstex.com";

// Datos que salen en el correo de confirmación al cliente
var WHATSAPP = "682 368 645";
var WEB = "https://ramstex.com";

// Nombre de la hoja de cálculo donde se apuntan las solicitudes
var NOMBRE_HOJA = "Solicitudes de presupuesto";

// Protección contra envíos masivos: como mucho estas solicitudes por hora (las demás se rechazan)
var MAX_POR_HORA = 30;

// Tamaño máximo que se acepta por envío (en MB). Apps Script admite hasta unos 50 MB.
var MAX_MB = 40;

var ZONA = "Europe/Madrid";
var COLUMNAS = ["Fecha", "Referencia", "Nombre", "Empresa", "Correo", "Teléfono", "NIF/CIF", "Provincia / CP", "Plazo", "Fecha límite", "Total uds.", "Productos", "Carpeta de diseños", "Estado"];

/** La web envía aquí los diseños y las solicitudes de presupuesto (POST con texto JSON). */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return responder({ ok: false, error: "Sin datos" });
    if (e.postData.contents.length > MAX_MB * 1024 * 1024 * 1.37) return responder({ ok: false, error: "Demasiado grande" });
    var datos = JSON.parse(e.postData.contents);
    if (datos && datos.tipo === "presupuesto") return responder(solicitud(datos));
    return responder(subirArchivos(datos));
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

/** Para comprobar en el navegador que la aplicación está en marcha. */
function doGet() {
  return responder({ ok: true, servicio: "Ramstex diseños", presupuestos: true });
}

/** Ejecútala una vez desde el editor después de pegar el código: pide los permisos y crea la hoja. */
function autorizar() {
  var carpeta = CARPETA_ID ? DriveApp.getFolderById(CARPETA_ID) : DriveApp.getRootFolder();
  var hoja = hojaSolicitudes();
  Logger.log("Carpeta de diseños: " + carpeta.getName());
  Logger.log("Hoja de solicitudes: " + hoja.getParent().getUrl());
  Logger.log("Correos que quedan hoy: " + MailApp.getRemainingDailyQuota());
}

/* ================= 1. Diseños: carpeta en Drive con los archivos ================= */
function subirArchivos(datos) {
  var pedido = limpiar(datos.pedido) || ("RX-" + Utilities.formatDate(new Date(), ZONA, "yyMMdd-HHmmss"));
  var fecha = Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd");
  var cliente = limpiar(datos.cliente);

  // Carpeta del pedido: «2026-10-26 RX-261026-K7PQ» (y el cliente si lo hay)
  var raiz = CARPETA_ID ? DriveApp.getFolderById(CARPETA_ID) : DriveApp.getRootFolder();
  var carpeta = raiz.createFolder(fecha + " " + pedido + (cliente ? " " + cliente : ""));
  carpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Resumen en texto de lo que ha pedido (producto, color y medidas de cada zona)
  var lineas = (datos.lineas || []).map(function (l) {
    return "- " + (l.nombre || "") + " (ref. " + (l.ref || "") + ") · " + (l.color || "") + "\n  " + (l.diseno || "");
  }).join("\n");
  if (lineas) carpeta.createFile("Pedido " + pedido + ".txt", "Pedido " + pedido + " · " + fecha + "\n\n" + lineas + "\n", MimeType.PLAIN_TEXT);

  // Archivos: logos originales y vistas previas
  var enlaces = [];
  (datos.files || []).concat(datos.mockups || []).forEach(function (f) {
    if (!f || !f.base64) return;
    var blob = Utilities.newBlob(Utilities.base64Decode(f.base64), f.mime || "application/octet-stream", limpiar(f.name) || "archivo");
    var archivo = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    enlaces.push(archivo.getUrl());
  });

  return { ok: true, folderUrl: carpeta.getUrl(), files: enlaces };
}

/* ================= 2. Solicitud de presupuesto: correos + hoja ================= */
function solicitud(d) {
  var c = d.contacto || {}, en = d.entrega || {}, pl = d.plazo || {};
  var ref = /^RX-\d{6}-[A-Z0-9]{4,6}$/.test(String(d.pedido || "")) ? String(d.pedido) : "RX-" + Utilities.formatDate(new Date(), ZONA, "yyMMdd-HHmmss");

  // Campo trampa: las personas no lo ven; si viene relleno es un robot. Se responde «ok» sin enviar nada.
  if (texto(d.web)) return { ok: true, ref: ref };

  // Como mucho MAX_POR_HORA solicitudes por hora
  var cache = CacheService.getScriptCache(), clave = "presupuestos-" + Utilities.formatDate(new Date(), ZONA, "yyyyMMddHH");
  var n = parseInt(cache.get(clave) || "0", 10) || 0;
  if (n >= MAX_POR_HORA) return { ok: false, error: "limite" };
  cache.put(clave, String(n + 1), 3600);

  var email = texto(c.email, 200), nombre = texto(c.nombre, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !nombre || !texto(c.telefono)) return { ok: false, error: "Faltan datos de contacto" };
  var lineas = (Array.isArray(d.lineas) ? d.lineas : []).slice(0, 200);
  if (!lineas.length) return { ok: false, error: "El presupuesto está vacío" };

  var s = {
    ref: ref,
    fecha: new Date(),
    nombre: nombre,
    empresa: texto(c.empresa, 120),
    email: email,
    telefono: texto(c.telefono, 40),
    nif: texto(c.nif, 30).toUpperCase(),
    provincia: texto(en.provincia, 120),
    cp: texto(en.cp, 12),
    urgente: pl.tipo === "urgente",
    plazo: pl.tipo === "urgente" ? "Urgente (con suplemento)" : "Estándar (7-10 días laborables)",
    limite: fechaES(pl.fecha),
    comentarios: texto(d.comentarios, 3000),
    carpeta: enlaceDrive(d.carpeta),
    lineas: lineas.map(function (l) {
      var tallas = [];
      if (l && l.tallas && typeof l.tallas === "object") Object.keys(l.tallas).forEach(function (z) {
        var q = parseInt(l.tallas[z], 10); if (q > 0) tallas.push([texto(z, 20), q]);
      });
      return { nombre: texto(l && l.nombre, 160), ref: texto(l && l.ref, 40), color: texto(l && l.color, 80), tallas: tallas,
        unidades: Math.max(0, parseInt(l && l.unidades, 10) || 0), diseno: texto(l && l.diseno, 600), carpeta: enlaceDrive(l && l.carpeta) };
    })
  };
  s.total = s.lineas.reduce(function (a, l) { return a + l.unidades; }, 0);
  s.sinCantidad = s.lineas.filter(function (l) { return !l.unidades; }).length;
  if (!s.carpeta) s.carpeta = (s.lineas.filter(function (l) { return l.carpeta; })[0] || {}).carpeta || "";

  var pdf = null;
  if (d.pdf && typeof d.pdf === "string" && d.pdf.length < 3 * 1024 * 1024 * 1.37) {
    try { pdf = Utilities.newBlob(Utilities.base64Decode(d.pdf), "application/pdf", "Presupuesto " + ref + ".pdf"); } catch (err) { pdf = null; }
  }

  s.pdf = !!pdf;

  // 1) Aviso a Ramstex (si esto falla, la web ofrece WhatsApp al cliente)
  var quien = s.empresa || s.nombre;
  var asunto = "Nueva solicitud de presupuesto · " + quien + " · " + (s.total ? s.total + " uds" : "uds por definir") + " · " + ref + (s.urgente ? " · URGENTE" : "");
  var aviso = { to: destinatarios(), subject: asunto, htmlBody: htmlAviso(s), body: textoAviso(s), replyTo: s.email, name: "Web Ramstex" };
  if (pdf) aviso.attachments = [pdf];
  try {
    MailApp.sendEmail(aviso);
  } catch (err) {
    apuntar(s, "Error al enviar el aviso: " + String(err).slice(0, 80));
    return { ok: false, error: "No se pudo enviar el correo" };
  }

  // 2) Confirmación al cliente (si falla, la solicitud ya está recibida)
  try {
    var conf = { to: s.email, subject: "Hemos recibido tu solicitud de presupuesto · " + ref, htmlBody: htmlCliente(s), body: textoCliente(s), replyTo: destinatarios().split(",")[0].trim(), name: "Ramstex" };
    if (pdf) conf.attachments = [pdf];
    MailApp.sendEmail(conf);
  } catch (err) { Logger.log("Confirmación no enviada: " + err); }

  // 3) Hoja de cálculo
  apuntar(s, "Nuevo");

  return { ok: true, ref: ref };
}

/** Añade la solicitud a la hoja «Solicitudes de presupuesto» (nunca hace fallar la solicitud). */
function apuntar(s, estado) {
  try {
    var lock = LockService.getScriptLock();
    lock.tryLock(10000);
    try {
      hojaSolicitudes().appendRow([s.fecha, s.ref, s.nombre, s.empresa, s.email, s.telefono, s.nif,
        [s.provincia, s.cp].filter(String).join(" · "), s.plazo, s.limite, s.total, resumenProductos(s), s.carpeta, estado]);
    } finally { lock.releaseLock(); }
  } catch (err) { Logger.log("No se pudo apuntar en la hoja: " + err); }
}

/** La hoja de cálculo: la guardada o una nueva dentro de la carpeta de diseños. */
function hojaSolicitudes() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty("HOJA_ID"), libro = null;
  if (id) { try { libro = SpreadsheetApp.openById(id); } catch (err) { libro = null; } }
  if (!libro) {
    libro = SpreadsheetApp.create(NOMBRE_HOJA);
    var h = libro.getSheets()[0];
    h.setName("Solicitudes");
    h.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight("bold").setBackground("#EDEDEB");
    h.setFrozenRows(1);
    h.setColumnWidth(12, 380);
    try { DriveApp.getFileById(libro.getId()).moveTo(CARPETA_ID ? DriveApp.getFolderById(CARPETA_ID) : DriveApp.getRootFolder()); } catch (err) { Logger.log("La hoja se queda en Mi unidad: " + err); }
    props.setProperty("HOJA_ID", libro.getId());
  }
  return libro.getSheets()[0];
}

/* ---------- Correos ---------- */
var ROJO = "#982626", TINTA = "#141414", GRIS = "#5A5A5A", LINEA = "#D6D6D2", FONDO = "#F7F7F6";

function tallasTexto(l) {
  if (!l.unidades) return "Cantidades por definir";
  if (!l.tallas.length) return l.unidades + " uds.";
  return l.tallas.map(function (t) { return t[0] + " × " + t[1]; }).join(" · ");
}
function resumenProductos(s) {
  return s.lineas.map(function (l) {
    return l.nombre + " (ref. " + l.ref + ", " + l.color + "): " + tallasTexto(l) + (l.unidades && l.tallas.length ? " = " + l.unidades + " uds." : "") + (l.diseno ? " · Diseño: " + l.diseno : "");
  }).join("\n");
}
function filaDato(k, v) {
  return v ? '<tr><td style="padding:4px 16px 4px 0;color:' + GRIS + ';white-space:nowrap;vertical-align:top">' + esc(k) + '</td><td style="padding:4px 0;color:' + TINTA + '">' + v + "</td></tr>" : "";
}
function tablaLineas(s) {
  var filas = s.lineas.map(function (l) {
    return '<tr><td style="padding:12px 12px 12px 0;border-bottom:1px solid ' + LINEA + ';vertical-align:top">' +
      '<b style="color:' + TINTA + '">' + esc(l.nombre) + "</b><br>" +
      '<span style="color:' + GRIS + ';font-size:13px">Ref. ' + esc(l.ref) + " · " + esc(l.color) + "</span>" +
      '<div style="margin-top:6px;font-size:14px;color:' + (l.unidades ? TINTA : GRIS) + '">' + esc(tallasTexto(l)) + "</div>" +
      (l.diseno ? '<div style="margin-top:6px;font-size:13px;color:' + TINTA + '"><b>Diseño:</b> ' + esc(l.diseno) + "</div>" : "") +
      (l.carpeta && l.carpeta !== s.carpeta ? '<div style="margin-top:4px;font-size:13px"><a href="' + esc(l.carpeta) + '" style="color:' + ROJO + '">Archivos de este diseño</a></div>' : "") +
      "</td>" +
      '<td style="padding:12px 0;border-bottom:1px solid ' + LINEA + ';text-align:right;vertical-align:top;white-space:nowrap;font-weight:700;color:' + TINTA + '">' + (l.unidades ? l.unidades + " uds." : "—") + "</td></tr>";
  }).join("");
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px">' +
    '<tr><th align="left" style="padding:0 0 6px;border-bottom:2px solid ' + TINTA + ';font-size:12px;color:' + GRIS + ';text-transform:uppercase;letter-spacing:.04em">Producto</th>' +
    '<th align="right" style="padding:0 0 6px;border-bottom:2px solid ' + TINTA + ';font-size:12px;color:' + GRIS + ';text-transform:uppercase;letter-spacing:.04em">Unidades</th></tr>' +
    filas +
    '<tr><td style="padding:12px 0 0;font-weight:700;color:' + TINTA + '">Total' + (s.sinCantidad ? '<br><span style="font-weight:400;font-size:13px;color:' + GRIS + '">Más ' + s.sinCantidad + (s.sinCantidad === 1 ? " producto" : " productos") + " con cantidades por definir</span>" : "") + "</td>" +
    '<td style="padding:12px 0 0;text-align:right;font-weight:700;font-size:18px;color:' + ROJO + ';white-space:nowrap">' + s.total + " uds.</td></tr></table>";
}
function marco(titulo, cuerpo) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>' +
    '<body style="margin:0;padding:0;background:' + FONDO + '">' +
    '<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:' + TINTA + '">' +
    '<div style="font-size:22px;font-weight:800;letter-spacing:-.5px"><span style="color:' + ROJO + '">RAMS</span>TEX</div>' +
    '<div style="background:#fff;border:1px solid ' + LINEA + ';border-radius:12px;padding:24px;margin-top:16px">' +
    '<h1 style="margin:0 0 4px;font-size:22px;line-height:1.25;color:' + TINTA + '">' + titulo + "</h1>" + cuerpo + "</div>" +
    '<p style="margin:16px 0 0;font-size:12px;color:' + GRIS + '">Ramstex · <a href="mailto:info@ramstex.com" style="color:' + GRIS + '">info@ramstex.com</a> · WhatsApp ' + WHATSAPP + ' · <a href="' + WEB + '" style="color:' + GRIS + '">ramstex.com</a></p>' +
    "</div></body></html>";
}
function htmlAviso(s) {
  var tel = s.telefono.replace(/[^\d+]/g, ""), wa = tel.replace(/\D/g, "");
  if (wa.length === 9) wa = "34" + wa;
  var contacto = '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">' +
    filaDato("Nombre", esc(s.nombre)) +
    filaDato("Empresa", esc(s.empresa)) +
    filaDato("Correo", '<a href="mailto:' + esc(s.email) + '" style="color:' + ROJO + '">' + esc(s.email) + "</a>") +
    filaDato("Teléfono", '<a href="tel:' + esc(tel) + '" style="color:' + TINTA + '">' + esc(s.telefono) + '</a> · <a href="https://wa.me/' + esc(wa) + '" style="color:' + ROJO + '">WhatsApp</a>') +
    filaDato("NIF/CIF", esc(s.nif)) +
    filaDato("Entrega", esc([s.provincia, s.cp].filter(String).join(" · ")) || '<span style="color:' + GRIS + '">Sin indicar</span>') +
    filaDato("Plazo", (s.urgente ? '<b style="color:' + ROJO + '">' + esc(s.plazo) + "</b>" : esc(s.plazo))) +
    filaDato("Fecha límite", esc(s.limite)) +
    "</table>";
  var cuerpo = '<p style="margin:0 0 20px;color:' + GRIS + '">Nº ' + esc(s.ref) + " · " + Utilities.formatDate(s.fecha, ZONA, "dd/MM/yyyy HH:mm") + "</p>" +
    contacto +
    (s.comentarios ? '<div style="margin:16px 0 0;padding:12px 14px;background:' + FONDO + ';border-radius:8px;white-space:pre-wrap"><b>Comentarios</b><br>' + esc(s.comentarios) + "</div>" : "") +
    '<h2 style="margin:28px 0 10px;font-size:17px">Pedido</h2>' + tablaLineas(s) +
    (s.carpeta ? '<p style="margin:24px 0 0"><a href="' + esc(s.carpeta) + '" style="display:inline-block;background:' + ROJO + ';color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Ver los diseños en Drive</a></p>' : "") +
    '<p style="margin:24px 0 0;font-size:13px;color:' + GRIS + '">Pulsa «Responder» para contestar directamente a ' + esc(s.nombre) + "." + (s.pdf ? " El PDF del pedido va adjunto." : "") + "</p>";
  return marco("Nueva solicitud de presupuesto", cuerpo);
}
function textoAviso(s) {
  return "Nueva solicitud de presupuesto · Nº " + s.ref + "\n\n" +
    "Nombre: " + s.nombre + (s.empresa ? "\nEmpresa: " + s.empresa : "") + "\nCorreo: " + s.email + "\nTeléfono: " + s.telefono + (s.nif ? "\nNIF/CIF: " + s.nif : "") +
    "\nEntrega: " + ([s.provincia, s.cp].filter(String).join(" · ") || "Sin indicar") + "\nPlazo: " + s.plazo + (s.limite ? "\nFecha límite: " + s.limite : "") +
    (s.comentarios ? "\n\nComentarios:\n" + s.comentarios : "") +
    "\n\nPedido:\n" + resumenProductos(s) + "\n\nTotal: " + s.total + " uds." + (s.sinCantidad ? " (más " + s.sinCantidad + " con cantidades por definir)" : "") +
    (s.carpeta ? "\n\nDiseños: " + s.carpeta : "") + "\n\nResponde a este correo para contestar al cliente.";
}
function htmlCliente(s) {
  var cuerpo = '<p style="margin:12px 0 0">Hola ' + esc(s.nombre.split(" ")[0]) + ",</p>" +
    '<p style="margin:8px 0 0">Gracias por tu solicitud. Te enviamos el presupuesto en 24 horas a este correo, con el precio y una propuesta de diseño. Siempre verás el diseño antes de producir.</p>' +
    '<p style="margin:16px 0 0;padding:12px 14px;background:' + FONDO + ';border-radius:8px">Tu número de solicitud: <b>' + esc(s.ref) + "</b></p>" +
    '<h2 style="margin:24px 0 10px;font-size:17px">Lo que nos has pedido</h2>' + tablaLineas(s) +
    '<p style="margin:16px 0 0;font-size:14px;color:' + GRIS + '">Plazo: ' + esc(s.plazo) + (s.limite ? " · Fecha límite: " + esc(s.limite) : "") + "</p>" +
    '<p style="margin:20px 0 0">¿Quieres cambiar algo o tienes prisa? Responde a este correo o escríbenos por WhatsApp al <a href="https://wa.me/34' + WHATSAPP.replace(/\D/g, "") + '" style="color:' + ROJO + '">' + WHATSAPP + "</a>.</p>" +
    '<p style="margin:16px 0 0">Un saludo,<br>Ramstex</p>';
  return marco("Hemos recibido tu solicitud", cuerpo);
}
function textoCliente(s) {
  return "Hola " + s.nombre.split(" ")[0] + ",\n\nGracias por tu solicitud. Te enviamos el presupuesto en 24 horas a este correo, con el precio y una propuesta de diseño. Siempre verás el diseño antes de producir.\n\n" +
    "Tu número de solicitud: " + s.ref + "\n\nLo que nos has pedido:\n" + resumenProductos(s) + "\n\nTotal: " + s.total + " uds.\nPlazo: " + s.plazo + (s.limite ? " · Fecha límite: " + s.limite : "") +
    "\n\n¿Quieres cambiar algo o tienes prisa? Responde a este correo o escríbenos por WhatsApp al " + WHATSAPP + ".\n\nUn saludo,\nRamstex\ninfo@ramstex.com · " + WEB;
}

/* ---------- Utilidades ---------- */
/** Respuesta en JSON (la web la lee). */
function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
/** Quita caracteres raros de nombres de carpeta y archivo. */
function limpiar(s) {
  return String(s || "").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
/** Texto recibido de la web: sin caracteres de control y con un largo máximo. */
function texto(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max || 500);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
}
/** Solo se aceptan enlaces de Google Drive. */
function enlaceDrive(u) {
  u = texto(u, 300);
  return /^https:\/\/(drive|docs)\.google\.com\//.test(u) ? u : "";
}
/** «2026-11-20» → «20/11/2026» */
function fechaES(v) {
  var m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
}
function destinatarios() {
  return String(EMAIL_AVISOS || "info@ramstex.com").split(",").map(function (x) { return x.trim(); }).filter(String).join(",");
}
