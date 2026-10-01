/** main.ts — shell ligero inmediato; motor diferido y recuperación visible. */
import { APP } from './globals';
import { avisar, mensajeError } from './ui/feedback';

const phase = document.getElementById('startup-phase');
const retry = document.getElementById('retry-start') as HTMLButtonElement;
const startup = document.getElementById('startup') as HTMLElement;
const help = document.getElementById('help-dialog') as HTMLDialogElement;
retry.addEventListener('click', () => window.location.reload());
document.getElementById('show-help')?.addEventListener('click', () => help.showModal());
document.getElementById('close-help')?.addEventListener('click', () => help.close());
document.title = `${APP.titulo} · UCSP · v${APP.version}`;
window.addEventListener('unhandledrejection', (event) => { avisar(mensajeError(event.reason), true); });

async function iniciar(): Promise<void> {
  document.documentElement.dataset.appState = 'loading';
  const timeout = window.setTimeout(() => {
    if (document.documentElement.dataset.appState === 'ready') return;
    document.documentElement.dataset.appState = 'error';
    if (phase) phase.textContent = 'El motor no terminó de abrir. Revisa la conexión y vuelve a intentarlo.';
    retry.hidden = false;
  }, 90000);
  try {
    if (phase) phase.textContent = 'Abriendo el motor 3D y comprobando sus recursos…';
    const { iniciarVisor } = await import('./core/bootstrap');
    await iniciarVisor();
    if (document.documentElement.dataset.appState === 'error') return;
    document.documentElement.dataset.appState = 'ready';
    startup.hidden = true;
  } catch (error) {
    document.documentElement.dataset.appState = 'error';
    if (phase) phase.textContent = mensajeError(error);
    retry.hidden = false;
  } finally { window.clearTimeout(timeout); }
}
void iniciar();
