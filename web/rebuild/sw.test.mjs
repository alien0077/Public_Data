import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const workerSource=readFileSync(new URL('./sw.js',import.meta.url),'utf8');

function loadWorker(){
 const listeners={},fetchCalls=[],cacheWrites=[],waits=[];
 const cache={put:async(request,response)=>cacheWrites.push({url:request.url,body:await response.text()})};
 const self={location:new URL('https://alien0077.github.io/Public_Data/web/rebuild/sw.js'),addEventListener:(name,handler)=>{listeners[name]=handler;}};
 const context={self,caches:{open:async()=>cache,keys:async()=>[]},fetch:async(...args)=>{fetchCalls.push(args);return new Response('fresh-page',{status:200});},URL,Response,Promise,Error};
 vm.runInNewContext(workerSource,context);
 return {listeners,fetchCalls,cacheWrites,waits};
}

async function dispatchFetch(worker,request){
 let responsePromise;
 worker.listeners.fetch({request,respondWith:value=>{responsePromise=value;},waitUntil:value=>worker.waits.push(value)});
 return responsePromise;
}

test('navigation refresh bypasses the browser HTTP cache and updates the offline shell',async()=>{
 const worker=loadWorker();
 const request={url:'https://alien0077.github.io/Public_Data/web/rebuild/',method:'GET',mode:'navigate',destination:'document'};
 const responsePromise=dispatchFetch(worker,request);
 const response=await responsePromise;
 await Promise.all(worker.waits);
 assert.equal(await response.text(),'fresh-page');
 assert.equal(worker.fetchCalls[0][0],request.url);
 assert.equal(worker.fetchCalls[0][1].cache,'no-store');
 assert.equal(worker.fetchCalls[0][1].credentials,'same-origin');
 assert.deepEqual(worker.cacheWrites,[{url:request.url,body:'fresh-page'}]);
});

test('non-navigation assets keep the existing network-first request and cache behavior',async()=>{
 const worker=loadWorker();
 const request={url:'https://alien0077.github.io/Public_Data/web/rebuild/app.mjs?v=227',method:'GET',mode:'cors',destination:'script'};
 const responsePromise=dispatchFetch(worker,request);
 const response=await responsePromise;
 await Promise.all(worker.waits);
 assert.equal(await response.text(),'fresh-page');
 assert.equal(worker.fetchCalls.length,1);
 assert.equal(worker.fetchCalls[0].length,1);
 assert.equal(worker.fetchCalls[0][0],request);
 assert.deepEqual(worker.cacheWrites,[{url:request.url,body:'fresh-page'}]);
});
