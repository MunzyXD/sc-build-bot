import fs from 'node:fs/promises';
import {config} from './config.js';
import {launchBot,bot} from './bot.js';
import {closeDatabase,builds} from './database.js';
await fs.mkdir(config.workspaceRoot,{recursive:true});
console.log('Starting SC Android Build Bot. Admin count: '+config.adminIds.size);
console.log('Recoverable build records: '+builds.active.all().length);
await launchBot();
console.log('Telegram bot is running.');
let closing=false;
async function shutdown(signal){if(closing)return;closing=true;console.log('Shutdown: '+signal);bot.stop(signal);closeDatabase();process.exit(0);}
process.once('SIGINT',()=>shutdown('SIGINT'));process.once('SIGTERM',()=>shutdown('SIGTERM'));
