const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const URL = process.env.BASE_URL || 'http://localhost:3132';
const DB = 'kh-en-corpus-sprint2';
const out = path.join(__dirname, '..', '.tmp', 'sprint2-browser');
fs.mkdirSync(out, {recursive:true});
const fixture = fs.readFileSync(path.join(__dirname,'..','fixtures','synthetic_edge_cases.json'),'utf8');
const native = fs.readFileSync(path.join(__dirname,'..','fixtures','native_review_sample.json'),'utf8');
const results=[],errors=[];
const row = (id=9001, project=42) => ({id,project,data:{audio:'synthetic.wav',duration_seconds:30,collector_id:'member_a'},annotations:[]});
async function read(page) { return page.evaluate(dbName=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const t=db.transaction('workspace','readonly');const q=t.objectStore('workspace').get('current');q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>db.close();};}),DB); }
async function put(page,value) { return page.evaluate(({dbName,value})=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const t=db.transaction('workspace','readwrite');t.objectStore('workspace').put(value,'current');t.oncomplete=()=>{db.close();resolve(true);};t.onabort=t.onerror=()=>reject(t.error);};}),{dbName:DB,value}); }
async function open(page) {
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(URL+'/import');
 await page.getByRole('heading',{name:'Import a snapshot',exact:true}).waitFor();
 await page.getByRole('button',{name:'Reload saved workspace',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.body.innerText.includes('Restoring saved workspace'));
}
async function choose(page,text,name='sample.json',source='label-studio',project='42') {
 await page.getByLabel('Source format',{exact:true}).selectOption(source);
 await page.getByLabel(/^Project ID/).fill(project);
 await page.getByLabel('Choose export file',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)});
 await page.getByRole('button',{name:'Preview file',exact:true}).click();
 await page.getByRole('region',{name:'Import preview',exact:true}).waitFor();
}
async function confirm(page,count) {
 await page.getByRole('button',{name:'Confirm import',exact:true}).click();
 await page.getByText(count+' saved recordings',{exact:true}).waitFor();
 await page.getByText('Snapshot imported. Open Overview to inspect the updated totals.',{exact:true}).waitFor();
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 async function check(name,fn,options={}) {
  const ctx=await browser.newContext(options);const page=await ctx.newPage();page.setDefaultTimeout(30000);
  const start=Date.now();
  try {await open(page);const observed=await fn(page,ctx);results.push({name,passed:true,ms:Date.now()-start,observed});console.log('PASS '+name);}
  catch(e){results.push({name,passed:false,ms:Date.now()-start,error:String(e)});await page.screenshot({path:path.join(out,'failure-'+results.length+'.png'),fullPage:true}).catch(()=>{});console.log('FAIL '+name+': '+e);}
  finally{await ctx.close();}
 }
 try {
 await check('PM-55 keyboard file selection, cancel and row preview',async page=>{
  const before=await read(page);
  await page.getByLabel('Source format',{exact:true}).selectOption('label-studio');
  const input=page.getByLabel('Choose export file',{exact:true});
  await input.focus();
  assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  const chooser=page.waitForEvent('filechooser');
  await input.press('Enter');
  await (await chooser).setFiles({name:'sample.json',mimeType:'application/json',buffer:Buffer.from(fixture)});
  await page.getByRole('button',{name:'Preview file',exact:true}).click();
  await page.getByRole('region',{name:'Import preview',exact:true}).waitFor();
  assert.equal(await page.getByRole('table').locator('tbody tr').count(),5);
  await page.getByRole('button',{name:'Cancel preview',exact:true}).click();
  assert.deepEqual(await read(page),before);
  return {candidateRows:5,keyboardChooser:true,cancelPreserved:true};
 });
 await check('PM-55 drop input and unsupported/oversize file rejection',async page=>{
  await page.getByLabel('Source format',{exact:true}).selectOption('label-studio');
  const dt=await page.evaluateHandle(content=>{const dt=new DataTransfer();dt.items.add(new File([content],'drop.json',{type:'application/json'}));return dt;},fixture);
  await page.locator('.dropzone').dispatchEvent('drop',{dataTransfer:dt});
  await page.getByRole('button',{name:'Preview file',exact:true}).click();
  await page.getByRole('region',{name:'Import preview',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancel preview',exact:true}).click();
  const input=page.getByLabel('Choose export file',{exact:true});
  await input.setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('a,b')});
  await page.getByText('Choose a .json or .jsonl file.',{exact:true}).waitFor();
  await input.setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(20*1024*1024+1,32)});
  await page.getByText('File exceeds the 20 MB local import limit.',{exact:true}).waitFor();
  assert.equal((await read(page)),undefined);
  return {dropSelected:true,sizeLimitBytes:20*1024*1024};
 });
 await check('PM-54 native approval is distinct from submitted/unknown, with persisted records',async page=>{
  await page.getByRole('button',{name:'Preview native example',exact:true}).click();
  await page.getByRole('region',{name:'Import preview',exact:true}).waitFor();
  const rows=page.getByRole('table').locator('tbody tr');
  assert.equal(await rows.count(),4);
  assert.equal(await rows.filter({has:page.getByRole('cell',{name:'Yes',exact:true})}).count(),2);
  await confirm(page,4);
  const saved=await read(page);
  assert.equal(saved.recordings.filter(r=>r.approved).length,2);
  assert.equal(saved.recordings.filter(r=>r.approved).reduce((n,r)=>n+(r.seconds??0),0),30);
  assert.equal(saved.recordings.find(r=>r.taskId==='synthetic-approved-unknown').seconds,null);
  await page.reload();await page.getByText('4 saved recordings',{exact:true}).waitFor();
  assert.deepEqual(await read(page),saved);
  return {approved:2,approvedKnownSeconds:30,reloadPreserved:true};
 });
 await check('PM-58/59 invalid candidate is blocked and corrected retry preserves old snapshot',async page=>{
  await choose(page,JSON.stringify([row()]));await confirm(page,1);
  const before=await read(page);
  await choose(page,'{broken');
  assert.equal(await page.getByRole('button',{name:'Confirm import',exact:true}).isDisabled(),true);
  assert.deepEqual(await read(page),before);
  await page.getByRole('button',{name:'Cancel preview',exact:true}).click();
  await choose(page,JSON.stringify([row(9002)]));await confirm(page,2);
  return {invalidBlocked:true,priorPreserved:true,correctedRecords:2};
 });
 await check('PM-58 partial JSONL requires acknowledgement and reports physical line 3',async page=>{
  const manifest=id=>JSON.stringify({recording_id:id,audio_filepath:'synthetic.wav',domain:'',speaker_gender:'',annotations:[{start:0,end:2,text:'Example'}]});
  await choose(page,manifest('a')+'\n\n{broken\n'+manifest('b'),'partial.jsonl','speech-platform','synthetic-jsonl');
  await page.getByText(/Line 3: malformed JSON syntax/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirm import',exact:true}).isDisabled(),true);
  await page.getByRole('checkbox',{name:'I reviewed the rejected rows and want to import only supported records.',exact:true}).check();
  await confirm(page,2);
  const saved=await read(page);
  assert.equal(saved.batches[0].rejected,1);
  assert.equal(saved.batches[0].sourceRows,3);
  return {accepted:2,rejected:1,errorLine:3,ackRequired:true};
 });
 await check('PM-60/61 quota failure preserves saved snapshot and candidate supports retry',async page=>{
  await choose(page,JSON.stringify([row()]));await confirm(page,1);
  const before=await read(page);
  await page.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(window.__failWrite)throw new DOMException('Injected quota','QuotaExceededError');return window.__originalPut.apply(this,args);};window.__failWrite=true;});
  await choose(page,JSON.stringify([row(9002)]));
  await page.getByRole('button',{name:'Confirm import',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Data could not be saved'}).waitFor();
  assert.deepEqual(await read(page),before);
  assert.equal(await page.getByText('1 saved recordings',{exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Confirm import',exact:true}).isVisible(),true);
  assert.equal(await page.getByText('Snapshot imported. Open Overview to inspect the updated totals.',{exact:true}).isVisible(),false);
  await page.evaluate(()=>{window.__failWrite=false;});
  await confirm(page,2);
  return {priorUnchanged:true,falseSuccess:false,candidateRetried:true};
 });
 await check('PM-60 aborted transaction is atomic',async page=>{
  await choose(page,JSON.stringify([row()]));await confirm(page,1);
  const before=await read(page);
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const result=original.apply(this,args);this.transaction.abort();return result;};});
  await choose(page,JSON.stringify([row(9002)]));
  await page.getByRole('button',{name:'Confirm import',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Data could not be saved'}).waitFor();
  assert.deepEqual(await read(page),before);
  return {transactionAborted:true,previousSnapshotPreserved:true};
 });
 await check('PM-60 stale-tab writes cannot replace newer state',async(page,ctx)=>{
  const second=await ctx.newPage();await open(second);
  await choose(second,JSON.stringify([row(9002)]));
  await choose(page,JSON.stringify([row()]));await confirm(page,1);
  const newer=await read(page);
  await second.getByRole('button',{name:'Confirm import',exact:true}).click();
  await second.getByRole('alert').filter({hasText:'Another tab saved newer changes'}).waitFor();
  assert.deepEqual(await read(second),newer);
  await second.getByRole('button',{name:'Reload saved workspace',exact:true}).click();
  await second.getByText('1 saved recordings',{exact:true}).waitFor();
  await confirm(second,2);
  return {staleBlocked:true,reloadRetry:true};
 });
 await check('PM-61 corrupt hydration stays visible without silent replacement',async page=>{
  const corrupt={version:99,revision:42,recordings:['retained bad source']};
  await put(page,corrupt);
  await page.reload();
  await page.getByRole('alert').filter({hasText:'damaged or unsupported'}).waitFor();
  assert.deepEqual(await read(page),corrupt);
  assert.equal(await page.getByRole('button',{name:'Preview native example',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Reset local workspace',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await read(page),corrupt);
  await page.getByRole('button',{name:'Reset local workspace',exact:true}).click();
  await page.getByRole('button',{name:'Confirm reset',exact:true}).click();
  await page.getByText('Workspace reset. Your original export files are unchanged.',{exact:true}).waitFor();
  assert.equal((await read(page)).version,1);
  return {corruptionRetained:true,warningVisible:true,explicitResetRecovered:true};
 });
 await check('PM-62 Cancel and Escape preserve data; confirmed reset cannot be undone by a stale tab',async(page,ctx)=>{
  await choose(page,fixture);await confirm(page,5);
  const before=await read(page);
  const second=await ctx.newPage();await open(second);
  await choose(second,JSON.stringify([row(9002)]));
  await page.getByRole('button',{name:'Reset local workspace',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await read(page),before);
  await page.getByRole('button',{name:'Reset local workspace',exact:true}).click();await page.keyboard.press('Escape');
  assert.deepEqual(await read(page),before);
  await page.getByRole('button',{name:'Reset local workspace',exact:true}).click();
  await page.getByRole('button',{name:'Confirm reset',exact:true}).click();
  await page.getByText('0 saved recordings',{exact:true}).waitFor();
  const reset=await read(page);assert.equal(reset.recordings.length,0);assert.equal(reset.batches.length,0);assert.equal(reset.targets.length,0);assert.equal(reset.selectedProject,'');
  await second.getByRole('button',{name:'Confirm import',exact:true}).click();
  await second.getByRole('alert').filter({hasText:'Another tab saved newer changes'}).waitFor();
  assert.deepEqual(await read(second),reset);
  return {cancel:true,escape:true,confirm:true,staleResurrectionBlocked:true};
 });
 await check('PM-62 5000-record import save and reload retain settings with measured timings',async page=>{
  const many=JSON.stringify(Array.from({length:5000},(_,i)=>row(i+10000)));
  const start=Date.now();await choose(page,many);const previewMs=Date.now()-start;
  const saveStart=Date.now();await confirm(page,5000);const saveMs=Date.now()-saveStart;
  let saved=await read(page);saved.members=[{id:'member_a',name:'Synthetic A'}];saved.targets=[{projectKey:saved.projects[0].key,memberId:'member_a',basis:'approved',seconds:36000,confirmed:true}];
  await put(page,saved);const reloadStart=Date.now();await page.reload();await page.getByText('5000 saved recordings',{exact:true}).waitFor();const reloadMs=Date.now()-reloadStart;
  assert.deepEqual(await read(page),saved);
  assert.equal(await page.getByLabel('Current project',{exact:true}).inputValue(),saved.selectedProject);
  await choose(page,JSON.stringify([row(20000)]));await confirm(page,5001);
  const next=await read(page);assert.deepEqual(next.targets,saved.targets);assert.deepEqual(next.members,saved.members);
  return {records:5000,sourceBytes:Buffer.byteLength(many),previewMs,saveMs,reloadMs,settingsRetained:true};
 });
 await check('PM-55 mobile import layout and controls remain usable',async page=>{
  await page.getByRole('button',{name:'Preview native example',exact:true}).click();
  await page.getByRole('region',{name:'Import preview',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,'mobile-import.png'),fullPage:true});
  return {width:390,horizontalOverflow:false};
 },{viewport:{width:390,height:900}});
 assert.deepEqual(errors,[]);
 } finally {
  await browser.close();
  const summary={baseURL:URL,results,pageErrors:errors,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({passed:summary.passed,failed:summary.failed,pageErrors:errors.length}));
  if(summary.failed||errors.length)process.exitCode=1;
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
