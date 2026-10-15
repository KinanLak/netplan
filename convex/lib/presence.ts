/** A user's avatar hue, the same on every page and for every viewer. */
export function colorHueFor(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}
