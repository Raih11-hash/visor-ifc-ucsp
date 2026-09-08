/**
 * sections/models.ts — Panel "Modelos".
 *
 * Lista los modelos cargados en la sesión y ofrece tres formas de agregar:
 * - Botón "IFC": abre el explorador para elegir un .ifc del equipo.
 * - Botón "Fragments": carga un .frag (formato rápido ya convertido).
 * - Botón "Ejemplo": descarga el IFC de ejemplo incluido en la app, para
 *   probar sin tener un archivo a la mano.
 * Además se puede arrastrar un .ifc y soltarlo sobre el visor (ver
 * core/carga-ifc.ts). Incluye buscador para filtrar la lista.
 */

import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import * as OBC from "@thatopen/components";
import { APP, appIcons } from "../../globals";
import { cargarIfcDesdeBytes, cargarModeloEjemplo } from "../../core/carga-ifc";

export interface ModelsPanelState {
  components: OBC.Components;
}

export const modelsPanelTemplate: BUI.StatefullComponent<ModelsPanelState> = (
  state,
) => {
  const { components } = state;

  const fragments = components.get(OBC.FragmentsManager);

  const [modelsList] = CUI.tables.modelsList({
    components,
    actions: { download: false },
  });

  const abrirSelector = (
    accept: string,
    alElegir: (archivo: File) => Promise<void>,
    boton: BUI.Button,
  ) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.accept = accept;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      boton.loading = true;
      try {
        await alElegir(file);
      } finally {
        boton.loading = false;
        BUI.ContextMenu.removeMenus();
      }
    });
    input.addEventListener("cancel", () => {
      boton.loading = false;
    });
    input.click();
  };

  const onAddIfcModel = ({ target }: { target: BUI.Button }) => {
    abrirSelector(".ifc", async (file) => {
      const buffer = await file.arrayBuffer();
      await cargarIfcDesdeBytes(
        components,
        new Uint8Array(buffer),
        file.name,
      );
    }, target);
  };

  const onAddFragmentsModel = ({ target }: { target: BUI.Button }) => {
    abrirSelector(".frag", async (file) => {
      const buffer = await file.arrayBuffer();
      await fragments.core.load(new Uint8Array(buffer), {
        modelId: file.name.replace(/\.frag$/i, ""),
      });
    }, target);
  };

  let mensajeEstado: HTMLElement | undefined;
  const mostrarEstado = (texto: string, esError = false) => {
    if (!mensajeEstado) return;
    mensajeEstado.textContent = texto;
    mensajeEstado.style.color = esError
      ? "var(--bim-ui_red)"
      : "var(--bim-ui_grey)";
  };

  const onLoadExample = async ({ target }: { target: BUI.Button }) => {
    target.loading = true;
    mostrarEstado(`Descargando ${APP.modeloEjemploNombre}…`);
    try {
      // Evita duplicar el ejemplo si ya está cargado.
      const yaCargado = [...fragments.list.values()].some(
        (modelo) => modelo.modelId === APP.modeloEjemploNombre,
      );
      if (!yaCargado) {
        await cargarModeloEjemplo(components);
      }
      mostrarEstado("Modelo de ejemplo listo. ¡Explóralo!");
    } catch (error) {
      mostrarEstado(
        error instanceof Error ? error.message : "No se pudo cargar el ejemplo.",
        true,
      );
    } finally {
      target.loading = false;
    }
  };

  const onSearch = (e: Event) => {
    const input = e.target as BUI.TextInput;
    modelsList.queryString = input.value;
  };

  const onCreated = (e?: Element) => {
    if (!e) return;
    mensajeEstado =
      e.querySelector<HTMLElement>("[data-estado-modelos]") ?? undefined;
  };

  return BUI.html`
    <bim-panel-section fixed icon=${appIcons.MODEL} label="Modelos" ${BUI.ref(onCreated)}>
      <div style="display: flex; gap: 0.5rem;">
        <bim-text-input @input=${onSearch} vertical placeholder="Buscar…" debounce="200"></bim-text-input>
        <bim-button style="flex: 0;" icon=${appIcons.ADD} tooltip-title="Agregar modelo" tooltip-text="Abre un .ifc de tu equipo o un .frag ya convertido.">
          <bim-context-menu style="gap: 0.25rem;">
            <bim-button label="IFC" @click=${onAddIfcModel}></bim-button>
            <bim-button label="Fragments" @click=${onAddFragmentsModel}></bim-button>
          </bim-context-menu>
        </bim-button>
      </div>
      <bim-button style="flex: 0;" label="Cargar ejemplo" icon=${appIcons.EXAMPLE} @click=${onLoadExample}
        tooltip-title="Modelo de ejemplo" tooltip-text="Descarga un edificio IFC4 de muestra para probar el visor."></bim-button>
      <bim-label data-estado-modelos style="font-size: 0.75rem;">Sin modelos. Agrega un IFC, suelta un archivo sobre el visor o carga el ejemplo.</bim-label>
      ${modelsList}
    </bim-panel-section>
  `;
};
