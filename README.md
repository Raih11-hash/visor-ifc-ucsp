# Visor IFC · UCSP

Visor web de modelos IFC para docencia (Ingeniería Civil, UCSP).
Vite 7 + TypeScript + ThatOpen Engine 3.2.0. 100% cliente: sin servidor.

- **Demo en vivo**: (URL de Vercel pendiente — ver INSTRUCCIONES_VERCEL abajo)
- **Mapa del código**: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — qué hace cada parte.

## Desarrollo

```bash
npm install   # solo la primera vez
npm run dev   # http://localhost:5173
npm run build # genera dist/ (verifica TypeScript)
```

Abrir un modelo: botón **Modelos → + → IFC**, botón **Cargar ejemplo**,
o arrastrar un `.ifc` sobre el visor.

## Publicar en Vercel (2 min)

1. Ve a https://vercel.com/new → **Import Git Repository** → elige `visor-ifc-ucsp`.
2. Framework **Vite** (autodetectado) → **Deploy**.
3. Cada `git push` a `main` redespliega solo, misma URL.
