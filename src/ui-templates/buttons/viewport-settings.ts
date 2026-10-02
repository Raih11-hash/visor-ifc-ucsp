/**
 * buttons/viewport-settings.ts — Menú de ajustes del viewport (esquina
 * superior derecha): mostrar/ocultar la grilla y cambiar la proyección de
 * la cámara entre perspectiva y ortográfica.
 */

import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { appIcons } from "../../globals";

interface ViewportSettingsState {
  components: OBC.Components;
  world: OBC.SimpleWorld<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBF.PostproductionRenderer
  >;
}

export const viewportSettingsTemplate: BUI.StatefullComponent<
  ViewportSettingsState
> = (state) => {
  const { components, world } = state;
  const renderer=world.renderer;
  if(!renderer)throw new Error("El renderizador todavía no está disponible.");

  const worldGrid = components.get(OBC.Grids).list.get(world.uuid);
  let controls: HTMLElement | undefined;
  const sync = () => {
    const button=controls?.querySelector<HTMLButtonElement>('#viewport-grid-toggle');
    if(button){button.textContent=worldGrid?.visible?'Ocultar cuadrícula':'Mostrar cuadrícula';button.setAttribute('aria-pressed',String(worldGrid?.visible??false));}
    const checkbox=controls?.querySelector<BUI.Checkbox>('#viewport-grid-checkbox');
    if(checkbox)checkbox.checked=worldGrid?.visible??false;
    const logoButton=controls?.querySelector<HTMLButtonElement>('#viewport-logo-toggle');
    if(logoButton){logoButton.textContent=renderer.showLogo?'Ocultar marca':'Mostrar marca';logoButton.setAttribute('aria-pressed',String(renderer.showLogo));}
  };
  const onGridButtonClick=()=>{if(worldGrid)worldGrid.visible=!worldGrid.visible;sync();};
  const onLogoButtonClick=()=>{renderer.showLogo=!renderer.showLogo;sync();};
  let worldEnableCheckbox: BUI.TemplateResult | undefined;
  if (worldGrid) {
    const onToggleGrid = ({ target }: { target: BUI.Checkbox }) => {
      worldGrid.visible = target.checked;
      target.checked = worldGrid.visible;
      sync();
    };

    worldEnableCheckbox = BUI.html`
      <bim-checkbox id="viewport-grid-checkbox" style="width: 15rem;" ?checked=${worldGrid.visible} label="Cuadrícula de fondo" @change=${onToggleGrid}></bim-checkbox>
    `;
  }

  const onProjectionChange = async ({ target }: { target: BUI.Dropdown }) => {
    const [projection] = target.value;
    if (projection !== "Perspective" && projection !== "Orthographic") return;
    await world.camera.projection.set(projection);
    world.renderer?.postproduction.updateCamera();
  };

  return BUI.html`
    <div id="viewport-display-controls" class="viewport-display-controls" ${BUI.ref((element?:Element)=>{controls=element as HTMLElement|undefined;})}>
      <button id="viewport-grid-toggle" type="button" aria-pressed=${String(worldGrid?.visible??false)} ?disabled=${!worldGrid} @click=${onGridButtonClick} title="Mostrar u ocultar la cuadrícula sin cambiar el modelo">${worldGrid?.visible?'Ocultar cuadrícula':'Mostrar cuadrícula'}</button>
      <button id="viewport-logo-toggle" type="button" aria-pressed=${String(renderer.showLogo)} @click=${onLogoButtonClick} title="Mostrar u ocultar la marca del motor 3D">${renderer.showLogo?'Ocultar marca':'Mostrar marca'}</button>
      <bim-button id="viewport-settings-toggle" style="background-color: transparent;" tooltip-title="Ajustes de vista" icon=${appIcons.SETTINGS}>
      <bim-context-menu style="width: 15rem; gap: 0.25rem">
        ${worldEnableCheckbox}
        <bim-dropdown label="Proyección de cámara" @change=${onProjectionChange}>
          <bim-option label="Perspectiva" value="Perspective" ?checked=${world.camera.projection.current === "Perspective"}></bim-option>
          <bim-option label="Ortográfica" value="Orthographic" ?checked=${world.camera.projection.current === "Orthographic"}></bim-option>
        </bim-dropdown>
      </bim-context-menu> 
      </bim-button>
    </div>
  `;
};
