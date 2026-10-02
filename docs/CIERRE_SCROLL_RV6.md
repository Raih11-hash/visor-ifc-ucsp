# Cierre técnico · Scroll RV6 · 2.1.2 preview

- Base de retorno: 69281b63f4b0271ef784dd163f073c09b049a476, rama feat/visor-v2-docencia. Main congelada:152e61f471dc0c3942526cd5ac7684f944b28dbb.
- Cambio funcional único: min-height:0 y overflow:hidden en el ítem grid/flex del panel derecho. Body existente overflow:auto queda acotado a pantalla; no recrear SDK/panel/tabla.
- Versión package/lock/APP/HTML/manifiesto/sesiones2.1.2. Códec preserva lectura2.0/2.1/2.1.1/2.1.2; esquema no cambia.
- Build y suite local final exit0:114 Node sin fallos/omisiones y170 checks Chromium (63base+28vistas+46layout+18display+7props+8scroll), seis reportes sin page_errors.
- Scroll GREEN desktop1366x768: clientHeight567, scrollHeight16973, bottom754 dentro del viewport768. Rueda real al fondo, último campo visible. Móvil390x844 mismo criterio. Cámara conserva posición y plegar/reabrir13raíces.
- RED archivado sobre ZIP RV5 inmutable: exit1 en primer criterio, clientHeight=scrollHeight16973, bottom17160.5, sin page_errors. SHA ZIP en smoke-scroll-rv6-red.json, traceback en scroll-rv6-red.log. No se alteró el build final para producir la evidencia.
- Revisión independiente deleg_97e90ffe: SPEC PASS y CALIDAD APPROVED; brecha RED archivado resuelta. Posible recorte de outline al borde es observación cosmética no reproducida, no ampliada fuera de alcance.
- Producciónref/HTML/assets bitidénticos antes de push, registroproduction-baseline-rv6.json. Verificación de deployment/SHA/URL y respaldoqueda en LEEME RV6.
- Aliasifc-ucsp.vercel.app autorizado, no asignado en este cierre: accesoVercel pendiente vía OAuthCLI/confirmación humana. Producción y protección no se cambian. IndexedDB entre orígenes requiere exportar/importar JSON.
- Límites: no acreditamos prueba docente/laptop/IFCgrande ni mejora de demoras8s anteriores. No se implementaron las diez recomendaciones.
