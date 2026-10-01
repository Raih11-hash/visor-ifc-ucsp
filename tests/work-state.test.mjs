import test from 'node:test';
import assert from 'node:assert/strict';

test('el guardado confirmado solo limpia la revisión que se capturó',async()=>{
  const {WorkState}=await import('../src/domain/work-state.ts');
  const state=new WorkState();assert.equal(state.dirty,false);
  state.changed();const captured=state.revision;state.changed();state.saved(captured);
  assert.equal(state.dirty,true,'un cambio durante el guardado no puede declararse guardado');
  state.saved(state.revision);assert.equal(state.dirty,false);
  state.changed();assert.equal(state.dirty,true);
});
