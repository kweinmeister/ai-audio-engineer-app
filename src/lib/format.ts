/** Format a duration in seconds as `m:ss`. */
export function formatSecs(val: number): string {
  const totalSecs = Number.isFinite(val) && val > 0 ? val : 0;
  const mins = Math.floor(totalSecs / 60);
  const secs = Math.floor(totalSecs % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/** Format a byte count as a human readable size (Bytes, KB, or MB). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
