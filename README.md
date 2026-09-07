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

Los datos JSON se generan desde el exportador del repositorio `padel-scraper`.
Las ofertas con stock desconocido o última lectura fallida no se recomiendan como mejor precio disponible.
Los precios no incluyen gastos de envío y se confirman en la tienda.

Para una vista previa local, sirve esta carpeta con `python -m http.server 8765`.

## UX de la interfaz

La [revisión global de UX](docs/UX_REVIEW.md) documenta los criterios de plegado,
navegación y adaptación responsive. La web continúa funcionando sin proceso de build.

Al actualizar datos desde el scraper, revisa el diff de los archivos de frontend:
el exportador también genera HTML, CSS y JavaScript y puede sobrescribir las
mejoras específicas de este repositorio. Para actualizar solo el catálogo,
conserva el frontend y copia únicamente los JSON exportados de `data/`.
