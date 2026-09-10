# Supabase: usuarios, perfiles y favoritas (fase 1)

El catálogo sigue leyendo `data/products.json`, `data/history.json` y
`data/stats.json`. No se crean tablas de productos ni se conecta el scraper.
La web funciona sin configurar Supabase: el SDK ni siquiera se descarga con los
placeholders, y las favoritas siguen usando `comparatupala:saved` en localStorage.

## Activación

1. Crea un proyecto Supabase. Ejecuta una vez
   `supabase/migrations/202609100001_profiles_favorites.sql` en el SQL Editor
   (o aplícala con las migraciones de Supabase). La transacción crea las dos
   tablas, sus permisos y las políticas RLS. Si ya existen tablas con estos
   nombres, revisa su esquema antes de aplicar esta migración; no las borres.
2. Activa el proveedor Email y la confirmación de email en Authentication.
   Configura una contraseña mínima de 8 caracteres y el envío SMTP del proyecto
   antes de abrir registros al público.
3. En Authentication → URL Configuration configura la URL real de la web como
   Site URL. Añade la URL exacta de entrada (origen + ruta, sin fragmento) a las
   Redirect URLs; por ejemplo `https://comparatupala.es/` y, para pruebas,
   `http://localhost:8000/`. Si publicas bajo un subdirectorio, incluye su ruta.
4. En `supabase-config.js`, sustituye `url` por **SUPABASE_URL** y
   `publishableKey` por **SUPABASE_PUBLISHABLE_KEY** (`sb_publishable_…`).
   Son configuración pública. Esta web no tiene build y no lee archivos `.env`.
   También puedes definir `window.COMPARATUPALA_SUPABASE` antes de ese script.
   Nunca incluyas claves `service_role`, `sb_secret_…`, contraseñas de BD ni JWT
   administrativos. El inicializador solo acepta el formato publishable.
5. Publica los archivos de frontend junto con los tres JSON actuales. Antes de
   activar cuentas en producción, completa la información de privacidad sobre
   email, perfil, favoritas y almacenamiento de sesión. La cuenta es opcional;
   la navegación y los favoritos de visitante no requieren registro.

El cliente JS se carga de forma asíncrona desde jsDelivr, con versión fijada
`2.57.4`. Un error o tiempo de espera de descarga conserva el modo local.
Si hay una política CSP, permite el script del CDN y conexiones al proyecto
Supabase. Los tokens de sesión se gestionan mediante Supabase Auth y su
almacenamiento del navegador; no se guardan contraseñas en el código de la web.

## Comportamiento y permisos

- **Sin sesión:** se conserva la clave y el formato anteriores de localStorage.
  Si el navegador no permite escribir, la selección dura mientras siga abierta
  esa página y se avisa al usuario.
- **Inicio de sesión:** se unen las favoritas locales y las remotas mediante
  upsert con clave `(user_id, product_id)`. La copia de visitante se retira solo
  después de completar la importación; así no reaparece una favorita borrada al
  volver a iniciar sesión. Si falla la importación, se conserva la copia local
  y se ofrece reintentar desde Mi cuenta. Los IDs ausentes temporalmente del JSON
  se conservan, aunque no se puedan mostrar como tarjetas.
- **Con sesión:** los cambios se confirman después de que Supabase responda.
  Un fallo no se presenta como guardado ni se mezcla con la lista de visitante.
  No hay cola persistente de cambios offline: hay que reintentar el cambio.
- **Cerrar sesión:** se cierra en este navegador y se vuelve a la lista de
  visitante restante. Los favoritos de la cuenta no se copian a localStorage.
  Cambiar de cuenta limpia inmediatamente la selección visible anterior.
- **Otros dispositivos:** se recuperan los datos al iniciar sesión o recargar;
  “Reintentar sincronización” actualiza también una sesión abierta. Esta fase no
  incorpora suscripciones Realtime. Las escrituras actúan sobre una sola pala,
  sin reemplazar en bloque la lista remota.
- **Perfiles:** se crea una fila al primer acceso autenticado (también para
  usuarios existentes). Se puede consultar y editar el nombre desde Mi cuenta.
  El email permanece en Supabase Auth. No se expone `auth.users` por la API.
- **RLS:** `anon` no tiene acceso a las tablas; cada usuario autenticado solo
  puede leer y escribir filas con su UUID. Las referencias a `auth.users`
  eliminan perfil y favoritas cuando se elimina la cuenta desde administración.

En un dispositivo compartido, las favoritas creadas sin sesión se importan a
la siguiente cuenta que inicie sesión; el formulario explica este comportamiento.
Si localStorage no permite limpiar la copia importada, se avisa de que podría
reimportarse en una visita posterior.

## Validación reproducible

Sin instalar dependencias:

```sh
node --test tests/favorites.test.cjs
node --check supabase-config.js
node --check auth.js
node --check favorites.js
node --check app.js
```

Pruebas de navegador (Node y Playwright con Chromium instalados):

```sh
node tests/browser-smoke.cjs
```

El test inicia su propio servidor local y usa el catálogo real. Las pruebas de
cuentas simulan el cliente Supabase; no validan un proyecto remoto ni sus RLS.
Antes de activar producción, verifica en un proyecto de pruebas:

1. Registro, correo de confirmación, entrada tras confirmación, login y logout.
2. Importar favoritas antiguas, editar perfil, recargar y entrar en un segundo
   navegador para comprobar persistencia. Eliminar una favorita y volver a
   entrar no debe restaurarla.
3. Con dos usuarios A/B y la publishable key, intentar leer/escribir filas de B
   usando la sesión de A: select no debe devolver filas ajenas y las escrituras
   no deben afectarlas. Sin sesión no debe poder accederse a ninguna tabla.
4. Cortar la conexión durante sincronización/escritura, comprobar el aviso,
   recuperar la conexión y reintentar. Revisar también cierre/cambio de sesión.

## Publicaciones futuras del scraper

El exportador descrito en el README también puede sobrescribir `index.html` y
`app.js`. Al actualizar datos, conserva esta integración: revisa el diff y
publica únicamente los JSON/imágenes o adapta antes el exportador privado.
Este cambio no modifica ese repositorio privado.

## Referencias

- [Claves públicas y privadas](https://supabase.com/docs/guides/api/api-keys)
- [Datos de usuario y perfiles](https://supabase.com/docs/guides/auth/managing-user-data)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Eventos de autenticación](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
