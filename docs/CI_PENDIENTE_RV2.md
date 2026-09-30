# CI preparada, no activada

El token GitHub disponible tiene scope `repo`, no `workflow`. No se ampliaron permisos. La configuración de comandos está en `ci-verify-v2.yml` y en `.github/workflows/verify.yml` local; el workflow local se excluye del push para no bloquear el preview. Para activar Actions, publicar ese YAML en `.github/workflows/verify.yml` con una sesión autorizada o una credencial que ya tenga `workflow`. No se afirma que CI remoto haya pasado.

Puertas locales: `npm test`, `npm run check`, `npm run build`, `npm run test:e2e`, ambas auditorías npm. Vercel compila desde la rama; no sustituye a la suite de navegador.
