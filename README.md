# Visor IFC · UCSP

Visor BIM educativo ejecutado en el navegador: Vite7, TypeScript estricto y ThatOpen3.4.x con web-ifc0.0.77. Modelos y sesiones locales, sin backend de archivos ni cuentas propias.

## Empieza aquí: direcciones y versiones

| Uso | Dirección | Versión / estado |
|---|---|---|
| **Principal: trabajar y probar el visor actual** | **https://ifc-ucsp.vercel.app** | v2.2.0 · esta entrega |
| Histórica: producción antigua | https://visor-ifc-ucsp.vercel.app | v1.0 congelada; no usar para validar v2 |

La dirección corta es un alias manual a un deployment concreto. Publicar una rama no garantiza que cambie ese alias: se verifica y reasigna después de las pruebas. La rama de desarrollo es `feat/visor-v2-docencia`; `main` conserva v1.0. No hacer merge, tags o releases sin aprobación expresa.

**v2.2** es el nombre de la entrega pedida; **2.2.0** es su versión en paquete, interfaz y sesiones. **RV9** identifica su documentación y respaldo. [Alcance aprobado](docs/PLAN_V22_RV9.md).

## Código y documentación

- Desarrollo canónico: `C:/Users/luis.zegarra/visor-ifc-ucsp`.
- Respaldo: `G:/Mi unidad/Proyectos 2026/Visor IFC - UCSP` (fuentes y ZIPs versionados; no ejecutar npm aquí).
- [Arquitectura v2](docs/ARQUITECTURA_V2_RV2.md).
- [Inspector de propiedades v2.2: causa, código y pruebas](docs/PROPIEDADES_V22_RV9.md).
- [Historial de versiones](docs/VERSIONES.md).
- `docs/ARQUITECTURA.md` describe únicamente la arquitectura histórica v1.0.

## Desarrollo y pruebas

```sh
npm install --include=dev
npm run dev
npm run check
npm test
npm run sync:engine
npm run build
npm run test:e2e
```

`sync:engine` copia Worker/WASM de las dependencias fijadas y genera manifiesto con versión/hashes. No mezclar binarios de otras versiones. Los scripts E2E usan `uv`, Python3.11 y Playwright; evidencia en `test-results/` (no Git).

## Sesiones y privacidad

Las sesiones pertenecen al navegador **y al dominio**. Para migrar desde otra URL, exportar JSON en el origen anterior e importarlo en el actual. Borrar los datos del navegador puede eliminar sesiones. Las versiones nuevas conservan lectura de las versiones anteriores documentadas; v2.1.2 no lee sesiones marcadas2.2.0.

Los IFC reales de validación no se publican automáticamente como ejemplos: se prueban desde la ruta local original sin modificarlos. La carpeta `public/` sí forma parte de la web accesible a visitantes.

## Publicación

Solo rama/preview autorizada, con pruebas y revisión. Verificar deployment por SHA exacto, acceso público, marcador de versión, recursos y destino del alias. Confirmar que la producción histórica no cambió. No convertir una aprobación de ajustes v2 en permiso para sustituir `main`.
