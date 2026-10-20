// Textos SEO de cada categoría: dirección (slug), título de la pestaña/Google, titular (H1) y texto de entrada.
// Si cambias un slug, la dirección antigua dejará de existir: mejor no tocarlos una vez publicados.
export const SEO_CATS = {
  camisetas: ["camisetas", "Camisetas personalizadas con tu logo", "Camisetas personalizadas",
    "Camisetas para personalizar con el logo de tu empresa, tu evento o tu marca: de algodón orgánico, técnicas, de tirantes, oversize o de manga larga, para hombre, mujer y niño. Elige el modelo y el color, y nos encargamos del estampado, el bordado o la serigrafía."],
  polos: ["polos", "Polos personalizados con tu logo", "Polos personalizados",
    "Polos para uniformes de empresa, equipos y eventos, con tu logo bordado o estampado. Modelos de piqué, técnicos y de manga larga para hombre, mujer y niño, en muchos colores."],
  sudaderas: ["sudaderas", "Sudaderas y jerseys personalizados con tu logo", "Sudaderas y jerseys personalizados",
    "Sudaderas con capucha, con cremallera o de cuello redondo, y jerseys y cárdigans de punto para personalizar con tu logo bordado o estampado. Ideales para empresas, equipos, colegios y marcas propias."],
  chaquetas: ["chaquetas", "Chaquetas y chalecos personalizados con tu logo", "Chaquetas y chalecos personalizados",
    "Chaquetas, softshell, cortavientos, parkas, forros polares y chalecos acolchados para personalizar con el logo de tu empresa. Prendas de abrigo para equipos de trabajo, eventos y uniformes."],
  camisas: ["camisas", "Camisas personalizadas con tu logo", "Camisas personalizadas",
    "Camisas de manga larga y corta, Oxford, sobrecamisas y blusas con tu logo bordado. Perfectas para uniformes de empresa, hostelería y atención al público."],
  pantalones: ["pantalones", "Pantalones y shorts personalizados", "Pantalones y shorts personalizados",
    "Pantalones de trabajo, chinos, de chándal, vaqueros, faldas, bermudas y shorts para personalizar con tu logo o completar el uniforme de tu equipo."],
  trabajo: ["ropa-de-trabajo", "Ropa de trabajo y hostelería personalizada", "Ropa de trabajo y hostelería personalizada",
    "Ropa laboral para personalizar con tu logo: delantales, batas, casacas, túnicas, petos y monos para cocina, hostelería, comercio, limpieza y sanidad."],
  gorras: ["gorras", "Gorras y gorros personalizados con tu logo", "Gorras y gorros personalizados",
    "Gorras de béisbol, truckers, gorros de invierno, bucket hats, sombreros, bufandas y guantes con tu logo bordado o estampado. Un clásico para eventos, equipos y merchandising de marca."],
  bolsas: ["bolsas", "Bolsas y mochilas personalizadas con tu logo", "Bolsas y mochilas personalizadas",
    "Tote bags de algodón, mochilas, bolsas de deporte, maletas y accesorios de viaje para personalizar con tu logo. Ideales para eventos, ferias, tiendas y regalos de empresa."],
  calzado: ["calzado", "Calzado de trabajo y seguridad personalizado", "Calzado de trabajo y seguridad",
    "Calzado de seguridad, calzado de trabajo y zapatillas para completar el uniforme de tu equipo, con modelos para cada sector."],
  interior: ["ropa-interior", "Calcetines y ropa interior personalizados", "Calcetines y ropa interior personalizados",
    "Calcetines, bóxers, ropa interior y sujetadores deportivos para personalizar con tu logo o tu diseño: un detalle original para marcas, equipos y regalos de empresa."],
  hogar: ["textil-hogar", "Toallas y textil de hogar personalizados", "Toallas y textil de hogar personalizados",
    "Toallas, albornoces, textil de mesa y cocina y decoración para personalizar con bordado o estampado. Perfectos para hoteles, gimnasios, spas y regalos."],
  complementos: ["complementos", "Complementos textiles personalizados", "Complementos personalizados",
    "Pañuelos, paraguas, cinturones, corbatas, accesorios deportivos y otros complementos para personalizar con tu logo y completar tu pedido."],
  otros: ["mas-ropa", "Más ropa personalizada: vestidos, pijamas, bodys y más", "Más ropa personalizada",
    "Vestidos, pijamas, bodys de bebé, bañadores, peluches y otras prendas y artículos para personalizar con tu logo o tu diseño."],
  "m-tec": ["tecnologia", "Tecnología promocional personalizada con tu logo", "Tecnología promocional personalizada",
    "Cargadores, baterías externas, altavoces bluetooth, auriculares, memorias USB y accesorios de informática con el logo de tu empresa. Regalos útiles que se usan cada día."],
  "m-esc": ["escritura-y-oficina", "Bolígrafos, libretas y artículos de oficina personalizados", "Bolígrafos, libretas y oficina personalizados",
    "Bolígrafos, lápices, libretas, agendas, estuches, carpetas y material de oficina con tu logo. El merchandising más práctico para ferias, congresos, colegios y regalos a clientes."],
  "m-taz": ["tazas-y-botellas", "Tazas, botellas y termos personalizados con tu logo", "Tazas, botellas y menaje personalizados",
    "Tazas, botellas, bidones, termos, vasos reutilizables y fiambreras con tu logo impreso o grabado. Ideales para oficinas, eventos y regalos de empresa."],
  "m-bol": ["bolsas-y-mochilas", "Bolsas, mochilas y neceseres personalizados", "Bolsas, mochilas y viaje personalizados",
    "Bolsas de tela y de compra, mochilas, neceseres, bolsas térmicas, tarjeteros y accesorios de viaje con tu logo para eventos, ferias y regalos de empresa."],
  "m-eve": ["ferias-y-eventos", "Merchandising para ferias, fiestas y eventos", "Merchandising para ferias y eventos",
    "Lanyards, pulseras, abanicos, sombreros, gorras y artículos de fiesta con tu marca para ferias, congresos, fiestas populares y eventos."],
  "m-ver": ["verano-y-playa", "Merchandising de verano y playa personalizado", "Merchandising de verano y playa",
    "Gorras, gafas de sol, toallas, sillas, balones y artículos de playa con tu logo para campañas de verano, hoteles y eventos al aire libre."],
  "m-inv": ["invierno-y-lluvia", "Paraguas, mantas y merchandising de invierno personalizados", "Merchandising de invierno y lluvia",
    "Paraguas, chubasqueros, mantas, gorros y bragas de cuello personalizados con tu logo para las campañas de otoño e invierno."],
  "m-dep": ["deporte-y-cuidado-personal", "Artículos de deporte y cuidado personal personalizados", "Deporte y cuidado personal",
    "Artículos de salud y belleza, espejos, peines, accesorios deportivos y detalles de cuidado personal con tu marca para gimnasios, clubes y regalos."],
  "m-hog": ["hogar-y-regalos", "Llaveros, regalos de empresa y artículos de hogar personalizados", "Hogar y regalos personalizados",
    "Llaveros, juegos, abridores, tablas de cortar, artículos de cocina y coctelería y packaging para regalar con el logo de tu empresa."],
  "m-out": ["herramientas-y-outdoor", "Herramientas, navajas y artículos outdoor personalizados", "Herramientas, coche y outdoor",
    "Herramientas, navajas multiusos, linternas, parasoles para el coche, barbacoa y artículos para mascotas con tu logo."],
  "m-nav": ["navidad", "Regalos de Navidad personalizados para empresas", "Navidad personalizada",
    "Adornos, velas y detalles navideños personalizados con tu logo para felicitar las fiestas a clientes, equipos y colaboradores."],
};

// Igual que slug() en index.html: no cambiar uno sin el otro.
export function slug(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function prodSlug(ref, name) {
  let n = slug(name);
  if (n.length > 70) n = n.slice(0, 70).replace(/-[^-]*$/, "");
  return slug(ref) + (n ? "-" + n : "");
}
