/**
 * core/mundo.ts — Creación del mundo 3D.
 *
 * Un "mundo" (World) junta escena + cámara + renderizador. Esta función crea
 * el mundo principal del visor con:
 * - Escena simple con fondo oscuro y grilla de referencia.
 * - Cámara que alterna entre perspectiva y ortográfica.
 * - Renderizador con postproducción (sombras suaves + bordes realzados).
 *
 * Devuelve el mundo y el viewport (el elemento HTML donde se dibuja).
 */

import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";

export interface MundoPrincipal {
  world: OBC.SimpleWorld<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBF.PostproductionRenderer
  >;
  viewport: BUI.Viewport;
}

export const crearMundo = (components: OBC.Components): MundoPrincipal => {
  const worlds = components.get(OBC.Worlds);

  const world = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBF.PostproductionRenderer
  >();
  world.name = "Main";

  world.scene = new OBC.SimpleScene(components);
  world.scene.setup();
  world.scene.three.background = new THREE.Color(0x1a1d23);

  const viewport = BUI.Component.create<BUI.Viewport>(() => {
    return BUI.html`<bim-viewport></bim-viewport>`;
  });

  world.renderer = new OBF.PostproductionRenderer(components, viewport);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  world.camera.threePersp.near = 0.01;
  world.camera.threePersp.updateProjectionMatrix();
  world.camera.controls.restThreshold = 0.05;

  const worldGrid = components.get(OBC.Grids).create(world);
  worldGrid.material.uniforms.uColor.value = new THREE.Color(0x494b50);
  worldGrid.material.uniforms.uSize1.value = 2;
  worldGrid.material.uniforms.uSize2.value = 8;

  const resizeWorld = () => {
    world.renderer?.resize();
    world.camera.updateAspect();
  };
  viewport.addEventListener("resize", resizeWorld);

  world.dynamicAnchor = false;

  // Postproducción: sombras con color + oclusión de ambiente para dar
  // profundidad al modelo sin costo para el usuario.
  const { postproduction } = world.renderer;
  postproduction.enabled = true;
  postproduction.style = OBF.PostproductionAspect.COLOR_SHADOWS;

  const { aoPass, edgesPass } = world.renderer.postproduction;
  edgesPass.color = new THREE.Color(0x494b50);
  aoPass.updateGtaoMaterial({
    radius: 0.25,
    distanceExponent: 1,
    thickness: 1,
    scale: 1,
    samples: 16,
    distanceFallOff: 1,
    screenSpaceRadius: true,
  });
  aoPass.updatePdMaterial({
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 4,
    radiusExponent: 1,
    rings: 2,
    samples: 16,
  });

  return { world, viewport };
};
