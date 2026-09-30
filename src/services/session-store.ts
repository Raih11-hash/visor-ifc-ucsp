// Persistencia local de sesiones con IndexedDB (sin servidor ni backend).
// Guarda los bytes reales de los modelos como ArrayBuffer (no localStorage).
import type { SessionMeta, SessionSnapshot } from '../domain/session-format.ts';
import { getSessionMeta, validateSnapshot } from '../domain/session-format.ts';

const DB_NAME = 'visor-ifc-ucsp-v2';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;
const OPEN_TIMEOUT_MS = 8000;

// Traduce el error de IndexedDB a un mensaje útil para el usuario.
// En especial, QuotaExceededError (falta de espacio) hoy no es distinguible del genérico.
function describeIdbError(error: unknown): Error {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  if (name === 'QuotaExceededError') {
    return new Error(
      'No hay espacio suficiente en el navegador para guardar la sesión. Elimina sesiones antiguas e inténtalo de nuevo.',
    );
  }
  if (name === 'InvalidStateError') {
    return new Error('El almacén local de sesiones no está disponible en este momento.');
  }
  return new Error('Error al acceder al almacén local de sesiones.');
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      reject(new Error('IndexedDB no está disponible en este navegador; no se pueden guardar sesiones.'));
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      action();
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      reject(new Error('No se pudo abrir el almacén local de sesiones.'));
      return;
    }

    timer = setTimeout(() => {
      settle(() => reject(new Error('El almacén local de sesiones no responde (posible bloqueo). Cierra otras pestañas e inténtalo de nuevo.')));
    }, OPEN_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      if (settled) return;
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        // La apertura llegó DESPUÉS de un timeout/bloqueo ya resuelto:
        // cerrar la conexión para no filtrarla.
        try {
          db.close();
        } catch {
          /* ignorar */
        }
        return;
      }
      // Permitir que otra pestaña actualice el esquema: liberar nuestra conexión.
      db.onversionchange = () => {
        try {
          db.close();
        } catch {
          /* ignorar */
        }
      };
      settle(() => resolve(db));
    };
    request.onerror = () => {
      settle(() => reject(new Error('No se pudo abrir el almacén local de sesiones.')));
    };
    request.onblocked = () => {
      settle(() => reject(new Error('El almacén local de sesiones está bloqueado por otra pestaña.')));
    };
  });
}

// Ejecuta una operación en una transacción y resuelve SOLO al confirmar (commit),
// no cuando la petición individual devuelve éxito.
// Exportado (además de uso interno) para poder probar el manejo de errores.
export function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
  map: (result: unknown) => T,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction;
        try {
          transaction = db.transaction(STORE_NAME, mode);
        } catch {
          db.close();
          reject(new Error('No se pudo iniciar la operación en el almacén local de sesiones.'));
          return;
        }

        let captured: unknown;
        let failed = false;

        transaction.oncomplete = () => {
          db.close();
          try {
            resolve(map(captured));
          } catch (error) {
            // Si map() lanza, rechazar en vez de dejar la promesa colgada.
            reject(error instanceof Error ? error : new Error('Error al procesar el resultado del almacén local de sesiones.'));
          }
        };
        transaction.onerror = () => {
          failed = true;
          const error = (request && request.error) || transaction.error;
          db.close();
          reject(describeIdbError(error));
        };
        transaction.onabort = () => {
          if (failed) return;
          db.close();
          reject(new Error('La operación sobre el almacén local de sesiones fue cancelada.'));
        };

        let request: IDBRequest;
        try {
          request = work(transaction.objectStore(STORE_NAME));
        } catch {
          try {
            transaction.abort();
          } catch {
            /* ignorar */
          }
          db.close();
          reject(new Error('No se pudo preparar la operación en el almacén local de sesiones.'));
          return;
        }

        request.onsuccess = () => {
          captured = request.result;
        };
      }),
  );
}

export async function saveSession(snapshot: SessionSnapshot): Promise<void> {
  const validated = validateSnapshot(snapshot);
  await runTransaction<void>('readwrite', (store) => store.put(validated), () => undefined);
  // Verificación de efecto: confirmar que la clave quedó persistida. Se usa getKey
  // (no get) para no recargar de nuevo los bytes del modelo.
  const storedId = await runTransaction<unknown>('readonly', (store) => store.getKey(validated.id), (result) => result);
  if (storedId !== validated.id) {
    throw new Error('No se pudo confirmar la sesión guardada en el almacén local.');
  }
}

// Nota: getAll() trae los blobs completos. Una optimización futura (índice/metadata)
// permitiría listar sin cargarlos; por ahora se prioriza no devolver datos falsos.
export async function listSessions(): Promise<SessionMeta[]> {
  const records = await runTransaction<unknown[]>('readonly', (store) => store.getAll(), (result) => (Array.isArray(result) ? result : []));
  const metas: SessionMeta[] = [];
  for (let i = 0; i < records.length; i += 1) {
    try {
      metas.push(getSessionMeta(validateSnapshot(records[i])));
    } catch {
      // Registro dañado: se omite del listado.
    }
  }
  metas.sort((a, b) => {
    const diff = Date.parse(b.savedAt) - Date.parse(a.savedAt);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
  return metas;
}

export async function loadSession(id: string): Promise<SessionSnapshot> {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Identificador de sesión no válido.');
  }
  const record = await runTransaction<unknown>('readonly', (store) => store.get(id), (result) => result);
  if (record === undefined || record === null) {
    throw new Error('Sesión no encontrada.');
  }
  return validateSnapshot(record);
}

export async function deleteSession(id: string): Promise<void> {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Identificador de sesión no válido.');
  }
  await runTransaction<void>('readwrite', (store) => store.delete(id), () => undefined);
}