/** feedback.ts — mensajes de estado accesibles y seguros (siempre textContent). */
export function avisar(texto: string, error = false): void {
  const box = document.getElementById('feedback');
  if (!box) return;
  box.textContent = texto;
  box.dataset.kind = error ? 'error' : 'info';
  box.setAttribute('role', error ? 'alert' : 'status');
  box.hidden = !texto;
}
export function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo otra vez.';
}
