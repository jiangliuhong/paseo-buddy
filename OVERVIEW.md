# Paseo Buddy

Install through Paseo Settings → Plugins with `git:jiangliuhong/paseo-buddy`, enable it, then open **悬浮窗口 → 下载并启动**. A single click downloads and verifies the matching native GitHub Release and starts the window. macOS 13+, npm for plugin preparation, and a daemon in the local logged-in desktop session are required. Users do not need Apple developer tools.

Later enables reuse a verified cache. Downloads are restricted to this repository's fixed release version and GitHub asset hosts, with bounded size, timeout, cancellation and SHA-256 validation. No provider credentials are sent. Agent credentials remain in Node; the native child receives normalized display state over inherited pipes and opens no listening port.

If the release is unavailable, publish the matching draft GitHub Release before retrying. Network failure or interruption leaves no partial installed cache; retry **下载并启动**. Invalid existing caches are preserved for explicit repair. Stop and disable cancel pending downloads. Old Electron copies must be quit manually; their caches are not removed.

Source builds remain available to developers with Apple Command Line Tools or Xcode. See [README.md](README.md), [development.md](docs/development.md), and [architecture.md](docs/architecture.md). System notification permission and Focus settings still control banner delivery. Broader hardware/accessibility and downloaded-binary acceptance remain pending; see [review-readiness.md](docs/review-readiness.md).
