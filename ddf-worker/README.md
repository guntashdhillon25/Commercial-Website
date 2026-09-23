# DDF listings Worker

A small Cloudflare Worker that connects the For Lease page to your CREA DDF® data feed.
It keeps your feed username and password secret, asks CREA for listings, and returns a
clean list the page can display.

Step-by-step setup instructions: `guides/ddf-setup.html` (open it in a browser).

- `GET /listings` is what the page reads.
- `GET /explore?key=YOUR_ADMIN_KEY` is a setup view that shows the raw field names and sample listings.

Field mapping lives in `normalize()` in `src/worker.js`. Change it there if your feed uses different field names.
