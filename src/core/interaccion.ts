/**
 * core/interaccion.ts — Herramientas de interacción con el modelo.
 *
 * - configurarResaltado: pinta el elemento bajo el cursor / seleccionado
 *   (verde) para que el alumno vea qué está eligiendo. La selección alimenta
 *   el panel "Datos de la selección".
 * - configurarCorteYMedicion: planos de corte (doble clic con la herramienta
 *   activa, Supr para borrar) y medición de longitudes y áreas. Los botones
 *   que encienden estas herramientas viven en la barra del viewport.
 */

import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { MundoPrincipal } from "./mundo";

export const configurarResaltado = (
  components: OBC.Components,
  world: MundoPrincipal["world"],
): void => {
  const highlighter = components.get(OBF.Highlighter);
  highlighter.setup({
    world,
    selectMaterialDefinition: {
      color: new THREE.Color("#bcf124"),
      renderedFaces: 1,
      opacity: 1,
      transparent: false,
    },
  });
};

export const configurarCorteYMedicion = (
  components: OBC.Components,
  world: MundoPrincipal["world"],
  viewport: HTMLElement,
): void => {
  // Planos de corte: con la herramienta activa, doble clic crea un plano.
  const clipper = components.get(OBC.Clipper);
  viewport.ondblclick = () => {
    if (clipper.enabled) clipper.create(world);
  };
  window.addEventListener("keydown", (event) => {
    if (event.code === "Delete" || event.code === "Backspace") {
      clipper.delete(world);
    }
  });

  // Medición de longitudes: doble clic dibuja, la cámara encuadra la línea.
  const lengthMeasurer = components.get(OBF.LengthMeasurement);
  lengthMeasurer.world = world;
  lengthMeasurer.color = new THREE.Color("#6528d7");
  lengthMeasurer.list.onItemAdded.add((line) => {
    const center = new THREE.Vector3();
    line.getCenter(center);
    const radius = line.distance() / 3;
    const sphere = new THREE.Sphere(center, radius);
    world.camera.controls.fitToSphere(sphere, true);
  });
  viewport.addEventListener("dblclick", () => lengthMeasurer.create());
  window.addEventListener("keydown", (event) => {
    if (event.code === "Delete" || event.code === "Backspace") {
      lengthMeasurer.delete();
    }
  });

  // Medición de áreas: doble clic agrega vértices, Enter cierra el polígono.
  const areaMeasurer = components.get(OBF.AreaMeasurement);
  areaMeasurer.world = world;
  areaMeasurer.color = new THREE.Color("#6528d7");
  areaMeasurer.list.onItemAdded.add((area) => {
    if (!area.boundingBox) return;
    const sphere = new THREE.Sphere();
    area.boundingBox.getBoundingSphere(sphere);
    world.camera.controls.fitToSphere(sphere, true);
  });
  viewport.addEventListener("dblclick", () => {
    areaMeasurer.create();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      areaMeasurer.endCreation();
    }
  });
};
