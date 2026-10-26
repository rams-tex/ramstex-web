/*
 * Ramstex · Recepción de diseños de la web (Google Apps Script)
 * ==============================================================
 * Qué hace: cuando un cliente envía su presupuesto por WhatsApp desde la web y ha usado el diseñador,
 * la web manda aquí su logo (archivo original) y la vista previa. Este script crea una carpeta en tu
 * Google Drive para ese pedido (fecha + número corto, por ejemplo «2026-10-26 RX-261026-K7PQ»),
 * guarda dentro los archivos y devuelve los enlaces. El enlace de la carpeta va en el mensaje de WhatsApp.
 *
 * CÓMO PONERLO EN MARCHA (una sola vez, unos 10 minutos)
 * -------------------------------------------------------
 * 1. Entra en https://drive.google.com con la cuenta de Ramstex y crea una carpeta llamada
 *    «Diseños web». Ábrela y copia el código que sale en la barra de direcciones después de
 *    «/folders/» (algo como 1AbCdEf...). Ese es el ID de la carpeta.
 * 2. Ve a https://script.google.com y pulsa «Nuevo proyecto». Ponle de nombre «Ramstex diseños».
 * 3. Borra todo lo que aparece y pega este archivo completo.
 * 4. Más abajo, en CARPETA_ID, pega entre las comillas el ID del paso 1. Pulsa el icono de guardar.
 * 5. Pulsa «Implementar» → «Nueva implementación». En el engranaje elige «Aplicación web» y pon:
 *       - Descripción: Diseños web
 *       - Ejecutar como: Yo (tu cuenta)
 *       - Quién tiene acceso: Cualquier usuario
 *    Pulsa «Implementar». Google te pedirá permiso para usar tu Drive: acepta
 *    (si sale «Google no ha verificado esta aplicación», pulsa «Configuración avanzada» → «Ir a Ramstex diseños»).
 * 6. Copia la «URL de la aplicación web» (termina en /exec).
 * 7. En la web (archivo index.html), busca la línea  var DISENO_URL="";  y pega la URL entre las comillas.
 *    Desde ese momento, los diseños se suben solos al enviar el presupuesto.
 *
 * Comprobar que funciona: abre la URL /exec en el navegador; debe decir {"ok":true,"servicio":"Ramstex diseños"}.
 * Si cambias este código: «Implementar» → «Gestionar implementaciones» → lápiz → Versión: «Nueva versión».
 * (Así la URL sigue siendo la misma y no hay que tocar la web.)
 *
 * Importante: los archivos quedan como «cualquier persona con el enlace puede verlos» para que el enlace
 * de WhatsApp funcione sin pedir permisos. Nadie puede encontrarlos sin el enlace.
 */

// ID de la carpeta «Diseños web» de tu Drive (paso 1). Si se deja vacío, se usa la carpeta principal de Drive.
var CARPETA_ID = "";

// Tamaño máximo que se acepta por envío (en MB). Apps Script admite hasta unos 50 MB.
var MAX_MB = 40;

/** La web envía aquí los diseños (POST con texto JSON). */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return responder({ ok: false, error: "Sin datos" });
    if (e.postData.contents.length > MAX_MB * 1024 * 1024 * 1.37) return responder({ ok: false, error: "Demasiado grande" });

    var datos = JSON.parse(e.postData.contents);
    var pedido = limpiar(datos.pedido) || ("RX-" + Utilities.formatDate(new Date(), "Europe/Madrid", "yyMMdd-HHmmss"));
    var fecha = Utilities.formatDate(new Date(), "Europe/Madrid", "yyyy-MM-dd");
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

    return responder({ ok: true, folderUrl: carpeta.getUrl(), files: enlaces });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

/** Para comprobar en el navegador que la aplicación está en marcha. */
function doGet() {
  return responder({ ok: true, servicio: "Ramstex diseños" });
}

/** Respuesta en JSON (la web la lee para poner el enlace en el mensaje). */
function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Quita caracteres raros de nombres de carpeta y archivo. */
function limpiar(s) {
  return String(s || "").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
