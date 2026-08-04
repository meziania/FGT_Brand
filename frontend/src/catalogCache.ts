const TTL_MS = 5 * 60 * 1000

type CacheEntry<T> = { at: number; data: T }

/** Lit une entrée du cache session et l'invalide si sa durée de vie est dépassée. */
function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (Date.now() - parsed.at > TTL_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

/** Écrit une valeur dans le cache session avec l'horodatage courant. */
function write<T>(key: string, data: T) {
  const entry: CacheEntry<T> = { at: Date.now(), data }
  sessionStorage.setItem(key, JSON.stringify(entry))
}

/** Fournit les accès cache utilisés par le catalogue FGT côté navigateur. */
export const catalogCache = {
  /** Récupère la liste des marques FGT mise en cache. */
  getBrands: <T>() => read<T>('fgt_catalog_brands'),
  /** Stocke la liste des marques FGT dans le cache session. */
  setBrands: <T>(data: T) => write('fgt_catalog_brands', data),
  /** Récupère les articles mis en cache pour une marque donnée. */
  getItems: <T>(brand: string) => read<T>(`fgt_catalog_items_${brand}`),
  /** Stocke les articles d'une marque dans le cache session. */
  setItems: <T>(brand: string, data: T) => write(`fgt_catalog_items_${brand}`, data),
  /** Supprime toutes les entrées de cache liées au catalogue FGT. */
  clear() {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith('fgt_catalog_')) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  },
}
