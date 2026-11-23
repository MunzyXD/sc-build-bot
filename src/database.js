import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS repositories (
 id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL UNIQUE,
 default_branch TEXT NOT NULL DEFAULT 'main', variant TEXT NOT NULL DEFAULT 'debug',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS builds (
 id INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT NOT NULL, branch TEXT NOT NULL,
 variant TEXT NOT NULL, chat_id TEXT NOT NULL, user_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'QUEUED', workflow_run_id TEXT, dispatch_time TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 error TEXT, artifact_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);
`);
export const repositories = {
 add: db.prepare(`INSERT INTO repositories(full_name,default_branch,variant,created_by) VALUES(?,?,?,?)
 ON CONFLICT(full_name) DO UPDATE SET default_branch=excluded.default_branch,variant=excluded.variant`),
 list: db.prepare('SELECT * FROM repositories ORDER BY full_name'),
 get: db.prepare('SELECT * FROM repositories WHERE full_name=?'),
 remove: db.prepare('DELETE FROM repositories WHERE full_name=?')
};
export const builds = {
 create: db.prepare("INSERT INTO builds(repo,branch,variant,chat_id,user_id,status) VALUES(?,?,?,?,?,'QUEUED')"),
 get: db.prepare('SELECT * FROM builds WHERE id=?'),
 recent: db.prepare('SELECT * FROM builds ORDER BY id DESC LIMIT 15'),
 active: db.prepare("SELECT * FROM builds WHERE status IN ('QUEUED','DISPATCHING','RUNNING') ORDER BY id"),
 update: db.prepare(`UPDATE builds SET status=@status,workflow_run_id=COALESCE(@workflow_run_id,workflow_run_id),
 dispatch_time=COALESCE(@dispatch_time,dispatch_time),updated_at=CURRENT_TIMESTAMP,error=@error,
 artifact_name=COALESCE(@artifact_name,artifact_name) WHERE id=@id`),
 countActive: db.prepare("SELECT COUNT(*) AS count FROM builds WHERE status IN ('QUEUED','DISPATCHING','RUNNING')")
};
export function closeDatabase() { db.close(); }
