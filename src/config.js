import 'dotenv/config';
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
const adminIds = (process.env.ADMIN_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
if (!adminIds.length || adminIds.some(v => !/^\d+$/.test(v))) throw new Error('ADMIN_IDS must contain numeric Telegram user IDs separated by commas.');
export const config = {
  botToken: required('BOT_TOKEN'), githubToken: required('GITHUB_TOKEN'),
  adminIds: new Set(adminIds),
  githubApiUrl: (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, ''),
  dbPath: process.env.DB_PATH || './data/bot.sqlite',
  pollIntervalMs: Math.max(5000, Number(process.env.POLL_INTERVAL_MS || 15000)),
  buildTimeoutMinutes: Math.max(5, Number(process.env.BUILD_TIMEOUT_MINUTES || 45)),
  maxQueueSize: Math.max(1, Number(process.env.MAX_QUEUE_SIZE || 10)),
  maxApkMb: Math.max(1, Number(process.env.MAX_APK_MB || 100))
};
