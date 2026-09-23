// DDF listings proxy — a Cloudflare Worker that sits between the For Lease page
// and CREA's DDF Web API. It keeps the feed credentials secret, caches results,
// and returns a small, clean JSON list the page can display.
//
// Routes
//   GET /listings            → { updated, count, listings: [...] } for the page
//   GET /explore?key=ADMIN   → raw sample records + field names, for setup only
//
// Settings (wrangler.toml [vars] or dashboard):
//   ALLOWED_ORIGINS  comma-separated sites allowed to call /listings
//   DDF_FILTER       optional extra OData $filter
//   MAX_LISTINGS     cap on listings returned (default 300)
//   CACHE_SECONDS    how long to reuse a result (default 3600)
// Secrets (npx wrangler secret put NAME):
//   DDF_CLIENT_ID, DDF_CLIENT_SECRET  — your DDF data-feed username and password
//   ADMIN_KEY                          — any long random string, protects /explore

const TOKEN_URL = "https://identity.crea.ca/connect/token";
const API = "https://ddfapi.realtor.ca/odata/v1";
const PAGE_SIZE = 100;

let token = null;   // { value, exp }
let memo = null;    // { body, at } — in-memory cache for this Worker instance

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req.headers.get("Origin"), env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET") return json({ error: "Only GET is supported" }, 405, cors);

    try {
      if (url.pathname === "/listings") return await listings(env, ctx, cors);
      if (url.pathname === "/explore") return await explore(url, env);
      return json({ error: "Not found. Try /listings" }, 404, cors);
    } catch (err) {
      return json({ error: err.message }, 502, cors);
    }
  },
};

// ---------- /listings ----------

async function listings(env, ctx, cors) {
  const ttl = Number(env.CACHE_SECONDS || 3600);
  if (memo && Date.now() - memo.at < ttl * 1000) return json(memo.body, 200, cors, ttl);

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request("https://ddf-cache.internal/listings-v1");
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.json();
      memo = { body, at: Date.parse(body.updated) || Date.now() };
      return json(body, 200, cors, ttl);
    }
  }

  const rows = await fetchProperties(env, Number(env.MAX_LISTINGS || 300));
  const offices = await fetchOffices(env, rows);
  const list = rows.map((p) => normalize(p, offices)).filter((l) => l.id);
  const body = { updated: new Date().toISOString(), count: list.length, listings: list };

  memo = { body, at: Date.now() };
  if (cache) {
    const stored = new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` },
    });
    ctx.waitUntil(cache.put(cacheKey, stored));
  }
  return json(body, 200, cors, ttl);
}

// ---------- /explore (setup helper) ----------

async function explore(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) {
    return json({ error: "Add ?key= with your ADMIN_KEY" }, 401, {});
  }
  const rows = await fetchProperties(env, PAGE_SIZE);
  const distinct = (field) => [...new Set(rows.map((r) => r[field]).filter((v) => v != null))].slice(0, 30);
  const trimmed = rows.slice(0, 2).map((r) => ({ ...r, Media: Array.isArray(r.Media) ? r.Media.slice(0, 2) : r.Media }));
  return json({
    message: "Setup view. Check the field names and values below, then compare with the page's cards.",
    listingsInFirstPage: rows.length,
    fieldNames: rows[0] ? Object.keys(rows[0]).sort() : [],
    valuesSeen: {
      PropertyType: distinct("PropertyType"),
      PropertySubType: distinct("PropertySubType"),
      LeaseAmountFrequency: distinct("LeaseAmountFrequency"),
      BuildingAreaUnits: distinct("BuildingAreaUnits"),
      City: distinct("City"),
    },
    sampleListings: trimmed,
    sampleAsThePageSeesIt: rows.slice(0, 2).map((p) => normalize(p, {})),
  }, 200, {});
}

// ---------- DDF calls ----------

async function getToken(env) {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  if (!env.DDF_CLIENT_ID || !env.DDF_CLIENT_SECRET) {
    throw new Error("DDF_CLIENT_ID and DDF_CLIENT_SECRET are not set. Add them with: npx wrangler secret put DDF_CLIENT_ID");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.DDF_CLIENT_ID,
      client_secret: env.DDF_CLIENT_SECRET,
      scope: "DDFApi_Read",
    }),
  });
  if (!res.ok) {
    throw new Error(`CREA rejected the login (HTTP ${res.status}). Check that DDF_CLIENT_ID and DDF_CLIENT_SECRET match your data feed's username and password.`);
  }
  const data = await res.json();
  token = { value: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return token.value;
}

async function ddfGet(env, url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${await getToken(env)}`, accept: "application/json" } });
  if (res.status === 401) token = null;
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`DDF request failed (HTTP ${res.status}): ${detail}`);
  }
  return res.json();
}

async function fetchProperties(env, max) {
  const params = new URLSearchParams({ $top: String(Math.min(PAGE_SIZE, max)) });
  if (env.DDF_FILTER) params.set("$filter", env.DDF_FILTER);
  let next = `${API}/Property?${params}`;
  const rows = [];
  while (next && rows.length < max) {
    const page = await ddfGet(env, next);
    rows.push(...(page.value || []));
    next = page["@odata.nextLink"] || null;
  }
  return rows.slice(0, max);
}

// Listing brokerage names are required on every listing by CREA's display rules.
async function fetchOffices(env, rows) {
  const keys = [...new Set(rows.filter((r) => !r.ListOfficeName && r.ListOfficeKey).map((r) => r.ListOfficeKey))];
  const names = {};
  for (let i = 0; i < keys.length; i += 15) {
    const chunk = keys.slice(i, i + 15);
    const filter = chunk.map((k) => `OfficeKey eq '${String(k).replace(/'/g, "''")}'`).join(" or ");
    try {
      const page = await ddfGet(env, `${API}/Office?${new URLSearchParams({ $filter: filter, $top: "100" })}`);
      for (const o of page.value || []) names[o.OfficeKey] = o.OfficeName;
    } catch {
      // Leave names empty; the page falls back to "see REALTOR.ca" for brokerage.
    }
  }
  return names;
}

// ---------- Mapping DDF fields → the page's listing shape ----------
// If /explore shows different field names for your feed, change them here.

function normalize(p, offices) {
  const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

  let sf = num(p.BuildingAreaTotal) ?? num(p.LeasableArea) ?? num(p.LivingArea);
  const units = String(p.BuildingAreaUnits || p.LeasableAreaUnits || "").toLowerCase();
  if (sf && /met|m2|m²/.test(units)) sf = Math.round(sf * 10.7639);

  const { psf, monthly } = leaseCost(num(p.LeaseAmount) ?? num(p.TotalActualRent) ?? num(p.ListPrice), p.LeaseAmountFrequency, sf);

  const media = (Array.isArray(p.Media) ? p.Media : [])
    .filter((m) => m && /^https:\/\//.test(m.MediaURL || ""))
    .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));

  const street = [p.UnitNumber && `Unit ${p.UnitNumber}`, [p.StreetNumber, p.StreetName, p.StreetSuffix].filter(Boolean).join(" ")]
    .filter(Boolean).join(" · ");
  const subtype = [p.PropertySubType, p.BusinessType].flat().filter(Boolean).join(", ");
  const type = category(`${subtype} ${p.PropertyType || ""} ${p.ZoningDescription || ""}`);

  return {
    id: p.ListingKey,
    mls: p.ListingId || null,
    type,
    subtype: subtype || p.PropertyType || null,
    title: `${subtype || type} for lease${p.City ? ` in ${p.City}` : ""}`,
    addr: p.UnparsedAddress || street || null,
    area: p.SubdivisionName || p.City || null,
    city: p.City || null,
    sf,
    psf,
    monthly,
    term: p.LeaseTerm || null,
    zoning: p.Zoning || null,
    remarks: p.PublicRemarks || null,
    lat: num(p.Latitude),
    lng: num(p.Longitude),
    photo: media[0]?.MediaURL || null,
    photos: media.slice(0, 12).map((m) => m.MediaURL),
    office: p.ListOfficeName || offices[p.ListOfficeKey] || null,
    url: /^https:\/\//.test(p.ListingURL || "") ? p.ListingURL : null,
    listed: p.OriginalEntryTimestamp || p.ListingContractDate || p.ModificationTimestamp || null,
    modified: p.ModificationTimestamp || null,
  };
}

// Lease prices arrive in different forms. Work out $/sq ft/yr and $/month where possible.
function leaseCost(amount, frequency, sf) {
  if (amount == null || amount <= 0) return { psf: null, monthly: null };
  const f = String(frequency || "").toLowerCase();
  let psf = null, monthly = null;
  if (/sq|square|sf|ft/.test(f)) psf = /month/.test(f) ? amount * 12 : amount;
  else if (/month/.test(f)) monthly = amount;
  else if (/annual|year/.test(f)) monthly = amount / 12;
  else if (amount < 200) psf = amount; // unlabelled small numbers are almost always $/sf/yr
  else monthly = amount;

  if (psf != null && monthly == null && sf) monthly = (psf * sf) / 12;
  if (monthly != null && psf == null && sf) psf = (monthly * 12) / sf;
  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  return { psf: round(psf), monthly: monthly == null ? null : Math.round(monthly) };
}

function category(text) {
  const t = text.toLowerCase();
  if (/restaurant|food|caf[eé]|bar\b|pub\b|hospitality/.test(t)) return "Restaurant";
  if (/industrial|warehouse|manufactur|storage|distribution/.test(t)) return "Industrial";
  if (/office|medical|professional/.test(t)) return "Office";
  if (/retail|store|shop|commercial mix|strip/.test(t)) return "Retail";
  if (/flex|showroom|mixed/.test(t)) return "Flex";
  return "Other";
}

// ---------- helpers ----------

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { "access-control-allow-methods": "GET, OPTIONS", vary: "Origin" };
  if (allowed.includes("*")) h["access-control-allow-origin"] = "*";
  else if (origin && allowed.includes(origin)) h["access-control-allow-origin"] = origin;
  return h;
}

function json(body, status, headers, maxAge = 0) {
  return new Response(JSON.stringify(body, null, status === 200 && !maxAge ? 2 : 0), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${Math.min(maxAge, 900)}` : "no-store",
      ...headers,
    },
  });
}

export { normalize, leaseCost, category };
