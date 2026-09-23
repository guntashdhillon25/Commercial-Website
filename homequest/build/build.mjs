#!/usr/bin/env node
// Builds the launch-ready HomeQuest site from the content in ../index.html.
//
//   node build/build.mjs
//
// Output
//   site/        a complete static site: one real page per URL, sitemap.xml, robots.txt
//   myrealpage/  the same pages as paste-in blocks for myRealPage, plus pages.csv
//                (URL, page title, meta description and H1 for each page's SEO settings)
//
// Business details (domain, phone, brokerage…) come from build/site.config.json.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/site.config.json'), 'utf8'));
const proto = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---------- content: read straight from the prototype so there is one source ---------- */
const dataSrc = proto.slice(proto.indexOf('/* ================= Data ================= */'), proto.indexOf('/* ================= Utilities ================= */'));
const C = vm.runInNewContext(dataSrc + ';({TYPES, CITIES, TERMS, AREAS, TYPE_SEO, LEASE_FAQ, SALE_FAQ, HOME_FAQ, MARKET, ARTICLES, REGION, GOALS})');
const {TYPES, CITIES, TERMS, AREAS, TYPE_SEO, LEASE_FAQ, SALE_FAQ, HOME_FAQ, MARKET, ARTICLES, REGION, GOALS} = C;
const protoCss = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'));

/* ---------- helpers ---------- */
const E = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const citySlug = c => c.toLowerCase().replace(/ /g, '-');
const CITY_BY_SLUG = Object.fromEntries(CITIES.map(c => [citySlug(c), c]));
const lower1 = s => s.charAt(0).toLowerCase() + s.slice(1);
const dealKey = d => d === 'lease' ? 'lease' : d === 'sale' ? 'sale' : null;
const telHref = 'tel:+1' + cfg.phone.replace(/\D/g, '');
const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Public+Sans:wght@400;500;600;700&display=swap';

const BASES = {lease:{deal:'lease', type:null}, buy:{deal:'sale', type:null}, businesses:{deal:'sale', type:'business'}};
['retail', 'office', 'industrial', 'restaurant'].forEach(t => BASES[t + '-lease'] = {deal:'lease', type:t});
['retail', 'office', 'industrial', 'investment', 'land'].forEach(t => BASES[t + '-buy'] = {deal:'sale', type:t});
const LEASE_BASES = ['retail-lease', 'office-lease', 'industrial-lease', 'restaurant-lease'];
const SALE_BASES = ['office-buy', 'industrial-buy', 'retail-buy', 'investment-buy', 'land-buy', 'businesses'];

function nounFor(ctx) {
  if (ctx.type === 'business') return 'Businesses for sale';
  const dk = dealKey(ctx.deal);
  if (ctx.type && dk && TYPE_SEO[ctx.type][dk]) return TYPE_SEO[ctx.type][dk].noun + (dk === 'lease' ? ' for lease' : ' for sale');
  if (ctx.type) return TYPES[ctx.type].long;
  return dk === 'lease' ? 'Commercial space for lease' : dk === 'sale' ? 'Commercial property for sale' : 'Commercial real estate';
}
const ctxOf = (base, city) => base === null ? {deal:'any', type:null, city} : {deal:BASES[base].deal, type:BASES[base].type, city};
const nounSlug = ctx => slugify(nounFor(ctx).replace('Commercial and industrial land', 'Commercial land').replace(/ and /g, ' '));
function landingPath(base, city) {
  const cs = city ? '-' + citySlug(city) : '';
  return base === null ? `/commercial-real-estate${cs}/` : `/${nounSlug(ctxOf(base, null))}${cs}/`;
}
const landingLabel = (base, city) => base === null ? `Commercial real estate in ${city}` : nounFor(ctxOf(base, null)) + (city ? ' in ' + city : '');
const GUIDES = '/commercial-real-estate-guides/', GLOSSARY = '/commercial-real-estate-glossary/', HELP = '/help-me-choose/', CONTACT = '/contact/';
const articlePath = a => `/${a.url}/`;

// prototype route names used inside content ({{route|text}}) → live URLs
function routePath(r) {
  if (r === 'guide') return HELP;
  if (r === 'learn') return GUIDES;
  if (r === 'glossary') return GLOSSARY;
  if (r.startsWith('learn-')) return articlePath(ARTICLES.find(a => a.slug === r.slice(6)));
  if (r.startsWith('area-')) return landingPath(null, CITY_BY_SLUG[r.slice(5)]);
  let city = null, base = r;
  for (const [s, c] of Object.entries(CITY_BY_SLUG)) if (r.endsWith('-' + s)) { city = c; base = r.slice(0, -(s.length + 1)); break; }
  if (!BASES[base]) throw new Error('Unknown route in content: ' + r);
  return landingPath(base, city);
}
const md = s => s.replace(/\[\[([\w-]+)\|([^\]]+)\]\]/g, (m, k, t) => `<a class="term" href="${GLOSSARY}#${k}">${t}</a>`)
  .replace(/\{\{([\w-]+)\|([^}]+)\}\}/g, (m, r, t) => `<a href="${routePath(r)}">${t}</a>`);
const plain = s => s.replace(/\[\[[\w-]+\|([^\]]+)\]\]/g, '$1').replace(/\{\{[\w-]+\|([^}]+)\}\}/g, '$1').replace(/<[^>]+>/g, '');
const para = p => p.startsWith('LIST:') ? `<ul class="ticks">${p.slice(5).split('|').map(x => `<li>${md(x)}</li>`).join('')}</ul>` : `<p>${md(p)}</p>`;
const term = (k, t) => `<a class="term" href="${GLOSSARY}#${k}">${t}</a>`;
function fitTitle(...candidates) { return candidates.find(t => t.length <= 60) || candidates[candidates.length - 1]; }
function clip(s, n = 158) { if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, c.lastIndexOf(' ')).replace(/[,:;]$/, '') + '…'; }

/* ---------- structured data ---------- */
const ORG_ID = cfg.domain + '/#org';
const ORG = {'@type':'RealEstateAgent', '@id':ORG_ID, name:cfg.businessName, url:cfg.domain + '/', telephone:'+1-' + cfg.phone, email:cfg.email,
  address:Object.assign({'@type':'PostalAddress', addressRegion:cfg.address.region, addressCountry:cfg.address.country},
    cfg.address.street ? {streetAddress:cfg.address.street} : {}, cfg.address.city ? {addressLocality:cfg.address.city} : {}, cfg.address.postalCode ? {postalCode:cfg.address.postalCode} : {}),
  areaServed:CITIES.map(c => ({'@type':'City', name:c + ', BC'}))};
const bcLD = items => ({'@type':'BreadcrumbList', itemListElement:items.map(([n, p], i) => ({'@type':'ListItem', position:i + 1, name:n, item:cfg.domain + p}))});
const faqLD = list => ({'@type':'FAQPage', mainEntity:list.map(([q, a]) => ({'@type':'Question', name:q, acceptedAnswer:{'@type':'Answer', text:plain(a)}}))});
const ldJSON = graph => JSON.stringify({'@context':'https://schema.org', '@graph':graph}, null, 1).replace(/<\//g, '<\\/');

/* ---------- shared blocks ---------- */
function crumbs(items) {
  return `<nav aria-label="Breadcrumb"><ol class="bc">${items.map(([n, p], i) => i === items.length - 1 ? `<li><span aria-current="page">${E(n)}</span></li>` : `<li><a href="${p}">${E(n)}</a></li>`).join('')}</ol></nav>`;
}
const faqHTML = list => `<div class="faq">${list.map(([q, a]) => `<details><summary>${q}</summary><div class="a"><p>${md(a)}</p></div></details>`).join('')}</div>`;
const faqSection = (title, list) => `<div class="faq2"><div class="shead"><span class="eyebrow">FAQ</span><h2>${title}</h2><p>Don’t see yours? <a href="${CONTACT}">Ask us directly.</a></p></div>${faqHTML(list)}</div>`;
const linkList = items => `<ul class="linkgrid">${items.map(([label, href]) => `<li><a href="${href}">${E(label)}</a></li>`).join('')}</ul>`;
function marketTable(hi) {
  return `<div class="tw"><table class="mk"><caption class="sr-only">Typical asking prices</caption>
    <thead><tr><th scope="col">Type</th><th scope="col">To lease, $/sf/yr (base + additional)</th><th scope="col">To buy</th></tr></thead>
    <tbody>${MARKET.map(r => `<tr${hi && r[0].toLowerCase().startsWith(hi) ? ' class="hi"' : ''}><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint">Typical asking ranges, updated ${new Date(cfg.lastUpdated).toLocaleDateString('en-CA', {month:'long', year:'numeric'})}. Every property is different; ask us for current comparables.</p>`;
}
function relatedArticles(ctx, n = 3) {
  const score = a => (a.rel.types && ctx.type && a.rel.types.includes(ctx.type) ? 3 : 0) + (a.rel.deal && a.rel.deal === ctx.deal ? 2 : 0) + (!a.rel.deal && !a.rel.types ? 1 : 0);
  return [...ARTICLES].sort((a, b) => score(b) - score(a)).slice(0, n);
}
const articleCard = a => `<a class="article-card" href="${articlePath(a)}"><span class="k">${a.cat}</span><h3>${a.title}</h3><p>${a.desc}</p><span class="m">${a.read} min read</span></a>`;
const cta = (h, p, label = 'Discuss your requirements') => `<div class="band"><div><h2>${h}</h2><p>${p}</p></div><div class="acts"><a class="btn btn-pri" href="${CONTACT}">${label}</a></div></div>`;

const NAV = [['lease', 'Space for lease', landingPath('lease')], ['buy', 'Property for sale', landingPath('buy')], ['businesses', 'Businesses for sale', landingPath('businesses')], ['help', 'Help me choose', HELP], ['guides', 'Guides', GUIDES]];
const ICON_MENU = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function siteHeader(cur) {
  const links = NAV.map(([k, t, h]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<header class="site-head"><div class="wrap head-row">
  <a class="logo" href="/"><span class="brand-mono" aria-hidden="true">${E(cfg.shortName.slice(0, 1))}${E((cfg.shortName.match(/[A-Z]/g) || ['', 'Q'])[1] || '')}</span><span><b>${E(cfg.shortName)}</b><small>${E(cfg.tagline)}</small></span></a>
  <nav class="main-nav" aria-label="Main">${links}</nav>
  <div class="head-tools">
    <a class="head-call num" href="${telHref}">${E(cfg.phone)}</a>
    <a class="btn btn-ink btn-sm" href="${CONTACT}">Talk to an advisor</a>
    <details class="m-menu"><summary aria-label="Menu">${ICON_MENU}</summary><nav aria-label="Menu">${links}<a href="${CONTACT}">Talk to an advisor</a><a href="${telHref}">Call ${E(cfg.phone)}</a></nav></details>
  </div></div></header>`;
}
function siteFooter() {
  const popular = [['retail-lease', 'Surrey'], ['office-lease', 'Vancouver'], ['industrial-lease', 'Langley'], ['restaurant-lease', 'Vancouver'], ['office-lease', 'Burnaby'], ['industrial-lease', 'Delta'], ['retail-lease', 'Langley'], ['office-buy', 'Surrey'], ['industrial-buy', 'Delta'], ['investment-buy', 'Abbotsford'], ['land-buy', 'Surrey'], ['businesses', 'Richmond']];
  return `<footer class="site-foot"><div class="wrap">
  <div class="foot-grid">
    <div><a class="logo" href="/"><span class="brand-mono" aria-hidden="true">HQ</span><span><b>${E(cfg.shortName)}</b><small>${E(cfg.tagline)}</small></span></a>
      <p style="margin-top:14px;max-width:38ch">Commercial leasing, property sales and business brokerage across ${REGION}.</p>
      <p style="margin-top:10px;color:var(--ink)"><a href="${telHref}" class="num">${E(cfg.phone)}</a><br><a href="mailto:${E(cfg.email)}">${E(cfg.email)}</a></p></div>
    <div><h2>Search</h2><ul>${[['Space for lease', landingPath('lease')], ['Property for sale', landingPath('buy')], ['Businesses for sale', landingPath('businesses')], ['Investment property', landingPath('investment-buy')], ['Help me choose', HELP]].map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
    <div><h2>Areas</h2><ul>${CITIES.map(c => `<li><a href="${landingPath(null, c)}">${c}</a></li>`).join('')}</ul></div>
    <div><h2>Guides</h2><ul>${ARTICLES.slice(0, 5).map(a => `<li><a href="${articlePath(a)}">${a.title.replace(/:.*$/, '')}</a></li>`).join('')}<li><a href="${GLOSSARY}">Glossary</a></li><li><a href="${GUIDES}">All guides</a></li></ul></div>
  </div>
  <div class="popular"><h2>Popular searches</h2><ul class="linkgrid">${popular.map(([b, c]) => `<li><a href="${landingPath(b, c)}">${landingLabel(b, c)}</a></li>`).join('')}</ul></div>
  <div class="legal">
    <p>${E(cfg.brokerage)}, independently owned and operated. Information is believed reliable but not guaranteed; confirm all details before relying on them.</p>
    <p>MLS®, REALTOR® and the associated logos are trademarks of The Canadian Real Estate Association. © ${new Date(cfg.lastUpdated).getFullYear()} ${E(cfg.businessName)}.</p>
  </div></div></footer>`;
}
const listingsSlot = (label, note = '') => `<section class="mrp-slot" aria-label="Current listings" data-slot="listings" data-filter="${E(label)}">
    <!-- myRealPage: place a listing search widget here, filtered to: ${E(label)} -->
    <h2 class="slot-h">Current listings</h2>
    <p>See every current listing in our <a href="${cfg.listingSearchUrl}">listing search</a>, or <a href="${CONTACT}">tell us what you need</a> and we’ll send matching properties, including ones that aren’t advertised.${note}</p>
  </section>`;

/* ---------- pages ---------- */
const pages = [];
const add = pg => pages.push(pg);
const ORG_REF = {'@id':ORG_ID};

const REGION_TEXT = `${cfg.shortName} covers commercial real estate across ${REGION}: shops and restaurants on busy high streets, offices near SkyTrain, warehouses near the port and highways, and businesses for sale. Rents and prices generally fall the further you go from Vancouver, while newer buildings and parking become easier to find.`;

// Home
(function home() {
  const map = {};
  for (const b of Object.keys(BASES)) { map[b + '|'] = landingPath(b); CITIES.forEach(c => map[b + '|' + c] = landingPath(b, c)); }
  const goalHref = {shop:'retail-lease', food:'restaurant-lease', office:'office-lease', goods:'industrial-lease', biz:'businesses', invest:'investment-buy', build:'land-buy'};
  const body = `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <h1>Commercial real estate for lease and sale in <span class="mark">Metro Vancouver</span></h1>
      <p class="hero-lede">Retail, office, industrial and restaurant space for lease, commercial property for sale and businesses for sale across ${REGION}. Every listing shows the estimated monthly cost, the zoning and what to check before you commit.</p>
    </div>
    <form class="search-card" id="hq-find" action="${landingPath('lease')}" data-map='${JSON.stringify(map)}'>
      <fieldset class="seg"><legend class="sr-only">What are you looking for?</legend>
        <label><input type="radio" name="mode" value="lease" checked><span>Lease space</span></label>
        <label><input type="radio" name="mode" value="sale"><span>Buy property</span></label>
        <label><input type="radio" name="mode" value="business"><span>Buy a business</span></label>
      </fieldset>
      <div class="field"><label for="hq-area">Area</label><span class="sel"><select id="hq-area"><option value="">All of ${REGION}</option>${CITIES.map(c => `<option>${c}</option>`).join('')}</select></span></div>
      <div class="field"><label for="hq-type">Property type</label><span class="sel"><select id="hq-type"><option value="">Any type</option>${['retail', 'office', 'industrial', 'restaurant', 'investment', 'land'].map(t => `<option value="${t}">${TYPES[t].long}</option>`).join('')}</select></span></div>
      <button class="btn btn-pri btn-block" type="submit">Show listings</button>
      <p class="search-foot">Not sure what you need? <a href="${HELP}">Start with what you’re planning</a></p>
    </form>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Start here</span><h2>What are you planning?</h2><p>Pick the closest match to see the property types that fit.</p></div></div>
    <div class="goals">${GOALS.map(g => `<a class="goal" href="${landingPath(goalHref[g.id])}"><b>${g.label}</b><span>${g.hint}</span></a>`).join('')}<a class="goal alt" href="${HELP}"><b>Something else</b><span>See every option side by side</span></a></div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Browse</span><h2>Browse commercial real estate</h2><p>Every property type and area has its own page, with local advice and typical prices.</p></div></div>
    <div class="browse">
      <div><h3>Space for lease</h3>${linkList(['lease', ...LEASE_BASES].map(b => [landingLabel(b), landingPath(b)]))}</div>
      <div><h3>Property and businesses for sale</h3>${linkList(['buy', ...SALE_BASES].map(b => [landingLabel(b), landingPath(b)]))}</div>
      <div><h3>By area</h3>${linkList(CITIES.map(c => [c, landingPath(null, c)]))}</div>
    </div>
  </div></section>

  <section class="section"><div class="wrap seo-grid">
    <div class="prose"><span class="eyebrow">Market</span><h2>Commercial real estate in ${REGION}</h2>
      <p>${REGION_TEXT}</p>
      <p>Most commercial space here is leased rather than bought. Rent is quoted ${term('psf', 'per square foot per year')}, usually on a ${term('net-lease', 'net lease')}, so we also show an estimated monthly total. If you’re buying, we show the down payment, ${term('ptt', 'property transfer tax')} and an estimated mortgage payment.</p>
      <p>Industrial space is in short supply across the region, and good retail units on busy streets lease quickly. If you have a specific need, tell us early so we can watch for space before it’s advertised.</p></div>
    <aside class="seo-side" aria-label="Typical prices"><h3>Typical asking prices</h3>${marketTable()}</aside>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Resources</span><h2>Guides for tenants, buyers and investors</h2></div><a class="btn btn-sec btn-sm" href="${GUIDES}">All guides</a></div>
    <div class="articles">${ARTICLES.slice(0, 6).map(articleCard).join('')}</div>
  </div></section>

  <section class="section"><div class="wrap">${cta('Tell us what you need. We’ll do the searching.', 'Many good spaces are leased or sold before they’re advertised. A 15-minute call is enough for us to shortlist options, including off-market ones. In most cases there’s no cost to tenants or buyers.')}</div></section>

  <section class="section"><div class="wrap"><div class="why">
    <div><h3>Real monthly costs</h3><p>Lease prices are shown as an estimated monthly total, including additional rent, so you can compare spaces against your budget.</p></div>
    <div><h3>Local knowledge</h3><p>We work across ${CITIES.length} cities, from Vancouver to Abbotsford, and know which areas suit which businesses.</p></div>
    <div><h3>One advisor, start to finish</h3><p>From the first viewing to signing, you deal with the same person, who knows the local market and the paperwork.</p></div>
  </div></div></section>

  <section class="section" id="faq"><div class="wrap">${faqSection('Common questions', HOME_FAQ)}</div></section>`;
  const script = `<script>document.getElementById('hq-find').addEventListener('submit',function(e){e.preventDefault();var f=this,m=JSON.parse(f.dataset.map),mode=f.querySelector('input[name=mode]:checked').value,t=f.querySelector('#hq-type').value,c=f.querySelector('#hq-area').value,d=mode==='lease'?'lease':'buy',b=mode==='business'?'businesses':(t?t+'-'+d:d);if(!m[b+'|'])b=d;location.href=m[b+'|'+c]||m[b+'|'];});</script>`;
  add({path:'/', file:'home', nav:'', title:'Commercial Real Estate, Metro Vancouver | HomeQuest',
    desc:`Commercial space for lease, property and businesses for sale in ${REGION}, with monthly costs and zoning on every listing.`,
    h1:'Commercial real estate for lease and sale in Metro Vancouver', body, script,
    schema:[{'@type':'WebSite', '@id':cfg.domain + '/#website', name:cfg.businessName, url:cfg.domain + '/', publisher:ORG_REF}, faqLD(HOME_FAQ)]});
})();


// Landing pages: every base × (all areas + each city), plus one page per city
function landingPage(base, city) {
  const ctx = ctxOf(base, city);
  const A = city ? AREAS[citySlug(city)] : null, T = ctx.type ? TYPE_SEO[ctx.type] : null, dk = dealKey(ctx.deal);
  const noun = base === null ? 'Commercial real estate' : nounFor(ctx);
  const where = city ? ` in ${city}` : '';
  const h1 = base === null ? `Commercial real estate in ${city}, BC` : `${noun}${city ? ` in ${city}, BC` : ` in ${REGION}`}`;
  const h1HTML = E(h1).replace(/((?:for (?:lease|sale) )?in [^<]+)$/, '<span class="mark">$1</span>');
  const path = landingPath(base, city);

  // intro
  const t = T && T[dk || (ctx.type === 'business' ? 'sale' : 'lease')];
  const intro = [t ? t.intro.replace(/\.$/, '') + (city ? ` in ${city}, BC.` : ` across ${REGION}.`) : dk ? `${dk === 'lease' ? 'Retail, office, industrial and restaurant space for lease' : 'Offices, warehouses, investment property, land and businesses for sale'}${city ? ` in ${city}, BC` : ` across ${REGION}`}.` : `Space for lease, property for sale and businesses for sale in ${city}, BC.`, A ? A.short : ''].filter(Boolean).join(' ');

  // breadcrumbs
  const items = [['Home', '/']];
  if (base === null) items.push([city, path]);
  else {
    const top = ctx.type === 'business' ? 'businesses' : dk === 'lease' ? 'lease' : 'buy';
    items.push([landingLabel(top), landingPath(top)]);
    if (ctx.type && ctx.type !== 'business') { if (city) items.push([city, landingPath(top, city)]); items.push([landingLabel(base, city), path]); }
    else if (city) items.push([city, path]);
    if (items[items.length - 1][1] !== path) items.push([landingLabel(base, city), path]);
  }
  // de-duplicate (e.g. "Space for lease" page itself)
  const seen = new Set(); const bc = items.filter(([, p]) => !seen.has(p) && seen.add(p));

  const tip = ctx.type === 'business' ? `Business names and exact locations stay private until you sign a short ${term('nda', 'confidentiality agreement')}. It’s free and doesn’t commit you to buy.`
    : ctx.type === 'investment' ? `Investment properties are compared by ${term('cap-rate', 'cap rate')}: yearly income as a percentage of the price.`
    : ctx.type === 'restaurant' ? `Spaces with a kitchen already built are called ${term('second-gen', 'second-generation')} restaurant space. They can save months of permits and build-out.`
    : dk === 'lease' ? `Landlords quote rent ${term('psf', 'per square foot per year')}, plus ${term('additional-rent', 'additional rent')}. Ask us for the estimated monthly total on any space.`
    : dk === 'sale' ? `Plan for a down payment of about 25–35% on commercial property. See ${term('financing', 'how financing works')}.` : '';

  // related links
  let related = '';
  if (base !== null) related += `<div><h3>${noun} in other areas</h3>${linkList(CITIES.filter(c => c !== city).map(c => [landingLabel(base, c), landingPath(base, c)]))}</div>`;
  if (city) related += `<div><h3>More in ${city}</h3>${linkList([...LEASE_BASES, ...SALE_BASES].filter(b => b !== base).map(b => [landingLabel(b, city), landingPath(b, city)]))}</div>`;
  if (!city && !ctx.type) related += `<div><h3>By property type</h3>${linkList((dk === 'sale' ? SALE_BASES : LEASE_BASES).map(b => [landingLabel(b), landingPath(b)]))}</div>`;
  if (base === null) related += `<div><h3>Other areas</h3>${linkList(CITIES.filter(c => c !== city).map(c => [`Commercial real estate in ${c}`, landingPath(null, c)]))}</div>`;

  const faqs = [...(A ? A.faq : []), ...(T ? T.faq : []), ...(dk === 'lease' ? LEASE_FAQ : dk === 'sale' && ctx.type !== 'business' ? SALE_FAQ : base === null ? [LEASE_FAQ[0], SALE_FAQ[0]] : [])].slice(0, 7);
  const aboutH = base === null ? `Commercial real estate in ${city}: what to know` : `${noun}${where}: what to know`;
  const eyebrow = city ? `${dk === 'sale' || ctx.type === 'business' ? 'Buying' : dk === 'lease' ? 'Leasing' : 'Commercial real estate'} in ${city}` : 'Guide';

  const body = `<div class="wrap">
    ${crumbs(bc)}
    <div class="s-hero">
      <div><h1>${h1HTML}</h1><p class="lede-seo">${E(intro)}</p></div>
      <div class="agent-card"><span class="ph" aria-hidden="true">HQ</span><p>Not seeing the right property? Many aren’t advertised. <a href="${CONTACT}">Tell us what you need →</a></p></div>
    </div>
    ${tip ? `<div class="note" role="note"><p>${tip}</p></div>` : ''}
    ${listingsSlot(landingLabel(base, city), ctx.type === 'business' ? ' Most businesses for sale aren’t on MLS®, so ask us for the current list.' : '')}
    <section class="seo" aria-labelledby="seo-h">
      <div class="seo-grid">
        <div class="prose">
          <span class="eyebrow">${eyebrow}</span>
          <h2 id="seo-h">${aboutH}</h2>
          ${A ? `<p>${A.intro}</p>` : ''}${T ? `<p>${T.about}</p>` : ''}${!A && !T ? `<p>${REGION_TEXT}</p>` : ''}
          ${A ? `<h3>Where to look in ${city}</h3><div class="districts">${A.districts.map(([n, d]) => `<div><b>${n}</b><span>${d}</span></div>`).join('')}</div><p class="hint">Getting around: ${A.access}</p>` : ''}
          ${T ? `<h3>What to check before you ${dk === 'sale' || ctx.type === 'business' ? 'buy' : 'lease'}</h3><ul class="ticks">${T.check.map(c => `<li>${c}</li>`).join('')}</ul>` : ''}
        </div>
        <aside class="seo-side" aria-label="Prices and guides">
          <h3>Typical asking prices</h3>${marketTable(ctx.type)}
          <h3>Guides</h3>
          <ul class="guide-links">${relatedArticles(ctx).map(a => `<li><a href="${articlePath(a)}">${a.title}</a><span>${a.read} min read</span></li>`).join('')}<li><a href="${GUIDES}">All guides</a></li></ul>
        </aside>
      </div>
      ${faqs.length ? faqSection(`Questions about ${lower1(noun)}${where}`, faqs) : ''}
      <div><div class="shead"><span class="eyebrow">Browse</span><h2>Related searches</h2></div><div class="related">${related}</div></div>
      ${cta(`Looking for ${lower1(noun.replace(/ for (lease|sale)$/, ''))}${where}?`, 'Tell us your size, budget and timing. We’ll send matching properties, including ones that haven’t been advertised yet.')}
    </section>
  </div>`;

  const place = city ? `${city}, BC` : REGION;
  const main = base === null ? `Commercial Real Estate in ${city}` : `${noun}${city ? ' in ' + city : ''}`;
  const title = fitTitle(`${main}${city ? ', BC' : ''} | ${cfg.shortName}`, `${main} | ${cfg.shortName}`, `${main}, BC`, main);
  const nl = lower1(noun);
  const desc = clip(base === null ? `Commercial space for lease, property for sale and businesses for sale in ${place}. Local areas, typical prices and advice from ${cfg.shortName}.`
    : ctx.type === 'business' ? `Businesses for sale in ${place}. Compare sales and owner cash flow, sign an NDA for full details, and talk to a local advisor.`
    : dk === 'lease' ? `Find ${nl} in ${place}. Compare monthly costs, zoning and locations, and book a viewing with a local ${cfg.shortName} advisor.`
    : `Browse ${nl} in ${place}. See typical prices, zoning and financing basics, and talk to a local ${cfg.shortName} advisor.`);
  add({path, file:path.replace(/\//g, '') || 'home', nav:ctx.type === 'business' ? 'businesses' : dk === 'lease' ? 'lease' : dk === 'sale' ? 'buy' : '', title, desc, h1, body,
    schema:[{'@type':'CollectionPage', name:h1, url:cfg.domain + path, description:desc, about:{'@type':'Place', name:place}, provider:ORG_REF}, bcLD(bc), ...(faqs.length ? [faqLD(faqs)] : [])]});
}
for (const b of Object.keys(BASES)) { landingPage(b, null); CITIES.forEach(c => landingPage(b, c)); }
CITIES.forEach(c => landingPage(null, c));

// Guides hub
(function guides() {
  const cats = [...new Set(ARTICLES.map(a => a.cat))];
  const bc = [['Home', '/'], ['Guides', GUIDES]];
  const body = `<div class="wrap article-hub">
    ${crumbs(bc)}
    <header class="page-head"><h1>Commercial real estate guides</h1><p class="lede-seo">Guides for tenants, buyers and investors in ${REGION}: costs, leases, zoning, financing and buying a business.</p></header>
    ${cats.map(c => `<section class="hub-sec"><h2>${c}</h2><div class="articles">${ARTICLES.filter(a => a.cat === c).map(articleCard).join('')}</div></section>`).join('')}
    <section class="hub-sec"><h2>Glossary</h2><div class="articles"><a class="article-card" href="${GLOSSARY}"><span class="k">Reference</span><h3>Commercial real estate glossary</h3><p>${Object.keys(TERMS).length} terms with examples, from additional rent to zoning.</p><span class="m">Reference</span></a></div></section>
    <div style="margin-bottom:56px">${cta('Rather talk it through?', 'Tell us what you’re planning and an advisor will explain your options in a 15-minute call.')}</div>
  </div>`;
  add({path:GUIDES, file:'commercial-real-estate-guides', nav:'guides', title:'Commercial Real Estate Guides for BC | HomeQuest',
    desc:'Guides to leasing, buying and investing in BC commercial real estate: lease costs, net vs. gross leases, zoning, cap rates and buying a business.',
    h1:'Commercial real estate guides', body, schema:[{'@type':'CollectionPage', name:'Commercial real estate guides', url:cfg.domain + GUIDES, hasPart:ARTICLES.map(a => ({'@type':'Article', headline:a.title, url:cfg.domain + articlePath(a)}))}, bcLD(bc)]});
})();

// Articles
for (const a of ARTICLES) {
  const p = articlePath(a), bc = [['Home', '/'], ['Guides', GUIDES], [a.title, p]];
  const more = ARTICLES.filter(x => x !== a).slice(0, 3);
  const links = a.rel.types ? [[landingLabel(a.rel.types[0] === 'business' ? 'businesses' : a.rel.types[0] + '-buy'), landingPath(a.rel.types[0] === 'business' ? 'businesses' : a.rel.types[0] + '-buy')]]
    : a.rel.deal === 'lease' ? LEASE_BASES.map(b => [landingLabel(b), landingPath(b)]) : [[landingLabel('lease'), landingPath('lease')], [landingLabel('buy'), landingPath('buy')]];
  const body = `<div class="wrap"><article class="article">
    ${crumbs(bc)}
    <header class="page-head"><span class="eyebrow">${a.cat}</span><h1>${a.title}</h1><p class="lede-seo">${a.desc}</p><p class="hint">${a.read} min read · Updated ${new Date(cfg.lastUpdated).toLocaleDateString('en-CA', {month:'long', year:'numeric'})} · ${E(cfg.businessName)}</p></header>
    <div class="prose">${a.body.map(([h, ps]) => `<h2>${h}</h2>${ps.map(para).join('')}`).join('')}</div>
    <section><h2>Browse listings</h2>${linkList(links)}</section>
    ${a.faq ? `<section><h2>Common questions</h2>${faqHTML(a.faq)}</section>` : ''}
    <div class="band inline"><div><h2>Have a question about your situation?</h2><p>An advisor can answer it, usually the same day.</p></div><div class="acts"><a class="btn btn-pri" href="${CONTACT}">Ask an advisor</a></div></div>
  </article>
  <section class="section"><div class="sec-head"><h2>More guides</h2><a class="btn btn-sec btn-sm" href="${GUIDES}">All guides</a></div><div class="articles">${more.map(articleCard).join('')}</div></section>
  </div>`;
  add({path:p, file:a.url, nav:'guides', og:'article', title:fitTitle(`${a.title} | ${cfg.shortName}`, a.title), desc:a.desc.length >= 110 ? a.desc : clip(`${a.desc} A practical guide for businesses in ${REGION}.`),
    h1:a.title, body, schema:[{'@type':'Article', headline:a.title, description:a.desc, datePublished:cfg.lastUpdated, dateModified:cfg.lastUpdated, author:ORG_REF, publisher:ORG_REF, mainEntityOfPage:cfg.domain + p}, bcLD(bc), ...(a.faq ? [faqLD(a.faq)] : [])]});
}

// Glossary
(function glossary() {
  const ks = Object.keys(TERMS).sort((a, b) => TERMS[a].t.localeCompare(TERMS[b].t));
  const bc = [['Home', '/'], ['Guides', GUIDES], ['Glossary', GLOSSARY]];
  const body = `<div class="wrap"><div class="article">
    ${crumbs(bc)}
    <header class="page-head"><h1>Commercial real estate glossary</h1><p class="lede-seo">The terms you’ll see on commercial listings and leases, with examples.</p></header>
    <dl class="gloss">${ks.map(k => `<div id="${k}"><dt>${TERMS[k].t}</dt><dd>${TERMS[k].b.map(p => `<p>${p}</p>`).join('')}${TERMS[k].ex ? `<p class="ex"><b>Example:</b> ${TERMS[k].ex}</p>` : ''}</dd></div>`).join('')}</dl>
    <div class="band inline"><div><h2>Still unsure what something means?</h2><p>Ask us. We’re happy to explain.</p></div><div class="acts"><a class="btn btn-pri" href="${CONTACT}">Ask an advisor</a></div></div>
  </div></div>`;
  add({path:GLOSSARY, file:'commercial-real-estate-glossary', nav:'guides', title:'Commercial Real Estate Glossary | HomeQuest',
    desc:'Additional rent, cap rate, net lease, zoning, SDE and other commercial real estate terms, defined with examples for tenants, buyers and investors in BC.',
    h1:'Commercial real estate glossary', body, schema:[{'@type':'DefinedTermSet', name:'Commercial real estate glossary', url:cfg.domain + GLOSSARY, hasDefinedTerm:ks.map(k => ({'@type':'DefinedTerm', name:TERMS[k].t, description:plain(TERMS[k].b[0]), url:cfg.domain + GLOSSARY + '#' + k}))}, bcLD(bc)]});
})();

// Help me choose (static version of the guided search)
(function help() {
  const links = {shop:['retail-lease', 'retail-buy'], food:['restaurant-lease', 'businesses'], office:['office-lease', 'office-buy'], goods:['industrial-lease', 'industrial-buy'], biz:['businesses'], invest:['investment-buy'], build:['land-buy']};
  const bc = [['Home', '/'], ['Help me choose', HELP]];
  const body = `<div class="wrap"><div class="article">
    ${crumbs(bc)}
    <header class="page-head"><h1>Not sure what kind of commercial property you need?</h1><p class="lede-seo">Start with what you’re planning. Each option shows the property types that fit, what to look for, and where to start.</p></header>
    <div class="help-list">${GOALS.map(g => `<section class="help-item" id="${g.id}"><h2>${g.label}</h2><p>${g.why}</p><p class="hint"><b>Good to know:</b> ${g.tip[1]} ${term(g.tip[0], 'Learn more')}.</p>${linkList(links[g.id].map(b => [landingLabel(b), landingPath(b)]))}</section>`).join('')}</div>
    <section><h2>Lease or buy?</h2><p>Most businesses start by leasing: it needs less cash upfront and makes it easier to move. Buying makes sense when you plan to stay a long time and can put down 25–35%. See <a href="${articlePath(ARTICLES.find(a => a.slug === 'lease-or-buy'))}">should your business lease or buy</a>.</p></section>
    ${cta('Still not sure?', 'Tell us what you’re planning. An advisor will suggest the right type of property, areas and budget in a 15-minute call.')}
  </div></div>`;
  add({path:HELP, file:'help-me-choose', nav:'help', title:'What Commercial Property Do I Need? | HomeQuest',
    desc:'Opening a shop, restaurant, office or warehouse, buying a business or investing? See which commercial property types fit your plans and where to start.',
    h1:'Not sure what kind of commercial property you need?', body, schema:[{'@type':'WebPage', name:'Help me choose', url:cfg.domain + HELP}, bcLD(bc)]});
})();

// Contact
(function contact() {
  const bc = [['Home', '/'], ['Contact', CONTACT]];
  const body = `<div class="wrap"><div class="article">
    ${crumbs(bc)}
    <header class="page-head"><h1>Talk to a commercial real estate advisor</h1><p class="lede-seo">Tell us what you’re looking for: the type of space, size, area, budget and timing. We’ll reply within one business day with options, including properties that aren’t advertised.</p></header>
    <div class="contact-grid">
      <section class="mrp-slot" data-slot="lead-form" aria-label="Contact form">
        <!-- myRealPage: place your lead form here (fields: name, email, phone, what you're looking for, area, budget, timing, message) -->
        <h2 class="slot-h">Send us your requirements</h2>
        <p>Call or email us and an advisor will get back to you the same business day.</p>
      </section>
      <aside class="contact-card"><h2>Contact</h2>
        <p><b>Phone</b><br><a href="${telHref}" class="num">${E(cfg.phone)}</a></p>
        <p><b>Email</b><br><a href="mailto:${E(cfg.email)}">${E(cfg.email)}</a></p>
        ${cfg.address.street ? `<p><b>Office</b><br>${E(cfg.address.street)}<br>${E(cfg.address.city)}, ${E(cfg.address.region)} ${E(cfg.address.postalCode)}</p>` : ''}
        <p><b>Areas we cover</b><br>${CITIES.map(c => `<a href="${landingPath(null, c)}">${c}</a>`).join(', ')}</p>
      </aside>
    </div>
  </div></div>`;
  add({path:CONTACT, file:'contact', nav:'', title:'Contact a Commercial Real Estate Advisor | HomeQuest',
    desc:`Looking for commercial space or a business in Metro Vancouver? Tell ${cfg.shortName} what you need and an advisor will reply within one business day.`,
    h1:'Talk to a commercial real estate advisor', body, schema:[{'@type':'ContactPage', name:'Contact', url:cfg.domain + CONTACT, about:ORG_REF}, bcLD(bc)]});
})();

/* ---------- CSS ---------- */
const EXTRA_CSS = `
.hq{background:var(--bg)}
.m-menu{display:none;position:relative}
.m-menu summary{list-style:none;display:grid;place-items:center;width:44px;height:44px;border-radius:8px;cursor:pointer}
.m-menu summary::-webkit-details-marker{display:none}
.m-menu summary:hover{background:var(--surface-2)}
.m-menu nav{position:absolute;right:0;top:calc(100% + 8px);background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:8px;display:grid;min-width:260px;z-index:40}
.m-menu nav a{display:flex;align-items:center;min-height:48px;padding:0 12px;border-radius:8px;color:var(--ink);text-decoration:none;font-weight:600}
.m-menu nav a:hover{background:var(--surface-2)}
.m-menu nav a[aria-current]{color:var(--accent)}
.head-call{color:var(--ink);text-decoration:none}
.head-call:hover{color:var(--accent)}
a.term{color:inherit}
.mrp-slot{border:1px solid var(--line);border-radius:14px;padding:20px 22px;background:var(--surface);margin-bottom:8px;display:grid;gap:8px}
.mrp-slot .slot-h{font-size:20px}
.mrp-slot p{color:var(--ink-2)}
.help-list{display:grid;gap:16px}
.help-item{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;display:grid;gap:10px}
.help-item h2{font-size:22px}
.help-item p{color:var(--ink-2)}
.contact-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px;align-items:start}
.contact-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;display:grid;gap:14px}
.contact-card h2{font-size:20px}
.article > section{display:grid;gap:12px}
.article > section > h2{font-size:24px}
@media (min-width:1081px){.hero h1{max-width:17ch;font-size:clamp(34px,4.4vw,54px)}}
@media (max-width:1080px){.m-menu{display:block}}
@media (max-width:760px){.contact-grid{grid-template-columns:minmax(0,1fr)}}
`;
// Prefix every selector with the scope class so the styles can't leak into a myRealPage theme.
function matchBrace(s, open) { let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) return i; } throw new Error('Unbalanced CSS'); }
function splitSel(sel) { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()).filter(Boolean); }
function scopeSel(x, scope) {
  if (x.startsWith(':root')) return x;
  if (x === 'html') return null;
  if (x === 'body') return scope;
  return `${scope} ${x}`;
}
function scopeCss(css, scope, light) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < css.length) {
    const ws = /^\s+/.exec(css.slice(i)); if (ws) { i += ws[0].length; continue; }
    const open = css.indexOf('{', i); if (open < 0) break;
    const head = css.slice(i, open).trim(), close = matchBrace(css, open), inner = css.slice(open + 1, close);
    i = close + 1;
    if (head.startsWith('@keyframes')) { out += `${head}{${inner}}`; continue; }
    if (head.startsWith('@media')) { if (light && /prefers-color-scheme:\s*dark/.test(head)) continue; const r = scopeCss(inner, scope, light); if (r) out += `${head}{${r}}`; continue; }
    if (light && /data-theme="dark"/.test(head)) continue;
    const sel = splitSel(head).map(x => scopeSel(x, scope)).filter(Boolean);
    if (sel.length) out += `${sel.join(',')}{${inner.trim()}}\n`;
  }
  return out;
}
const fullCss = protoCss + EXTRA_CSS;
const siteCss = scopeCss(fullCss, '.hq', false);
const mrpCss = scopeCss(fullCss, '.hq', true);

/* ---------- write: static site ---------- */
const SITE_DIR = path.join(ROOT, 'site'), MRP_DIR = path.join(ROOT, 'myrealpage');
fs.rmSync(SITE_DIR, {recursive:true, force:true}); fs.rmSync(MRP_DIR, {recursive:true, force:true});
fs.mkdirSync(path.join(SITE_DIR, 'assets'), {recursive:true}); fs.mkdirSync(path.join(MRP_DIR, 'pages'), {recursive:true});
fs.writeFileSync(path.join(SITE_DIR, 'assets/homequest.css'), siteCss);

function headTags(pg) {
  const url = cfg.domain + pg.path;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${E(pg.title)}</title>
<meta name="description" content="${E(pg.desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="${pg.og || 'website'}">
<meta property="og:site_name" content="${E(cfg.businessName)}">
<meta property="og:title" content="${E(pg.title)}">
<meta property="og:description" content="${E(pg.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="en_CA">${cfg.ogImage ? `\n<meta property="og:image" content="${E(cfg.ogImage)}">` : ''}
<meta name="twitter:card" content="${cfg.ogImage ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#1D44C4">`;
}
for (const pg of pages) {
  const html = `<!doctype html>
<html lang="en-CA">
<head>
${headTags(pg)}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/homequest.css">
<script type="application/ld+json">${ldJSON([ORG, ...pg.schema])}</script>
</head>
<body class="hq">
<a class="skip" href="#main">Skip to content</a>
${siteHeader(pg.nav)}
<main id="main">
${pg.body}
</main>
${siteFooter()}
${pg.script || ''}
</body>
</html>
`;
  const dir = path.join(SITE_DIR, pg.path);
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
fs.writeFileSync(path.join(SITE_DIR, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${cfg.domain}${p.path}</loc><lastmod>${cfg.lastUpdated}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(SITE_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${cfg.domain}/sitemap.xml\n`);

/* ---------- write: myRealPage pack ---------- */
fs.writeFileSync(path.join(MRP_DIR, 'site-header-code.html'), `<!-- Paste into myRealPage: site-wide header code (applies to every page) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${mrpCss}</style>
<script type="application/ld+json">${ldJSON([ORG])}</script>
`);
fs.writeFileSync(path.join(MRP_DIR, 'site-menu-and-footer.html'), `<!-- Optional: use these if your myRealPage theme lets you replace the header and footer -->
<div class="hq">
${siteHeader('')}
</div>

<div class="hq">
${siteFooter()}
</div>
`);
const csvCell = v => `"${String(v).replace(/"/g, '""')}"`;
const rows = [['url_path', 'page_title', 'meta_description', 'h1', 'content_file'].join(',')];
for (const pg of pages) {
  const file = `pages/${pg.file}.html`;
  fs.writeFileSync(path.join(MRP_DIR, file), `<!--
  Page URL:          ${pg.path}
  Page title (SEO):  ${pg.title}
  Meta description:  ${pg.desc}
  Paste everything below into this page's HTML block.
-->
<script type="application/ld+json">${ldJSON(pg.schema)}</script>
<div class="hq">
${pg.body}
</div>
${pg.script || ''}
`);
  rows.push([pg.path, pg.title, pg.desc, pg.h1, file].map(csvCell).join(','));
}
fs.writeFileSync(path.join(MRP_DIR, 'pages.csv'), rows.join('\n') + '\n');

/* ---------- SEO audit ---------- */
const problems = [];
const paths = new Set(pages.map(p => p.path));
const glossaryIds = new Set(Object.keys(TERMS));
const dupes = (key) => { const m = new Map(); pages.forEach(p => m.set(p[key], (m.get(p[key]) || 0) + 1)); return [...m].filter(([, n]) => n > 1); };
dupes('title').forEach(([t]) => problems.push(`Duplicate title: ${t}`));
dupes('desc').forEach(([t]) => problems.push(`Duplicate description: ${t}`));
let words = 0, minWords = Infinity, minPage = '';
for (const pg of pages) {
  if (pg.title.length > 60) problems.push(`Title over 60 characters (${pg.title.length}): ${pg.path}`);
  if (pg.desc.length < 70 || pg.desc.length > 160) problems.push(`Description length ${pg.desc.length}: ${pg.path}`);
  const h1s = (pg.body.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) problems.push(`${h1s} H1 headings: ${pg.path}`);
  for (const [, href] of pg.body.matchAll(/href="([^"]+)"/g)) {
    if (!href.startsWith('/') || href === cfg.listingSearchUrl) continue;
    const [p, frag] = href.split('#');
    if (!paths.has(p)) problems.push(`Broken link ${href} on ${pg.path}`);
    else if (frag && p === GLOSSARY && !glossaryIds.has(frag)) problems.push(`Missing glossary term #${frag} on ${pg.path}`);
  }
  const w = pg.body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  words += w; if (w < minWords) { minWords = w; minPage = pg.path; }
}
const placeholders = [];
if (/example/.test(cfg.domain)) placeholders.push('domain');
if (/555/.test(cfg.phone)) placeholders.push('phone');
if (/example/.test(cfg.email)) placeholders.push('email');
if (/\[/.test(cfg.brokerage)) placeholders.push('brokerage');
if (!cfg.address.street) placeholders.push('address');
if (cfg.listingSearchUrl === '/search/') placeholders.push('listingSearchUrl (your myRealPage listing search page)');
if (!cfg.ogImage) placeholders.push('ogImage (optional, a 1200×630 image for link previews)');

const report = [
  `# SEO audit`, '',
  `Built ${pages.length} pages (${pages.filter(p => p.schema[0]['@type'] === 'CollectionPage' && p.path !== GUIDES).length} landing pages, ${ARTICLES.length} guides, glossary, help, contact, home).`,
  `Average ${Math.round(words / pages.length)} words of content per page; the shortest is ${minPage} with ${minWords}.`, '',
  problems.length ? `## Problems (${problems.length})\n\n${problems.map(p => '- ' + p).join('\n')}` : '## Problems\n\nNone: every page has a unique title (60 characters or fewer) and description (70–160), exactly one H1, and all internal links resolve.', '',
  placeholders.length ? `## Fill in before launch (build/site.config.json)\n\n${placeholders.map(p => '- ' + p).join('\n')}` : '## Fill in before launch\n\nNothing: all business details are set.', ''
].join('\n');
fs.writeFileSync(path.join(ROOT, 'build/SEO-AUDIT.md'), report);
console.log(report);
