# Publishing the native-source plugin

The current implementation distributes plugin and embedded Swift/AppKit source through a reviewed Git revision. It does not publish or download a Companion binary, DMG, ZIP, compiler or Electron runtime. Historical `docs/releases/` notes describe old Electron releases and are not installation instructions for the current source.

Before proposing a Registry pin: run `npm ci --ignore-scripts`, `npm run check`, `npm run native:check`, `npm run native:build`, then complete native desktop acceptance on the supported architectures. Capture a real running interface and verify its public HTTPS image URL. Review source/build/process permissions and confirm OVERVIEW.md matches the revision. See `review-readiness.md`.

Record the final committed SHA and send it, validation results and screenshot URL to the existing Registry PR only when the user authorizes posting. No new tag, Release or Registry PR is necessary for this remediation. Commit/push/publication are separate user-authorized actions. The automatic binary Release workflow has been removed.
