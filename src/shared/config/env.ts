/** Configuration injectée au build (clés : secrets GitHub en CI, .env.local en développement). */
export const env = {
  unsplashKey: (import.meta.env.VITE_UNSPLASH_ACCESS_KEY ?? '').trim(),
  pexelsKey: (import.meta.env.VITE_PEXELS_API_KEY ?? '').trim(),
  /** Manifeste des packs : mis à jour depuis le dépôt sans republier l'app. */
  packsUrl: 'https://raw.githubusercontent.com/Karelisio/Prisme/main/packs/packs.json',
  appUtm: 'utm_source=prisme&utm_medium=referral',
};
