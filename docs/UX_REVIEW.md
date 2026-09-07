# Revisión global de UX (9.1–9.3)

Se mantiene la identidad visual de ComparaTuPala y se priorizan búsqueda, precio,
disponibilidad y comparación. El contenido secundario sigue disponible bajo
controles explícitos. No se modifican los JSON ni la selección de mejores ofertas.

## 9.1 · Qué se puede plegar

| Bloque | PC al entrar | Móvil al entrar (≤800 px) | Criterio |
| --- | --- | --- | --- |
| Resumen del catálogo | Abierto | Cerrado | Métricas complementarias; el recuento de resultados permanece visible. |
| Filtros avanzados | Abiertos | Cerrados | Se pueden plegar en ambos tamaños; las etiquetas activas y un resumen de filtros/errores permanecen accesibles. |
| Todas las ofertas | Abierto | Abierto | Información principal para decidir; precio destacado siempre visible en la cabecera. |
| Ficha por tienda | Abierta | Cerrada | Se abre al pedir características desde una oferta o desde la navegación. Los enlaces con `?tienda=` la abren también. |
| Comparación de tiendas | Abierta con varias ofertas | Abierta con varias ofertas | Función principal de la web. Si solo hay una oferta, se presenta plegada con su explicación. |
| Histórico | Cerrado | Cerrado | Consulta complementaria accesible desde la navegación de la ficha. |
| Descripciones, identificadores y registros | Cerrados | Cerrados | Se conserva el detalle sin alargar la lectura inicial. |
| Quiénes somos y referencias legales | Cerrados | Cerrados | Acceso desde cabecera y pie; los enlaces a Quiénes somos y Contacto revelan y enfocan el destino. |
| Contacto / Novedades | Pestañas | Pestañas | Siempre hay una pestaña activa; pulsarla otra vez no oculta su contenido. |

Los valores iniciales de filtros/resumen/ficha se deciden al cargar la vista. Cambiar
el tamaño de ventana no revierte una elección de plegado hecha por el usuario.

## 9.2 · Navegación y fluidez

- Volver desde una ficha recupera la página, los filtros, la posición y el enlace
  del listado de origen; funciona también con Atrás del navegador.
- Guardadas tiene un estado vacío con acceso al catálogo y distingue entre una
  lista vacía y guardadas que no coinciden con los filtros. Al quitar una pala,
  el foco pasa a la siguiente o al título de resultados.
- Paginación, etiquetas de filtros y enlaces a secciones mantienen un destino de
  foco útil. Los paneles abiertos desde la navegación siguen accesibles con Tab.
- Se indica la sección activa mediante `aria-current`. Los enlaces a Contacto
  funcionan al entrar directamente, desde Guardadas y desde la ficha.
- La búsqueda pendiente se cancela cuando otra acción actualiza el listado, para
  evitar que una actualización retrasada revierta la paginación o pierda el foco.
- El diálogo bloquea el desplazamiento del fondo, admite Escape y devuelve el
  foco al botón de apertura. Las pestañas admiten flechas, Inicio y Fin.
- El canal operativo de GitHub se muestra antes que los servicios futuros.
  Mientras no estén configurados, los formularios no muestran campos editables;
  presentan un aviso de disponibilidad y sus controles permanecen deshabilitados.
- Se respeta la preferencia de movimiento reducido, también en los saltos
  programáticos a secciones.

## 9.3 · Adaptación responsive

- Cabecera y navegación admiten varias líneas. La navegación de la ficha forma
  dos columnas en móvil, sin pestañas ocultas fuera de pantalla.
- Tarjetas de una columna en pantallas de hasta 380 px y rejillas adaptadas para
  el resto; textos largos, nombres y etiquetas se ajustan a sus contenedores.
- Controles principales de al menos 44 px y campos de 16 px en móvil. Los campos
  se reordenan sin comprimir precios o selectores.
- Tablas y gráfico tienen desplazamiento local, región etiquetada y acceso con
  teclado. Las tablas conservan encabezados; la comparación fija su primera
  columna para mantener la referencia durante el desplazamiento horizontal.
- Avisos por encima del botón flotante, espacio inferior para el contenido y un
  icono de contacto reconocible en móvil.
- El diálogo utiliza la altura dinámica de la ventana y desplazamiento interior.

## Verificación reproducible

`tests/ux-smoke.cjs` levanta un servidor local temporal y utiliza Playwright.
Comprueba 320, 390, 540, 768, 1024, 1440 y 1920 px: desbordamientos de página,
plegado, filtros inválidos, búsqueda, paginación, foco, guardadas, navegación de
vuelta, tablas, histórico, contacto y enlaces directos. También comprueba un
catálogo vacío y errores de carga. Bloquea peticiones externas: las imágenes de
tiendas se muestran mediante el estado de imagen no disponible.

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node tests/ux-smoke.cjs
```

Variables opcionales:

- `BROWSER_CHANNEL=msedge`: utilizar Microsoft Edge instalado.
- `PLAYWRIGHT_MODULE`: ruta a una instalación existente de Playwright.
- `UX_SCREENSHOTS`: carpeta de salida para capturas de catálogo, ficha y contacto.

La comprobación automatizada utiliza Chromium/Edge. La emulación de anchos no
sustituye una comprobación en Safari/iOS o en dispositivos físicos. Las capturas
se guardan fuera del repositorio y los datos del catálogo no se alteran.
