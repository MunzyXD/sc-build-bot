import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import unzipper from 'unzipper';
import { Input } from 'telegraf';
import { config } from './config.js';
import { builds } from './database.js';
import * as github from './github.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let bot; let started=false;
export function attachBot(instance){bot=instance;}
async function notify(chat,message){try{await bot.telegram.sendMessage(chat,message);}catch(e){console.error('Telegram notification:',e.message);}}
async function setStatus(b,status,extra={}) {
 builds.update.run({id:b.id,status,workflow_run_id:extra.workflow_run_id??null,
  dispatch_time:extra.dispatch_time??null,error:extra.error??null,artifact_name:extra.artifact_name??null});
}
async function deliverApk(build,run) {
 const artifacts=await github.getArtifacts(build.repo,run.id);
 const artifact=artifacts.find(a=>!a.expired&&a.name===`android-apk-build-${build.id}`)||artifacts.find(a=>!a.expired&&a.name.includes('android-apk'));
 if(!artifact) throw new Error('Artifact APK tidak ditemukan. Periksa langkah upload-artifact pada workflow.');
 const zip=await github.downloadArtifact(build.repo,artifact.id);
 const dir=await unzipper.Open.buffer(zip);
 const entries=dir.files.filter(f=>f.type==='File'&&f.path.toLowerCase().endsWith('.apk'));
 if(!entries.length) throw new Error('Artifact tidak berisi file APK.');
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'sc-build-'));
 try {
  for(const entry of entries) {
   const data=await entry.buffer();
   if(data.length>config.maxApkMb*1024*1024) throw new Error(`APK melebihi batas ${config.maxApkMb} MB.`);
   const file=path.join(tmp,path.basename(entry.path)); await fs.writeFile(file,data);
   await bot.telegram.sendDocument(build.chat_id,Input.fromLocalFile(file),{
    caption:`Build #${build.id} berhasil\nRepo: ${build.repo}\nBranch: ${build.branch}\nVarian: ${build.variant}`
   });
  }
 } finally { await fs.rm(tmp,{recursive:true,force:true}); }
}
async function processBuild(initial) {
 let b=builds.get.get(initial.id); const startedAt=Date.now();
 try {
  if(b.status==='QUEUED') {
   const dispatchTime=new Date().toISOString();
   await setStatus(b,'DISPATCHING',{dispatch_time:dispatchTime});
   b=builds.get.get(b.id);
   await github.dispatchBuild(b.repo,b.branch,b.variant,b.id);
  }
  // A DISPATCHING row is reconciled against recent runs after restart; it is never blindly re-dispatched.
  if(!b.workflow_run_id) {
   let run=null;
   for(let i=0;i<12&&!run;i++){run=await github.findWorkflowRun(b.repo,b.branch,b.dispatch_time||b.created_at);if(!run)await sleep(5000);}
   if(!run) throw new Error('Workflow run tidak ditemukan. Periksa tab Actions pada repository tujuan sebelum mencoba ulang.');
   await setStatus(b,'RUNNING',{workflow_run_id:String(run.id)}); b=builds.get.get(b.id);
  }
  await notify(b.chat_id,`Build #${b.id} sedang berjalan. APK akan dikirim setelah selesai.`);
  while(Date.now()-startedAt<config.buildTimeoutMinutes*60000) {
   const run=await github.getWorkflowRun(b.repo,b.workflow_run_id);
   if(run.status==='completed') {
    if(run.conclusion!=='success') throw new Error(`GitHub Actions selesai dengan status: ${run.conclusion||'unknown'}`);
    await deliverApk(b,run); await setStatus(b,'SUCCESS'); await notify(b.chat_id,`Build #${b.id} selesai. APK telah dikirim.`); return;
   }
   await sleep(config.pollIntervalMs);
  }
  throw new Error('Build melewati batas waktu.');
 } catch(e) {
  const latest=builds.get.get(initial.id);
  await setStatus(latest,'FAILED',{error:e.message.slice(0,900)});
  await notify(latest.chat_id,`Build #${latest.id} gagal: ${e.message}`);
 }
}
export function startQueue() {
 if(started)return; started=true;
 (async()=>{while(true){const next=builds.active.get().find(b=>['QUEUED','DISPATCHING','RUNNING'].includes(b.status));if(!next){await sleep(2500);continue;}await processBuild(next);}})()
 .catch(e=>console.error('Queue worker stopped:',e));
}
export async function cancelBuild(id) {
 const b=builds.get.get(id); if(!b)throw new Error('Build ID tidak ditemukan.');
 if(['SUCCESS','FAILED','CANCELLED'].includes(b.status))throw new Error('Build sudah selesai.');
 if(b.workflow_run_id)await github.cancelWorkflowRun(b.repo,b.workflow_run_id);
 builds.update.run({id:b.id,status:'CANCELLED',workflow_run_id:null,dispatch_time:null,error:'Dibatalkan admin.',artifact_name:null});
 await notify(b.chat_id,`Build #${id} dibatalkan oleh admin.`); return b;
}
