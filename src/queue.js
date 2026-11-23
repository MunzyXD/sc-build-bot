import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import unzipper from 'unzipper';
import {Input} from 'telegraf';
import {config} from './config.js';
import {builds,workspaces,history} from './database.js';
import * as github from './github.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let bot;let started=false;const recovery=[];
export function attachBot(instance){bot=instance;}
async function notify(chat,text){try{await bot.telegram.sendMessage(chat,text);}catch(e){console.error('Telegram notification failed:',e.message);}}
function update(b,status,extra={}){builds.update.run({id:b.id,status,run_id:extra.run_id==null?null:String(extra.run_id),dispatch_time:extra.dispatch_time||null,finished_at:extra.finished_at||null,error:extra.error||null,artifact_id:extra.artifact_id==null?null:String(extra.artifact_id),artifact_name:extra.artifact_name||null,delivery_status:extra.delivery_status||null});}
async function workspaceCreate(b){if(workspaces.get.get(b.build_id))return;await fs.mkdir(config.workspaceRoot,{recursive:true});const name='tg-'+String(b.telegram_id||b.user_id)+'-'+b.build_id;const dir=await fs.mkdtemp(path.join(path.resolve(config.workspaceRoot),name+'-'));const now=new Date();workspaces.add.run({workspace_id:name,build_id:b.build_id,owner_id:b.telegram_id||b.user_id,path:dir,created_at:now.toISOString(),expires_at:new Date(now.getTime()+config.workspaceTtlHours*3600000).toISOString(),cleanup_status:'PENDING'});}
async function workspaceCleanup(b){const w=workspaces.get.get(b.build_id);if(!w)return;try{await fs.rm(w.path,{recursive:true,force:true,maxRetries:3});workspaces.clean.run(b.build_id);await notify(b.chat_id,'Workspace '+w.workspace_id+' dibersihkan.');}catch(e){workspaces.retry.run(w.workspace_id,w.path,e.message.slice(0,300));}}
function extractErrors(log){const safe=github.sanitizeLog(log);return(safe.split(/\r?\n/).filter(x=>/error|failed|exception|could not|unable to/i.test(x)).slice(-25).join('\n')||'Ringkasan error tidak tersedia.').slice(-5000);}
async function reportFailure(b,run,error){let summary=github.sanitizeLog(error);try{const jobs=await github.getJobs(b.repo,run.id);for(const job of jobs.filter(x=>x.conclusion==='failure').slice(0,2)){summary+='\n'+job.name+'\n'+extractErrors(await github.getJobLogs(b.repo,job.id));}}catch(e){summary+='\nLog detail tidak tersedia: '+e.message;}const report='ANDROID BUILD FAILED\nBuild ID: '+b.build_id+'\nProject: '+b.repo+'\nBranch: '+b.branch+'\nWorkflow: '+run.html_url+'\n\n'+summary.slice(0,6500);const file=path.join(os.tmpdir(),'failed-'+b.build_id+'.txt');try{await fs.writeFile(file,report,{mode:0o600});await bot.telegram.sendDocument(b.chat_id,Input.fromLocalFile(file),{caption:'Build '+b.build_id+' gagal. Ringkasan terlampir.'});}catch{await notify(b.chat_id,report.slice(0,3500));}finally{await fs.rm(file,{force:true}).catch(()=>{});}}
async function sendApk(b,run){const artifacts=await github.getArtifacts(b.repo,run.id);const artifact=artifacts.find(x=>!x.expired&&x.name==='android-apk-build-'+b.build_id);if(!artifact)throw new Error('Artifact APK tidak ditemukan.');const zip=await github.downloadArtifact(b.repo,artifact.id);const dir=await unzipper.Open.buffer(zip);const entries=dir.files.filter(x=>x.type==='File'&&x.path.toLowerCase().endsWith('.apk'));if(!entries.length)throw new Error('ZIP artifact tidak berisi APK.');let sent=0;for(const entry of entries){const data=await entry.buffer();if(!data.length||data.length>config.maxApkMb*1048576||data[0]!==0x50||data[1]!==0x4b)throw new Error('APK kosong, tidak valid, atau melebihi batas '+config.maxApkMb+' MB.');if(data.length>50*1048576){await notify(b.chat_id,'Ukuran APK '+(data.length/1048576).toFixed(1)+' MB. Unduh artifact melalui GitHub Actions: '+run.html_url);continue;}const name=path.basename(entry.path).replace(/[^A-Za-z0-9._-]/g,'_');const file=path.join(os.tmpdir(),'apk-'+b.build_id+'-'+name);try{await fs.writeFile(file,data,{mode:0o600});await bot.telegram.sendDocument(b.chat_id,Input.fromLocalFile(file),{caption:'ANDROID BUILD SUCCESS\nProject: '+b.repo+'\nBranch: '+b.branch+'\nBuild ID: '+b.build_id});sent++;}finally{await fs.rm(file,{force:true}).catch(()=>{});}}return{artifact, sent};}
async function processBuild(initial){
 let b=builds.get.get(initial.id);
 const startTime=Date.now();
 let run=null;
 let madeWorkspace=false;
 let lastStage='';
 try{
  await workspaceCreate(b);
  madeWorkspace=true;
  await notify(b.chat_id,'Build '+b.build_id+' dipersiapkan. '+b.repo+' @ '+b.branch);
  if(b.workflow_run_id){
   run=await github.getWorkflowRun(b.repo,b.workflow_run_id);
  }else if(b.status==='DISPATCHING'){
   const reconcileUntil=Date.now()+120000;
   while(!run&&Date.now()<reconcileUntil){
    run=await github.findWorkflowRun(b.repo,b.branch,b.dispatch_time||b.queued_at);
    if(!run)await sleep(5000);
   }
   if(!run)throw new Error('Dispatch tidak dapat direkonsiliasi. Build tidak dikirim ulang otomatis untuk mencegah duplikasi.');
   update(b,'RUNNING',{run_id:run.id});
   b=builds.get.get(b.id);
  }else{
   const dispatchAt=new Date().toISOString();
   update(b,'DISPATCHING',{dispatch_time:dispatchAt});
   const dispatch=await github.dispatchBuild(b.repo,b.branch,b.variant,b.build_id);
   if(dispatch.workflow_run_id){
    run=await github.getWorkflowRun(b.repo,dispatch.workflow_run_id);
    update(b,'RUNNING',{run_id:dispatch.workflow_run_id});
    b=builds.get.get(b.id);
   }
  }
  const deadline=Date.now()+config.buildTimeoutMinutes*60000;
  while(Date.now()<deadline){
   if(builds.get.get(b.id).status==='CANCELLED')return;
   if(!run){
    run=await github.findWorkflowRun(b.repo,b.branch,b.dispatch_time||b.queued_at);
    if(run){
     update(b,'RUNNING',{run_id:run.id});
     b=builds.get.get(b.id);
     await notify(b.chat_id,'Build '+b.build_id+' mulai berjalan. Workflow Run: '+run.id);
    }
   }
   if(run){
    const latest=await github.getWorkflowRun(b.repo,run.id);
    if(latest.status==='completed'){
     run=latest;
     if(latest.conclusion!=='success')throw new Error('Workflow selesai dengan status '+latest.conclusion);
     const result=await sendApk(b,latest);
     const delivery=result.sent?'SENT':'LINK_ONLY';
     update(b,'SUCCESS',{finished_at:new Date().toISOString(),artifact_id:result.artifact.id,artifact_name:result.artifact.name,delivery_status:delivery});
     history.add.run({build_id:b.build_id,result:'SUCCESS',duration_ms:Date.now()-startTime,artifact_name:result.artifact.name,delivery_status:delivery,error_summary:null,finished_at:new Date().toISOString()});
     await notify(b.chat_id,'Build '+b.build_id+' SUCCESS. APK siap.');
     return;
    }
    const jobs=await github.getJobs(b.repo,run.id);
    const steps=jobs.flatMap(j=>j.steps||[]);
    const current=steps.find(s=>s.status==='in_progress');
    const completed=steps.filter(s=>s.status==='completed').length;
    const stage=(current?.name||latest.status)+'|'+completed+'|'+steps.length;
    if(stage!==lastStage){
     lastStage=stage;
     await notify(b.chat_id,'Build '+b.build_id+' — '+(current?.name||latest.status)+'\nTahapan selesai: '+completed+'/'+Math.max(steps.length,1)+' (estimasi).');
    }
   }
   await sleep(config.pollIntervalMs);
  }
  if(run&&run.status!=='completed')await github.cancelWorkflowRun(b.repo,run.id).catch(()=>{});
  throw new Error('Build timeout setelah '+config.buildTimeoutMinutes+' menit.');
 }catch(error){
  b=builds.get.get(initial.id);
  if(b.status!=='CANCELLED'){
   const message=github.sanitizeLog(error.message).slice(0,900);
   update(b,'FAILED',{finished_at:new Date().toISOString(),error:message,delivery_status:'FAILED'});
   history.add.run({build_id:b.build_id,result:'FAILED',duration_ms:Date.now()-startTime,artifact_name:null,delivery_status:'FAILED',error_summary:message,finished_at:new Date().toISOString()});
   if(run)await reportFailure(b,run,message);else await notify(b.chat_id,'Build '+b.build_id+' gagal: '+message);
  }
 }finally{
  b=builds.get.get(initial.id);
  if(madeWorkspace)await workspaceCleanup(b);
 }
}
async function worker(){
 while(true){
  const next=recovery.shift()||builds.claimNext();
  if(!next){await sleep(2000);continue;}
  await processBuild(next);
 }
}
export function startQueue(){if(started)return;started=true;for(const b of builds.active.all()){if(b.status!=='QUEUED')recovery.push(b);}for(let i=0;i<config.maxConcurrentBuilds;i++)worker().catch(e=>console.error('Queue worker stopped:',e));}
export async function cancelBuild(id){const b=builds.get.get(id);if(!b)throw new Error('Build ID tidak ditemukan.');if(['SUCCESS','FAILED','CANCELLED','EXPIRED'].includes(b.status))throw new Error('Build sudah selesai.');if(b.workflow_run_id)await github.cancelWorkflowRun(b.repo,b.workflow_run_id);update(b,'CANCELLED',{finished_at:new Date().toISOString(),error:'Dibatalkan administrator.'});await notify(b.chat_id,'Build '+b.build_id+' dibatalkan.');return b;}
