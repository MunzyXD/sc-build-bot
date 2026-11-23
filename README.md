# SC Android Build Bot

Telegram controller for Android APK builds using Node.js 20, Telegraf, GitHub REST API, GitHub Actions, Gradle, and SQLite.

## Setup

1. Install Node.js 20 or newer.
2. Create a Telegram bot with BotFather.
3. Create a fine-grained GitHub token scoped to the Android repositories.
4. Grant Contents: read, Actions: read/write, and Metadata: read.
5. Copy .env.example to .env and configure BOT_TOKEN, GITHUB_TOKEN, and numeric ADMIN_IDS.
6. Run npm install, npm run check, and npm start.
7. Persist the DB_PATH directory and WORKSPACE_ROOT when deploying in Docker.

## Android repository workflow

Copy templates/build.yml from this bot repository into each Android project at .github/workflows/build.yml, then commit it. The Android repository must have gradlew and settings.gradle or settings.gradle.kts at its root. The workflow runs assembleDebug or assembleRelease and uploads APK outputs as a GitHub Actions Artifact.

The workflow is installed in the Android target repository, not in this bot repository.

## Telegram commands

- /start
- /buildapp
- /addrepo owner/repo main,development debug
- /listrepo
- /delrepo owner/repo
- /status
- /status queue_id
- /history
- /cancel queue_id
- /help

Repository registration validates each branch and checks the Gradle wrapper and settings file. Build selection only lists registered repositories and branches. Removing a repository removes only its bot registration.

## Environment

- ADMIN_IDS: comma-separated numeric Telegram IDs.
- MAX_QUEUE_SIZE: maximum active and queued requests.
- MAX_CONCURRENT_BUILDS: queue worker count.
- MAX_APK_MB: maximum artifact APK accepted by the bot.
- WORKSPACE_TTL_HOURS: metadata expiry.
- ARTIFACT_RETENTION_DAYS: configure the same value in the target workflow if changed.

## Docker

Build the image with docker build -t sc-build-bot . and run it with a persistent volume mounted at /app/data and /app/storage/workspaces. Keep .env outside source control.

## Operational notes

The bot reports completed GitHub workflow steps as an estimate, not a fabricated Gradle percentage. APKs are downloaded to temporary files and removed after Telegram delivery. Artifacts larger than Telegram's upload limit are reported with the GitHub Actions run link. Failure reports include filtered error lines rather than full raw logs.

The workflow assumes a root Gradle wrapper and standard assembleDebug/assembleRelease task names. Custom Android project layouts or task names require adapting the workflow template before registration.
