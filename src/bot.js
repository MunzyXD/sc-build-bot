import {Telegraf} from 'telegraf';
import {config} from './config.js';
import {repositories,builds} from './database.js';
import {attachBot,startQueue,cancelBuild} from './queue.js';
import * as github from './github.js';
export const bot=new Telegraf(config.botToken); attachBot(bot);
const admin=ctx=>config.adminIds.has(String(ctx.from?.id));
bot.use(async(ctx,next)=>{if(!admin(ctx))return ctx.reply('Akses ditolak. Bot ini hanya untuk admin terdaftar.');return next();});
const help=`<b>SC Android Build Bot</b>
/start atau /help - Bantuan
/addrepo owner/repo branch [debug|release] - Daftarkan repo
/listrepo - Daftar repo
/delrepo owner/repo - Hapus pendaftaran lokal
/buildapp owner/repo branch - Jalankan build
/status [id] - Status build
/history - Riwayat build
/cancel id - Batalkan build

Contoh: <code>/addrepo MunzyXD/aplikasi main debug</code>
Contoh: <code>/buildapp MunzyXD/aplikasi main</code>

Pasang file <code>templates/build.yml</code> dari project bot ke <code>.github/workflows/build.yml</code> di setiap repo Android tujuan.`;
bot.start(ctx=>ctx.reply(help,{parse_mode:'HTML'}));
bot.help(ctx=>ctx.reply(help,{parse_mode:'HTML'}));
bot.command('addrepo',async ctx=>{
 const a=ctx.message.text.trim().split(/\s+/).slice(1);
 if(a.length<2)return ctx.reply('Format: /addrepo owner/repo branch [debug|release]');
 const [repo,branch,variant='debug']=a;
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))return ctx.reply('Format repo harus owner/repo.');
 if(!['debug','release'].includes(variant))return ctx.reply('Varian harus debug atau release.');
 try {
  const meta=await github.getRepository(repo);
  if(meta.archived||meta.disabled)return ctx.reply('Repository tidak aktif atau diarsipkan.');
  await github.validateBranch(repo,branch);
  repositories.add.run(repo,branch,variant,String(ctx.from.id));
  return ctx.reply(`Repository ${repo} terdaftar. Branch: ${branch}. Varian: ${variant}.`);
 }catch(e){return ctx.reply(`Gagal mendaftarkan repository: ${e.message}`);}
});
bot.command('listrepo',ctx=>{
 const rows=repositories.list.all(); if(!rows.length)return ctx.reply('Belum ada repository terdaftar.');
 return ctx.reply(rows.map((r,i)=>`${i+1}. ${r.full_name} | ${r.default_branch} | ${r.variant}`).join('\n'));
});
bot.command('delrepo',ctx=>{
 const repo=ctx.message.text.trim().split(/\s+/)[1];if(!repo)return ctx.reply('Format: /delrepo owner/repo');
 const out=repositories.remove.run(repo);return ctx.reply(out.changes?`Pendaftaran ${repo} dihapus. Repository GitHub tidak ikut dihapus.`:'Repository tidak ditemukan.');
});
bot.command('buildapp',async ctx=>{
 const [repo,branch]=ctx.message.text.trim().split(/\s+/).slice(1);
 if(!repo||!branch)return ctx.reply('Format: /buildapp owner/repo branch');
 const reg=repositories.get.get(repo);if(!reg)return ctx.reply('Repo belum terdaftar. Gunakan /addrepo.');
 try {
  await github.validateBranch(repo,branch);
  if(builds.countActive.get().count>=config.maxQueueSize)return ctx.reply('Antrean penuh. Coba lagi nanti.');
  const row=builds.create.run(repo,branch,reg.variant,String(ctx.chat.id),String(ctx.from.id));
  const id=Number(row.lastInsertRowid);
  return ctx.reply(`Build #${id} masuk antrean.\nRepo: ${repo}\nBranch: ${branch}\nVarian: ${reg.variant}`);
 }catch(e){return ctx.reply(`Gagal membuat build: ${e.message}`);}
});
bot.command('status',ctx=>{
 const arg=ctx.message.text.trim().split(/\s+/)[1];
 const rows=arg?[builds.get.get(Number(arg))].filter(Boolean):builds.active.get();
 if(!rows.length)return ctx.reply('Tidak ada build aktif atau ID tidak ditemukan.');
 return ctx.reply(rows.map(b=>`#${b.id} | ${b.status}\n${b.repo} @ ${b.branch}${b.error?'\nError: '+b.error:''}`).join('\n\n'));
});
bot.command('history',ctx=>{
 const rows=builds.recent.all();if(!rows.length)return ctx.reply('Belum ada riwayat build.');
 return ctx.reply(rows.map(b=>`#${b.id} [${b.status}] ${b.repo} @ ${b.branch}`).join('\n'));
});
bot.command('cancel',async ctx=>{
 const id=Number(ctx.message.text.trim().split(/\s+/)[1]);if(!Number.isInteger(id)||id<1)return ctx.reply('Format: /cancel id');
 try{await cancelBuild(id);return ctx.reply(`Build #${id} dibatalkan.`);}catch(e){return ctx.reply(e.message);}
});
bot.catch((e,ctx)=>{console.error('Telegram handler error:',e);ctx.reply('Terjadi kesalahan. Periksa log server.').catch(()=>{});});
export function launchBot(){startQueue();return bot.launch();}
