import test from 'node:test';
import assert from 'node:assert/strict';
import {protectLatestTableLoad} from '../src/ui/latest-table-load.ts';

function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject};}
// Contrato público mínimo de BUI.Table, sin DOM ni datos IFC inventados.
function table(){return {data:[],loading:false,loadFunction:undefined,async loadData(){this.loading=true;try{this.data=await this.loadFunction();return true;}catch{return false;}finally{this.loading=false;}}};}

test('protector devuelve loader original después de completar la carga',async()=>{
  const t=table();protectLatestTableLoad(t);const loader=async()=>['actual'];t.loadFunction=loader;
  assert.equal(await t.loadData(true),true);assert.deepEqual(t.data,['actual']);assert.equal(t.loadFunction,loader);
});

test('resultado tardío no reemplaza datos de carga nueva',async()=>{
  const t=table(),invalidate=protectLatestTableLoad(t),old=deferred();t.loadFunction=()=>old.promise;
  const a=t.loadData(true);invalidate();const loader=async()=>['nuevo'];t.loadFunction=loader;
  assert.equal(await t.loadData(true),true);old.resolve(['antiguo']);assert.equal(await a,false);
  assert.deepEqual(t.data,['nuevo']);assert.equal(t.loadFunction,loader);
});
test('fallo tardío no borra datos de carga nueva',async()=>{
  const t=table(),invalidate=protectLatestTableLoad(t),old=deferred();t.loadFunction=()=>old.promise;
  const a=t.loadData(true);invalidate();t.loadFunction=async()=>['nuevo'];await t.loadData(true);
  old.reject(new Error('viejo'));assert.equal(await a,false);assert.deepEqual(t.data,['nuevo']);
});
test('carga antigua no apaga indicador de una nueva pendiente',async()=>{
  const t=table(),invalidate=protectLatestTableLoad(t),old=deferred(),next=deferred();t.loadFunction=()=>old.promise;
  const a=t.loadData(true);invalidate();t.loadFunction=()=>next.promise;const b=t.loadData(true);
  old.resolve(['antiguo']);await a;assert.equal(t.loading,true);
  next.resolve(['nuevo']);assert.equal(await b,true);assert.equal(t.loading,false);assert.deepEqual(t.data,['nuevo']);
});
test('fallo vigente conserva resultado público false y restaura loader',async()=>{
  const t=table();protectLatestTableLoad(t);const loader=async()=>{throw new Error('actual')};t.loadFunction=loader;
  assert.equal(await t.loadData(true),false);assert.equal(t.loading,false);assert.equal(t.loadFunction,loader);
});
test('cargas concurrentes reutilizan loader sin encadenar wrappers',async()=>{
  const t=table();protectLatestTableLoad(t);const gate=deferred(),loader=()=>gate.promise;t.loadFunction=loader;
  const a=t.loadData(true),b=t.loadData(true);gate.resolve(['dato']);await Promise.all([a,b]);assert.equal(t.loadFunction,loader);
});
