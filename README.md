# SC Android Build Bot

Telegram controller for Android APK builds using GitHub Actions. The bot queues jobs, monitors workflow runs, downloads APK artifacts, and sends them back to Telegram.

## Requirements
- Node.js 20+
- Telegram bot token from @BotFather
- GitHub fine-grained personal access token with Actions read/write, Contents read, Metadata read, scoped only to target repositories
- A server/VPS that stays online

## Setup target Android repositories
Copy `templates/build.yml` from this repository into every Android app repository at:
`.github/workflows/build.yml`
Commit the workflow file. The template assumes a conventional single-module Android Gradle project with `app`, `gradlew`, and tasks `assembleDebug` / `assembleRelease`. Adjust it if your project differs.

## Configure and run
```bash
cp .env.example .env
npm install
npm run check
npm start
```
Set `BOT_TOKEN`, `GITHUB_TOKEN`, and `ADMIN_IDS` in .env. ADMIN_IDS must be numeric Telegram user IDs, comma-separated. Never commit .env or share tokens.

## Docker
```bash
docker build -t sc-build-bot .
docker run -d --name sc-build-bot --restart unless-stopped --env-file .env -v sc-build-data:/app/data sc-build-bot
```

## Telegram commands
```
/start
/help
/addrepo owner/repo main debug
/listrepo
/buildapp owner/repo main
/status
/status 3
/history
/cancel 3
/delrepo owner/repo
```

`/delrepo` removes only the local bot registration; it never deletes a GitHub repository.

## Notes
- GitHub Actions must be enabled in each target repository.
- Release builds may require signing configuration using GitHub Actions Secrets; the template does not create a signing key.
- Bot database is stored at `data/bot.sqlite` by default. Persist this directory between restarts.
- APK size limit is controlled by MAX_APK_MB.
- Only build repositories you own or are authorized to build.
