/** A schedule link the app will try: https:// or webcal:// (the server re-checks and fetches it). */
export function looksLikeFeedUrl(url: string): boolean {
  return /^(https|webcal):\/\/\S+$/i.test(url.trim());
}
