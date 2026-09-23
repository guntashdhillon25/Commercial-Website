# HomeQuest Commercial: interactive prototype

`index.html` is a clickable, high-fidelity prototype of the HomeQuest commercial real estate site. It is one self-contained file (HTML, CSS and JS, no build step). Open it in a browser to try it. All listings are sample data.

## What's in it

| Screen | URL hash | Purpose |
|---|---|---|
| Home | `#home` | Search-first hero (Lease / Buy / Business), "Start with what you're planning" goal shortcuts, new listings, requirements call-to-action, FAQ |
| Search results | `#search`, `#lease`, `#buy`, `#businesses`, `#saved` | Location, lease/buy, type, budget and size up front; everything else under **More filters**. List or map view, removable filter chips, and suggestions for which filter to drop when nothing matches |
| Listing detail | `#listing-hq101` … `#listing-hq114` | Key facts, overview, cost calculator (lease, purchase or business), zoning in plain language, all details (progressively revealed), next steps, similar listings |
| Help me choose | `#guide` | The "I'm not sure" path: 3–4 questions about what the visitor is trying to do, then matching results with a short explanation |
| Landing pages | `#retail-lease-surrey`, `#area-langley`, `#businesses-richmond` … | One page for every property type, area, and type + area combination (about 120), each with its own heading, introduction, local guide, FAQ and related links |
| Guides | `#learn`, `#learn-lease-costs` … | 7 plain-language articles on leasing, costs, lease types, buying a business, zoning, cap rates and lease-or-buy |
| Glossary | `#glossary` | Every term used on the site, with examples |

Forms (in dialogs, bottom sheets on phones): **Ask about this property**, **Book a viewing**, **Request the full details** (NDA request for businesses), **Discuss your requirements**. They validate input and show a confirmation screen but don't send anything.

Terms such as additional rent, net vs. gross lease, cap rate, NOI, zoning, due diligence, financing, SDE, NDA, GST and property transfer tax are dotted-underlined wherever they appear. Tapping one opens a short plain-language explanation.

## Design decisions

- **Search comes first.** The hero is a search form, and each search starts with just four choices. Advanced criteria are under More filters, which is a side drawer on desktop and a bottom sheet on phones.
- **Monthly cost, not just $/sf/yr.** Lease cards and budgets use an estimated monthly total (base + additional rent), and the detail page shows the arithmetic.
- **Explained where it comes up.** One tip per results page, chosen for the current search (lease pricing, cap rate, NDA and so on) and dismissible. Glossary terms open inline.
- **Low-pressure calls to action.** Each listing has one primary action (Book a viewing, or Request details for businesses) and one secondary action (Ask). On phones these sit in a sticky bottom bar. An off-market "Discuss your requirements" prompt appears after the sixth result and on empty results.
- **Results layout:** listing cards sit beside a map. Numbered pins match numbered cards: hovering over one highlights the other, and tapping a pin scrolls to its card. On phones the map is behind a **Show map** button.
- **Mobile:** full-width listing cards, property type pills that scroll sideways, 44px+ touch targets, 16px inputs (so iOS doesn't zoom in), safe-area padding, and native selects so iPhone and Android show their own pickers.
- **Accessibility (WCAG 2.2 AA where practical):** semantic landmarks, a skip link, labelled controls, visible focus, `aria-pressed`/`aria-current` for selected states, native `<dialog>` focus handling, a live result count, focus moved to the page heading on navigation, and reduced-motion support.
- **Dark mode:** a full token set follows the system setting. The header toggle overrides it and is remembered.
- **Look:** follows the earlier *Space for Lease* prototype: Bricolage Grotesque headings with a highlighted key phrase, Public Sans body text, pill-shaped buttons and filters, labelled filter fields, property type pills, and illustrated listing tiles with three key facts per card. The site uses the Cobalt colour scheme.

## SEO

Every page has search-ready content and head tags. Use **SEO details for this page** in the top bar to see the Google preview, title and description lengths, the H1, the planned URL, headings and structured data for whatever page you're on.

**What's on each page type**

- **Home:** links to every property type and area page (with live counts), a regional market overview with a typical-price table, the latest guides, and an FAQ.
- **Area, type and type + area pages** (for example *Retail space for lease in Surrey, BC*):
  - a keyword-led H1, a short introduction and breadcrumbs
  - after the listings: an area overview, the main districts with descriptions, how to get around, and what to check before leasing or buying that type of property
  - a typical-price table, related guides, and an FAQ that mixes area, type and lease/buy questions
  - links to the same type in other areas, and to everything else in that area
- **Listing pages:** a factual summary sentence (size, type, area, zoning, price, monthly cost), an "About the area" section, breadcrumbs, and links up to the type + area page, the area page and the type page.
- **Guides and glossary:** articles with H2 sections, an FAQ, related listings and links to other guides.
- **Footer:** a "Popular searches" block that links to high-value landing pages.

**Head tags and structured data**

Each page sets its own title, meta description, canonical URL, robots tag and Open Graph tags, plus JSON-LD:

| Page | Schema.org types |
|---|---|
| Every page | `RealEstateAgent` (business name, phone, areas served) |
| Home | `WebSite` with `SearchAction`, `FAQPage` |
| Landing pages | `CollectionPage`, `ItemList` of listings, `BreadcrumbList`, `FAQPage` |
| Listing | `RealEstateListing` with `Offer` (lease or sale) and location, `BreadcrumbList` |
| Guide article | `Article`, `BreadcrumbList`, `FAQPage` |
| Glossary | `DefinedTermSet` |

Filtered searches (for example, with a budget or a feature filter) are set to `noindex, follow`, with a canonical URL pointing to the nearest landing page. This stops thousands of near-duplicate filter pages from competing with the landing pages.

**Planned URL structure**

| Prototype | Live site |
|---|---|
| `#lease`, `#buy`, `#businesses` | `/commercial-real-estate/for-lease/`, `/commercial-real-estate/for-sale/`, `/businesses-for-sale/` |
| `#retail-lease-surrey` | `/commercial-real-estate/for-lease/retail/surrey/` |
| `#area-langley` | `/commercial-real-estate/langley/` |
| `#listing-hq101` | `/listings/hq101-grocery-anchored-plaza-unit-surrey/` |
| `#learn-lease-costs`, `#glossary` | `/guides/lease-costs/`, `/guides/glossary/` |

**Important for the live site:** the prototype switches pages with `#` links inside one file. Search engines treat that as a single page. On myRealPage, each landing page, guide and listing needs to be its own page at the URLs above, with the content in the page itself (not loaded by script). Before launch, also:

- submit an XML sitemap
- set up a Google Business Profile with the same name, address and phone number
- replace the example price ranges with current figures, and add real listing photos with descriptive alt text

## Colours: Cobalt

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#F3F5F4` | `#0A1011` | Page background |
| `--surface` | `#FFFFFF` | `#121A1C` | Cards, header, forms |
| `--ink` | `#0D1719` | `#E7EEEC` | Text, selected pills |
| `--muted` | `#536062` | `#9AA8A6` | Secondary text |
| `--line` | `#D5DCDA` | `#253032` | Borders |
| `--accent` | `#1D44C4` | `#8EA6FF` | Buttons, links, call-to-action band, map highlight |
| `--accent-soft` | `#E3E9FB` | `#1B2447` | Tips, cost calculator background |
| `--mark` | `#D5DFFF` | `#24357A` | Highlighted words in headings |

The listing tiles use soft per-type tints (`--t-retail`, `--t-office` …), each with a dark-mode version. Replace the tiles with real listing photos when listings are connected.

## Rebuilding on myRealPage

myRealPage sites are built from pages, listing widgets and forms. Here's how each part of the prototype maps across:

1. **Global styles:** add the Google Fonts link (Bricolage Grotesque and Public Sans) to the site header code. Then paste the `:root` tokens and component CSS into the site's custom CSS, so buttons, pills, cards and forms match on every page.
2. **Home page:** use the hero copy and goal list as a custom HTML block. Point the hero search at your listing search page, with query parameters for transaction type and property type.
3. **Search results and listing details:** use myRealPage's MLS®/IDX listing search and detail templates, restyled with the tokens above. Where you can add custom content, include the monthly cost estimate, the plain-language zoning notes and the next-steps block. For the full filter and map experience with CREA DDF® data, reuse the existing `ddf-worker` (it already returns sf, $/sf and monthly figures) and embed this page's search script.
4. **Business listings:** these usually aren't on MLS®. Keep them as a small JSON list or as individual myRealPage pages, and show the area only until the buyer signs an NDA.
5. **Forms:** rebuild each dialog as a myRealPage lead form, tagged `ask`, `viewing`, `nda` or `requirements` so leads arrive already sorted in the lead inbox. Pass the listing ID in a hidden field.
6. **Help me choose:** a custom HTML page. The `GOALS` table in the script sets the mapping from goals to property types, so adjust it there.
7. **Before launch,** replace the placeholders: brokerage name, phone, email, advisor name and photo, the listing data, and the area list (`CITIES`).
