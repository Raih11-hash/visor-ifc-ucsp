/**
 * core/choques.ts — Revisión gruesa de choques entre modelos cargados.
 *
 * - revisarChoques: compara las cajas envolventes (Box3) de cada par de
 *   modelos y devuelve los pares que se traslapan, con su caja de
 *   intersección. Es una aproximación por volúmenes: sirve para detectar
 *   de un vistazo si dos modelos ocupan el mismo lugar (p. ej. dos
 *   versiones de la misma obra), no reemplaza un Clash Detective.
 * - mostrarChoques: calcula y muestra el resultado en un diálogo con un
 *   botón "Enfocar" por cada choque (lleva la cámara a ese volumen).
 *
 * El botón que usa esto vive en la sección "Choques" de la barra inferior
 * (ver toolbars/viewer-toolbar.ts).
 */

import * as THREE from "three";
import * as OBC from "@thatopen/components";

export interface ChoqueEntreModelos {
  modeloA: string;
  modeloB: string;
  /** Volumen donde se traslapan ambos modelos. */
  caja: THREE.Box3;
}

export const revisarChoques = (
  components: OBC.Components,
): ChoqueEntreModelos[] => {
  const fragments = components.get(OBC.FragmentsManager);
  const modelos = [...fragments.list.values()];
  const cajas = modelos.map((modelo) => ({
    nombre: modelo.modelId,
    caja: new THREE.Box3().setFromObject(modelo.object),
  }));
  const choques: ChoqueEntreModelos[] = [];
  for (let i = 0; i < cajas.length; i += 1) {
    for (let j = i + 1; j < cajas.length; j += 1) {
      const a = cajas[i];
      const b = cajas[j];
      if (a.caja.isEmpty() || b.caja.isEmpty()) continue;
      if (!a.caja.intersectsBox(b.caja)) continue;
      choques.push({
        modeloA: a.nombre,
        modeloB: b.nombre,
        caja: a.caja.clone().intersect(b.caja),
      });
    }
  }
  return choques;
};

const enfocarCaja = (world: OBC.World, caja: THREE.Box3): void => {
  const camara = world.camera;
  if (!(camara instanceof OBC.SimpleCamera)) return;
  const esfera = caja.getBoundingSphere(new THREE.Sphere());
  camara.controls.fitToSphere(esfera, true);
};

let dialogo: HTMLDialogElement | undefined;

const obtenerDialogo = (): HTMLDialogElement => {
  if (!dialogo) {
    dialogo = document.createElement("dialog");
    dialogo.className = "choques-dialogo";
    const titulo = document.createElement("div");
    titulo.className = "choques-titulo";
    titulo.textContent = "Choques entre modelos";
    const nota = document.createElement("p");
    nota.className = "choques-nota";
    nota.textContent =
      "Revisión gruesa por volúmenes: dos modelos que comparten espacio aparecen aquí. No reemplaza un análisis de interferencias elemento por elemento.";
    const vacio = document.createElement("p");
    vacio.className = "choques-vacio";
    vacio.setAttribute("data-choques-vacio", "");
    const lista = document.createElement("div");
    lista.className = "choques-lista";
    lista.setAttribute("data-choques-lista", "");
    const forma = document.createElement("form");
    forma.method = "dialog";
    const cerrar = document.createElement("button");
    cerrar.type = "submit";
    cerrar.className = "choques-cerrar";
    cerrar.textContent = "Cerrar";
    forma.append(cerrar);
    dialogo.append(titulo, nota, vacio, lista, forma);
    document.body.append(dialogo);
  }
  return dialogo;
};

export const mostrarChoques = (
  components: OBC.Components,
  world: OBC.World,
): void => {
  const ventana = obtenerDialogo();
  const lista = ventana.querySelector("[data-choques-lista]");
  const vacio = ventana.querySelector("[data-choques-vacio]");
  if (!lista || !vacio) return;
  lista.replaceChildren();
  const total = components.get(OBC.FragmentsManager).list.size;
  const choques = revisarChoques(components);
  if (total < 2) {
    vacio.textContent =
      "Carga dos o más modelos para compararlos (botón IFC o ejemplos).";
  } else if (choques.length === 0) {
    vacio.textContent = "Sin traslapes: los modelos no comparten volumen.";
  } else {
    vacio.textContent = "";
  }
  choques.forEach((choque) => {
    const fila = document.createElement("div");
    fila.className = "choques-fila";
    const texto = document.createElement("span");
    texto.textContent = `${choque.modeloA} × ${choque.modeloB}`;
    const ver = document.createElement("button");
    ver.type = "button";
    ver.className = "choques-ver";
    ver.textContent = "Enfocar";
    ver.addEventListener("click", () => enfocarCaja(world, choque.caja));
    fila.append(texto, ver);
    lista.append(fila);
  });
  ventana.showModal();
};
