# Publishing the native plugin

The plugin ships embedded Swift/AppKit source and downloads a matching native executable from a fixed GitHub Release. The executable and manifest must match the plugin version, source SHA-256, recipe and architecture. Never reuse an older release's assets for a changed source identity.

1. Update `package.json`, `package-lock.json`, `companionVersion`, embedded Info.plist, `nativeReleaseTag` and the workflow's default tag together.
2. Add `docs/releases/<version>.md`. Describe implemented changes, upgrade steps and remaining acceptance limits; the publish job requires this exact file.
3. Run `npm run check` and `npm run native:check`. For local cross-compilation, run `node scripts/package-native-release.mjs` after runtime compilation on macOS. GUI and real-host acceptance are separate from automated checks.
4. Commit and push the release revision. With explicit release authorization, create and push its `v<version>` tag. Do not move or overwrite a published tag.
5. The Native release workflow runs validation on macOS, cross-compiles Apple Silicon and Intel executables, and uploads both executables and both JSON manifests. Only a successful build allows the publish job to create the GitHub Release.
6. Verify the workflow succeeds, the Release targets the intended tag, and all four assets are available. Failed workflows are not a completed release; inspect the failed job before retrying.

Users update with `paseo plugin update paseo-buddy`, reload the plugin/client, then stop the old companion and choose **下载并启动**. Existing verified caches for other versions are preserved. Users do not need a compiler. Apple Developer signing/notarization and real hardware/download acceptance must not be implied by successful CI alone.

Registry changes, posting to discussions/issues and unrelated publication require their own authorization.
