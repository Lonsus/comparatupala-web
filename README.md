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
