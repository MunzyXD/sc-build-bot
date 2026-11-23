# SC Build Android

Starter Android application included alongside the Telegram build-bot source. The Android Gradle project is isolated in this directory so it does not interfere with the Node.js bot at the repository root.

Build locally from this directory with Gradle 8.9 or run the `Android APK Build` workflow in GitHub Actions.

- Package: `com.munzyxd.scbuild`
- Minimum Android: API 23
- Compile/target SDK: 35
- Variants: debug and release (release is unsigned unless signing is configured)
