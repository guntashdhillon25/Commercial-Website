# HomeQuest Commercial: interactive prototype

`index.html` is a clickable, high-fidelity prototype of the HomeQuest commercial real estate site. It is one self-contained file (HTML, CSS and JS, no build step). Open it in a browser to try it. All listings are sample data.

## What's in it

| Screen | URL hash | Purpose |
|---|---|---|
| Home | `#home` | Search-first hero (Lease / Buy / Business), "Start with what you're planning" goal shortcuts, new listings, requirements call-to-action, FAQ |
| Search results | `#search`, `#lease`, `#buy`, `#businesses`, `#saved` | Location, lease/buy, type, budget and size up front; everything else under **More filters**. List or map view, removable filter chips, and suggestions for which filter to drop when nothing matches |
| Listing detail | `#listing-hq101` … `#listing-hq114` | Key facts, overview, cost calculator (lease, purchase or business), zoning in plain language, all details (progressively revealed), next steps, similar listings |
| Help me choose | `#guide` | The "I'm not sure" path: 3–4 questions about what the visitor is trying to do, then matching results with a short explanation |

Forms (in dialogs, bottom sheets on phones): **Ask about this property**, **Book a viewing**, **Request the full details** (NDA request for businesses), **Discuss your requirements**. They validate input and show a confirmation screen but don't send anything.

Terms such as additional rent, net vs. gross lease, cap rate, NOI, zoning, due diligence, financing, SDE, NDA, GST and property transfer tax are dotted-underlined wherever they appear. Tapping one opens a short plain-language explanation.

## Design decisions

- **Search comes first.** The hero is a search form, and each search starts with just four choices. Advanced criteria are under More filters, which is a side drawer on desktop and a bottom sheet on phones.
- **Monthly cost, not just $/sf/yr.** Lease cards and budgets use an estimated monthly total (base + additional rent), and the detail page shows the arithmetic.
- **Explained where it comes up.** One tip per results page, chosen for the current search (lease pricing, cap rate, NDA and so on) and dismissible. Glossary terms open inline.
- **Low-pressure calls to action.** Each listing has one primary action (Book a viewing, or Request details for businesses) and one secondary action (Ask). On phones these sit in a sticky bottom bar. An off-market "Discuss your requirements" prompt appears after the sixth result and on empty results.
- **Mobile:** compact horizontal listing cards, 44px+ touch targets, 16px inputs (so iOS doesn't zoom in), safe-area padding, and native selects so iPhone and Android show their own pickers.
- **Accessibility (WCAG 2.2 AA where practical):** semantic landmarks, a skip link, labelled controls, visible focus, `aria-pressed`/`aria-current` for selected states, native `<dialog>` focus handling, a live result count, focus moved to the page heading on navigation, and reduced-motion support.
- **Dark mode:** a full token set follows the system setting. The header toggle overrides it and is remembered.
- **Type:** Schibsted Grotesk (headings) and Hanken Grotesk (body), from Google Fonts.

## Rebuilding on myRealPage

myRealPage sites are built from pages, listing widgets and forms. Here's how each part of the prototype maps across:

1. **Global styles:** paste the `:root` tokens and component CSS into the site's custom CSS (Site Design → custom CSS/header code) so buttons, cards and forms match on every page.
2. **Home page:** use the hero copy and goal list as a custom HTML block. Point the hero search at your listing search page, with query parameters for transaction type and property type.
3. **Search results and listing details:** use myRealPage's MLS®/IDX listing search and detail templates, restyled with the tokens above. Where you can add custom content, include the monthly cost estimate, the plain-language zoning notes and the next-steps block. For the full filter and map experience with CREA DDF® data, reuse the existing `ddf-worker` (it already returns sf, $/sf and monthly figures) and embed this page's search script.
4. **Business listings:** these usually aren't on MLS®. Keep them as a small JSON list or as individual myRealPage pages, and show the area only until the buyer signs an NDA.
5. **Forms:** rebuild each dialog as a myRealPage lead form, tagged `ask`, `viewing`, `nda` or `requirements` so leads arrive already sorted in the lead inbox. Pass the listing ID in a hidden field.
6. **Help me choose:** a custom HTML page. The `GOALS` table in the script sets the mapping from goals to property types, so adjust it there.
7. **Before launch,** replace the placeholders: brokerage name, phone, email, advisor name and photo, the listing data, and the area list (`CITIES`).
