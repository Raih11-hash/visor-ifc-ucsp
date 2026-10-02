/**
 * Protege una tabla asíncrona de respuestas de selecciones antiguas.
 * Usa la API pública de carga por instancia; conserva loader, filas,
 * transformaciones, unidades, búsqueda y exportación de la tabla SDK.
 */
interface AsyncTable<T> {
  data: T;
  loading: boolean;
  loadFunction?: () => Promise<T>;
  loadData(force?: boolean): Promise<boolean>;
}

export function protectLatestTableLoad<T>(table: AsyncTable<T>): () => void {
  let revision = 0;
  const pending = new Map<number, number>();
  const unwrapped = new WeakMap<() => Promise<T>, () => Promise<T>>();
  const originalLoad = table.loadData.bind(table);
  table.loadData = async (force = false) => {
    const captured = revision;
    const assigned = table.loadFunction;
    const loader = assigned ? unwrapped.get(assigned) ?? assigned : undefined;
    if (!loader) return originalLoad(force);
    // El SDK llama al loader antes de su primer await. Cada invocación
    // captura su función y su revisión, aunque entre otra selección.
    const protectedLoader = async () => {
      try {
        const result = await loader();
        return captured === revision ? result : table.data;
      } catch (error) {
        if (captured !== revision) return table.data;
        throw error;
      }
    };
    unwrapped.set(protectedLoader, loader);
    table.loadFunction = protectedLoader;
    pending.set(captured, (pending.get(captured) ?? 0) + 1);
    try {
      const loaded = await originalLoad(force);
      return captured === revision && loaded;
    } finally {
      // No reemplazar la función instalada por una selección más reciente.
      if (table.loadFunction === protectedLoader) table.loadFunction = loader;
      const count = (pending.get(captured) ?? 1) - 1;
      if (count) pending.set(captured, count);
      else pending.delete(captured);
      // Un resultado antiguo no puede apagar el indicador de otra carga.
      if (captured !== revision) table.loading = (pending.get(revision) ?? 0) > 0;
    }
  };
  return () => { revision += 1; };
}
