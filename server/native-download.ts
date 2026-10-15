/** Fixed public release assets only; no credentials or caller-selected URLs. */
export const nativeReleaseTag = "v0.1.4";
export const nativeReleaseBase = `https://github.com/jiangliuhong/paseo-buddy/releases/download/${nativeReleaseTag}`;
export const nativeAssetName = (arch: string) => {
  if (!["arm64", "x64"].includes(arch)) throw new Error("Unsupported companion architecture");
  return `paseo-buddy-macos-${arch}`;
};
export async function releaseBytes(url: string, limit: number, signal: AbortSignal, request = fetch): Promise<Buffer> {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password || target.port ||
      !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(target.hostname)) {
      throw new Error("Untrusted native release redirect");
    }
    const response = await request(target.href, { signal, redirect: "manual", credentials: "omit" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid native release redirect");
      url = new URL(location, target).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(response.status === 404 ? "Native release is not published yet" : "Native release download failed");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error("Native release asset exceeds size limit");
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } finally { await reader.cancel(); reader.releaseLock(); }
  }
  throw new Error("Too many native release redirects");
}
