require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FLORA_KEY = process.env.FLORA_API_KEY || null;
const EBIRD_KEY = process.env.EBIRD_API_TOKEN || null;
const BUILDER_KEY = process.env.BUILDER_PROXY_KEY || null; // optional simple auth

function requireKey(req, res, next) {
  if (!BUILDER_KEY) return next();
  const key = req.headers['x-builder-key'] || req.query.key;
  if (key === BUILDER_KEY) return next();
  res.status(401).json({ error: 'Missing or invalid builder proxy key' });
}

// Proxy Flora search endpoint
app.post('/proxy/flora/search', requireKey, async (req, res) => {
  try {
    const { state, limit = 30, native_only = true, key: bodyKey } = req.body || {};
    const key = FLORA_KEY || bodyKey;
    if (!key) return res.status(400).json({ error: 'Flora API key required (set FLORA_API_KEY or include key in body)' });
    const q = `https://api.floraapi.com/v1/search?state=${encodeURIComponent(state || '')}&native_only=${native_only ? 'true' : 'false'}&limit=${encodeURIComponent(limit)}`;
    const r = await fetch(q, { headers: { Authorization: `Bearer ${key}` } });
    const data = await r.text();
    res.status(r.status).type('application/json').send(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

// Proxy eBird species list
app.get('/proxy/ebird/spplist', requireKey, async (req, res) => {
  try {
    const region = req.query.region;
    const key = EBIRD_KEY || req.query.key || req.headers['x-ebird-key'];
    if (!key) return res.status(400).json({ error: 'eBird API token required (set EBIRD_API_TOKEN or provide key)' });
    const q = `https://api.ebird.org/v2/product/spplist/${encodeURIComponent(region)}`;
    const r = await fetch(q, { headers: { 'X-eBirdApiToken': key } });
    const data = await r.text();
    res.status(r.status).type('application/json').send(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

// Proxy eBird taxonomy (batch)
app.get('/proxy/ebird/taxonomy', requireKey, async (req, res) => {
  try {
    const species = req.query.species; // comma-separated species codes
    const key = EBIRD_KEY || req.query.key || req.headers['x-ebird-key'];
    if (!key) return res.status(400).json({ error: 'eBird API token required (set EBIRD_API_TOKEN or provide key)' });
    const q = `https://api.ebird.org/v2/ref/taxonomy/ebird?species=${encodeURIComponent(species)}&fmt=json`;
    const r = await fetch(q, { headers: { 'X-eBirdApiToken': key } });
    const data = await r.text();
    res.status(r.status).type('application/json').send(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('Region Builder proxy server — local dev only'));

app.listen(PORT, () => console.log(`Region Builder proxy listening on http://localhost:${PORT}`));
