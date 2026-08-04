# FGT Launch Control Tower

Pilotage Stage-Gate des nouvelles marques + données API FGT.

## Structure du projet

```
fgt-launch-tower/
├── backend-nest/   NestJS + TypeORM + SQLite + JWT  (API officielle)
├── frontend/       React + TypeScript + Vite
└── README.md
```

## Stack

- **Backend:** NestJS / TypeScript / TypeORM / SQLite
- **Frontend:** React / TypeScript / Vite
- **API data:** `POST http://192.168.1.125:7691/api/articleList`

## Démarrer

```powershell
# Terminal 1 — API (port 8001)
cd backend-nest
npm install
npm run start:dev

# Terminal 2 — UI (port 5173 → proxy /api vers 8001)
cd frontend
npm install
npm run dev
```

- App: http://127.0.0.1:5173  
- API: http://127.0.0.1:8001  

## Comptes démo

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| `dev@fgt.local` | `fgt123` | Développement |
| `direction@fgt.local` | `fgt123` | Direction |
| `commercial@fgt.local` | `fgt123` | Commercial |

## Fonctionnalités

- Auth JWT + rôles
- Control Tower (sync marques API, alertes stock)
- Stage-Gate G0→G7 + checklists + EXIT/MATURITY
- Plans d’actions (owner, SLA, livrable, clôture)
- Health Score (manuel ou depuis stock API)
- Routines Lundi / Vendredi
- Catalogue articles API (cache 5 min)

## Note API

`articleList` fournit articles / marques / stock / prix.  
CA, forecast, DN, réachat ne sont pas dans cette API → Health Score les met à 70 (ajustables) ; disponibilité / stock / marge viennent de l’API.

## Déploiement Railway

Le dépôt est un **monorepo**. Railway doit builder **uniquement** `backend-nest/` :

1. Service Settings → **Root Directory** = `backend-nest`
2. Builder = Dockerfile (fichier fourni)
3. Variables :
   - `JWT_SECRET` = secret fort
   - `DATA_SOURCE` = `mock` (recommandé hors réseau FGT) **ou** `api` si l’API FGT est joignable
   - `FGT_API_BASE_URL` / `FGT_CUSTOMER_NO` / `FGT_TYPE_DOC` si `DATA_SOURCE=api`
4. Exposer le service (Generate Domain)

**Limites :**
- SQLite = données **éphémères** sur Railway (pas de volume → reset au redeploy)
- L’API FGT `192.168.1.xxx` n’est **pas** accessible depuis Railway (cloud US) → utiliser `DATA_SOURCE=mock` pour une démo publique, ou déployer en local / VPN

Frontend : déployer à part (Vercel ou 2ᵉ service Railway avec Root Directory = `frontend`).
