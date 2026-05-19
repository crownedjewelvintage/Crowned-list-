# Crown List Backend

Express + SQLite backend for Crown List (employee dashboard) and Crowned Jewel Vintage (customer shop).

## Local development

```bash
npm install
npm run dev
```

Runs at http://localhost:5000.

## Production build

```bash
npm install
npm run build      # builds client + server into dist/
npm start          # runs dist/index.cjs
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `PORT` | `5000` | Port to listen on. |
| `NODE_ENV` | (empty) | Set to `production` in production. |
| `DB_PATH` | `data.db` | SQLite database location. Use a persistent disk in production (e.g. `/var/data/data.db`). |
| `UPLOAD_DIR` | `./uploads` | Where uploaded product photos are stored. Use a persistent disk in production. |
| `OPENAI_API_KEY` | (empty) | Optional. Enables the AI listing generator. |
| `JWT_SECRET` | (random) | JWT signing secret. Set this in production so tokens survive restarts. |

## Render deployment

1. Push this repo to GitHub
2. Render → New → Web Service → connect this repo
3. Settings:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
4. Add a **Disk** at mount path `/var/data`, size 1 GB
5. Add environment variables:
   - `DB_PATH=/var/data/data.db`
   - `UPLOAD_DIR=/var/data/uploads`
   - `JWT_SECRET=<generate a long random string>`
   - `OPENAI_API_KEY=...` (optional)
6. Deploy. First boot will seed the disk from the bundled `data.db` + `uploads/`.
7. Add custom domain (crownedlist.work) under Settings → Custom Domains.

## Test logins (in bundled data.db)

- **Operator (Crown List):** `aaron` / `testpass123`
- **Customer (Shop):** `customer@example.com` / `testpass123`
