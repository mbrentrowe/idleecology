Region Builder — Local proxy server

This small Express server proxies requests to the Flora API and the eBird API so
the region builder can fetch data without needing to run curl and paste results.

WARNING: This is intended for local development only. Do NOT expose this server
to the public internet without proper authentication and rate-limiting.

Setup

1. Install dependencies (from the `server/` directory):

```bash
cd server
npm install
```

2. Create a `.env` file (optional) to store API keys and a simple builder key:

```
FLORA_API_KEY=pk_...
EBIRD_API_TOKEN=your_ebird_token_here
BUILDER_PROXY_KEY=localsecret
PORT=3000
```

3. Start the server:

```bash
node server.js
```

Endpoints

- `POST /proxy/flora/search` — body JSON: `{ state: 'MO', limit: 30, native_only: true, key?: '...' }`
- `GET  /proxy/ebird/spplist?region=US-MO` — optional `key` query or `x-ebird-key` header
- `GET  /proxy/ebird/taxonomy?species=amecro,amerob` — optional `key`

If `BUILDER_PROXY_KEY` is set, send it to the server as `?key=...` or header `x-builder-key`.
