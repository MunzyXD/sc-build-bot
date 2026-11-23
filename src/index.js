import {config} from './config.js';
import {launchBot,bot} from './bot.js';
import {closeDatabase} from './database.js';
console.log('Starting SC Android Build Bot...');
console.log(`Admin IDs configured: ${config.adminIds.size}`);
launchBot().then(()=>console.log('Telegram bot is running.')).catch(e=>{console.error('Bot startup failed:',e);process.exit(1);});
function shutdown(signal){console.log(`Received ${signal}; shutting down.`);bot.stop(signal);closeDatabase();process.exit(0);}
process.once('SIGINT',()=>shutdown('SIGINT'));
process.once('SIGTERM',()=>shutdown('SIGTERM'));
