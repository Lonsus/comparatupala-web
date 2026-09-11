# Estado de activación — 10 de septiembre de 2026

Proyecto: `comparatupala` (`tmvyidpxvlsimttcdckr`), región Irlanda.

## Completado

- Migración `202609100001_profiles_favorites.sql` aplicada mediante SQL Editor.
  No se ha registrado en el historial de Supabase CLI: no volver a ejecutarla.
- Tablas `profiles` y `favorites` con RLS activo, tres y cuatro políticas
  respectivamente. El esquema público estaba vacío antes de aplicar los cambios.
- Proveedor Email, registro y confirmación de email activados.
- Contraseña mínima configurada a ocho caracteres.
- Site URL: `https://comparatupala.es/`.
- Redirecciones permitidas: `https://comparatupala.es/` y `http://localhost:8000/`.
- URL y publishable key reales en `supabase-config.js`. No se usan secretos.
- API Auth verificada con la clave pública real: Email activo y confirmación
  requerida. Las consultas REST anónimas a las dos tablas responden HTTP 401.
- Prueba SQL real con dos usuarios temporales dentro de una transacción:
  lecturas propias, actualización del perfil propio y alta/baja de favoritas
  permitidas; lectura, inserción, actualización y borrado de favoritas ajenas
  bloqueados; lectura/inserción/actualización de perfiles ajenos bloqueadas;
  acceso anónimo denegado a ambas tablas. Resultado PASS y ROLLBACK completo,
  sin cuentas ni datos de prueba persistentes.

## Pendiente antes de activar registros públicos

- Configurar un proveedor SMTP y su remitente verificado.
  El panel muestra actualmente SMTP personalizado desactivado.
- Probar registro, recepción del correo de confirmación e inicio de sesión real.
- Completar la información de privacidad del servicio de cuentas.
- Publicar la rama en el sitio de producción cuando se completen esos pasos.

Los tres JSON del catálogo permanecen intactos. Las pruebas de interfaz con
cliente simulado no sustituyen la prueba de entrega real del correo.
