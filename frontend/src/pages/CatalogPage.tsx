import { useEffect, useState } from 'react'
import { api } from '../api'
import { AppShell } from '../AppShell'
import { catalogCache } from '../catalogCache'

type FgtBrand = { marque: string; sku_count: number; stock_total: number }
type FgtItem = {
  item_no: string
  description: string
  brand_code: string
  unit_price: number
  inventory: number
  customer_price?: number | null
}

type BrandsPayload = {
  data_source: string
  count: number
  brands: FgtBrand[]
}

/** Affiche le catalogue FGT avec cache session pour les marques et les articles. */
export function CatalogPage() {
  const [brands, setBrands] = useState<FgtBrand[]>([])
  const [items, setItems] = useState<FgtItem[]>([])
  const [selected, setSelected] = useState('')
  const [source, setSource] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  /** Charge les marques FGT depuis le cache ou l'API selon le besoin de rafraîchissement. */
  async function loadBrands(force = false) {
    setLoading(true)
    setError('')
    try {
      if (!force) {
        const cached = catalogCache.getBrands<BrandsPayload>()
        if (cached) {
          setBrands(cached.brands)
          setSource(cached.data_source)
          setFromCache(true)
          if (cached.brands[0] && !selected) setSelected(cached.brands[0].marque)
          setLoading(false)
          return
        }
      }
      const res = await api.fgtBrands(force)
      catalogCache.setBrands(res)
      setBrands(res.brands)
      setSource(res.data_source)
      setFromCache(false)
      if (res.brands[0] && !selected) setSelected(res.brands[0].marque)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur API')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBrands(false)
  }, [])

  useEffect(() => {
    if (!selected) return
    setError('')
    const cached = catalogCache.getItems<{ items: FgtItem[] }>(selected)
    if (cached) {
      setItems(cached.items)
      return
    }
    api
      .fgtItems(selected, 50)
      .then((res) => {
        catalogCache.setItems(selected, res)
        setItems(res.items)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur articles'))
  }, [selected])

  return (
    <AppShell
      title={
        <>
          <h1>
            Catalogue <span>API FGT</span>
          </h1>
          <p>
            Données réelles via <code>/api/articleList</code> · source: {source || '…'}
            {fromCache ? ' · cache 5 min' : ''}
          </p>
        </>
      }
    >
      <div className="row" style={{ marginBottom: '1rem' }}>
        <button className="btn ghost" type="button" onClick={() => loadBrands(true)}>
          Rafraîchir API
        </button>
      </div>

      {loading && <p>Chargement marques…</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>Marques ({brands.length})</h2>
        <div className="field">
          <label>Filtrer par marque</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {brands.map((b) => (
              <option key={b.marque} value={b.marque}>
                {b.marque} — {b.sku_count} SKU / stock {Math.round(b.stock_total)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel">
        <h2>Articles {selected ? `· ${selected}` : ''}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Prix</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.item_no}>
                <td>{i.item_no}</td>
                <td>{i.description}</td>
                <td>{i.unit_price.toFixed(2)}</td>
                <td>{Math.round(i.inventory)}</td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="muted">
                  Aucun article
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}
