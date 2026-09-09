# ComparaTuPala.es

Repositorio público del dashboard estático de **ComparaTuPala.es**.

El scraper, la base SQLite, logs y credenciales permanecen en el repositorio privado `Lonsus/padel-scraper`. Este repositorio contiene únicamente el frontend público y los JSON exportados.

## Actualizar los datos

Desde el clon local de `padel-scraper`:

```powershell
python export_web.py --output ..\comparatupala-web
```

Después:

```powershell
cd ..\comparatupala-web
git add .
git commit -m "Update dashboard data"
git push origin main
```

La exportación genera/actualiza:

- `index.html`
- `app.js`
- `styles.css`
- `data/products.json`
- `data/history.json`
- `data/stats.json`

### Valoraciones externas de producto

Cada `offer` de `data/products.json` puede incluir estos campos procedentes de la ficha pública del producto en la tienda:

- `external_rating`: valoración original publicada por la tienda.
- `external_rating_scale`: escala original de esa valoración.
- `external_rating_normalized`: valoración normalizada a una escala de 5.
- `external_review_count`: número de reseñas asociado, cuando la tienda lo publica.
- `external_rating_source`: procedencia técnica usada por el scraper para extraer el dato.

La interfaz muestra la valoración normalizada junto a la oferta del producto y solo muestra el número de reseñas cuando existe. Los valores ausentes o incoherentes no se convierten en cero. `external_rating_source` se conserva como metadato técnico y no se presenta al usuario como `json_ld` u otro identificador interno.

Estas valoraciones corresponden al producto/oferta publicado por cada tienda: no representan una reputación global de la tienda, no se promedian entre productos y no se mezclan con `match_score`, que sigue siendo una señal interna de confianza del matching.

Los JSON antiguos que no incluyan estos campos siguen siendo compatibles; la web mostrará discretamente que no hay valoración publicada.

## Dominio

El archivo `CNAME` está configurado para:

```text
comparatupala.es
```

## Seguridad

No deben subirse a este repositorio:

- `padel.sqlite3`
- `.env`
- credenciales o tokens
- logs
- HTML capturado por las spiders
- ejecutables internos


## Dashboard y fichas de palas

- Catálogo verde con filtros por marca, tienda, stock, forma, nivel, estilo de juego, precio y número de ofertas; ordenación y paginación.
- Palas guardadas en el navegador de este dispositivo.
- Fichas enlazables con ofertas, EAN y características/descripción seleccionables por tienda.
- Tabla comparativa que mantiene separados los valores de cada fuente y señala los que difieren.
- Histórico por escalones: precio horizontal hasta cada cambio y hasta la última lectura correcta de la tienda. Los errores y retiradas del catálogo no alargan artificialmente la serie.
- Periodos de 7, 30, 90 días o todo el histórico, selección de tiendas y tabla de registros.

## Fichas de tiendas

La web dispone de navegación por hash para explorar las tiendas monitorizadas como entidades propias:

```text
#tiendas
#tienda/padelnuestro
#tienda/zonadepadel
#tienda/padelmarket
```

`#tiendas` muestra las tiendas configuradas en el frontend y sus métricas calculadas. Cada `#tienda/{slug}` filtra los mismos productos y ofertas de `data/products.json`; no existe una copia separada del catálogo por tienda.

Las estadísticas de tienda se calculan en cliente a partir de los datos exportados. Se mantiene la distinción entre **palas diferentes** (`product.id`) y **ofertas**. La disponibilidad reutiliza la misma función `available()` del catálogo principal, el precio medio solo usa ofertas disponibles con precio válido y la última actualización se basa en `last_successful_check`.

Las fichas de tienda incluyen búsqueda, marca, disponibilidad, rango de precio y ordenación. Las tarjetas muestran exclusivamente el precio y la disponibilidad de la tienda visitada; nunca sustituyen ese precio por el mejor precio global. Desde cada tarjeta se puede volver a la ficha completa de la pala para comparar todas las tiendas.

Las valoraciones externas que aparezcan dentro de una tarjeta siguen perteneciendo al producto/oferta correspondiente. **No se calcula ni se muestra una valoración global de la tienda, una media de ratings de productos ni un ComparaTuPala Score.** Los metadatos de tienda dejan esos campos preparados como `null` para una futura fuente metodológicamente válida.

No forman parte de esta capa las cuentas de usuario, Supabase, favoritos de tiendas, comentarios ni reseñas propias de ComparaTuPala.

Los datos JSON se generan desde el exportador del repositorio `padel-scraper`.
Las ofertas con stock desconocido o última lectura fallida no se recomiendan como mejor precio disponible.
Los precios no incluyen gastos de envío y se confirman en la tienda.

Para una vista previa local, sirve esta carpeta con `python -m http.server 8765`.

## UX de la interfaz

La entrada sin fragmento y `#inicio` muestran una landing independiente del catálogo.
El botón principal abre `#catalogo`; `#como-funciona` explica el recorrido en tres pasos.
El logo vuelve a Inicio y se mantienen los enlaces directos a palas, guardadas y tiendas.
La portada funciona sin esperar a los JSON. Si existen ofertas disponibles en euros
en varias tiendas, muestra una pala real con su precio mínimo registrado; si no,
mantiene una presentación informativa sin cifras inventadas. Su diseño está en `landing.css`.

La [revisión global de UX](docs/UX_REVIEW.md) documenta los criterios de plegado,
navegación y adaptación responsive. La web continúa funcionando sin proceso de build.

Al actualizar datos desde el scraper, revisa el diff de los archivos de frontend:
el exportador también genera HTML, CSS y JavaScript y puede sobrescribir las
mejoras específicas de este repositorio. Para actualizar solo el catálogo,
conserva el frontend y copia únicamente los JSON exportados de `data/`.
