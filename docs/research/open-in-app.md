# What can we actually open in-app?

Research ticket: [nspage/acadPap-proj#7](https://github.com/nspage/acadPap-proj/issues/7).  
Primary sources only. Counts below were measured against the live OpenAlex Works API on 2026-08-16 (default corpus; expansion works excluded unless noted). They are snapshots, not a product SLA.

## How this app currently resolves a readable file

The in-app reader does **not** fetch a publisher PDF. It fetches OpenAlex-hosted GROBID TEI XML and renders sections.

1. **Discovery filter.** The feed requests English, OA, “has fulltext” works:

```21:22:src/services/adapters/openalex.ts
  // We want to fetch papers with full text available, OA, and exclusively in English.
  let filterQuery = `&filter=has_fulltext:true,is_oa:true,language:en`;
```

2. **PDF URL is stored but unused by the reader.** The adapter still copies `primary_location.pdf_url`, then `open_access.oa_url`, and rewrites `arxiv.org/pdf` → `export.arxiv.org/pdf` ([`src/services/adapters/openalex.ts:62-73`](src/services/adapters/openalex.ts)). `pdfUrl` is never read by `ReaderModeView`.

3. **In-app vs publisher tab.** `hasContent` is `has_content.grobid_xml || has_content.pdf` ([`src/services/adapters/openalex.ts:95`](src/services/adapters/openalex.ts)). Save/open then:

```101:110:src/App.tsx
  const handleSavePaper = async (paper: PaperCard) => {
    try {
      await db.savedPapers.put(paper);
      if (paper.hasContent) {
        // Open in-app reader for papers with hosted fulltext
        setSelectedReaderPaper(paper);
      } else {
        // Open publisher page for papers without hosted content
        window.open(paper.url, '_blank', 'noopener,noreferrer');
      }
```

The journal “Open Reader” button uses the same flag ([`src/components/journal/JournalView.tsx:146-163`](src/components/journal/JournalView.tsx)).

4. **Actual full-text fetch.** Reader mode calls `fetchStructuredContent(paper.id)` ([`src/components/reader/ReaderModeView.tsx:22-36`](src/components/reader/ReaderModeView.tsx)), which hits `https://content.openalex.org/works/{W…}.grobid-xml?api_key=…` from the **browser**, gunzips the body with `DecompressionStream('gzip')`, parses TEI with `DOMParser`, and caches XML in IndexedDB ([`src/services/openalex-content.ts:20-58`](src/services/openalex-content.ts)). If the response is not OK, XML is short, or no `<p>` sections parse, the UI says “Structured content unavailable” and links the publisher landing page ([`src/components/reader/ReaderModeView.tsx:204-221`](src/components/reader/ReaderModeView.tsx)).

5. **`/api/proxy` is dead on the current reader path.** `cachePaperPdf` / `getCachedPaperPdf` ([`src/lib/db.ts:75-94`](src/lib/db.ts)) and `fetchWithCORSProxy` ([`src/lib/proxy.ts`](src/lib/proxy.ts)) have **no callers** in `src/`. `pdfjs-dist` / `react-pdf` were removed from `package.json` in `7eca805`. Production proxy still exists as a Cloudflare Pages Function (`onRequest` in [`functions/api/proxy.ts`](functions/api/proxy.ts)); Vite dev middleware still implements `/api/proxy` ([`vite.config.ts:22-66`](vite.config.ts)). There is no `vercel.json` / `wrangler.toml` in the repo.

6. **Unpaywall is not called.** `src/services/unpaywall.ts` existed in `e8210c5` (`GET https://api.unpaywall.org/v2/{doi}?email=…`, using `best_oa_location.url_for_pdf`) and was **deleted** in `7eca805`. A repo-wide search of current `*.ts` / `*.tsx` finds no Unpaywall URL. [`reader_development_report.md`](reader_development_report.md) (dated 2026-08-16) still claims Unpaywall is live; that report is stale relative to HEAD.

7. **Spec drift.** [`agy_spec.md`](agy_spec.md) still describes a PDF.js reader that streams via `/api/proxy` and caches blobs. That is the *previous* architecture, not HEAD.

## What OpenAlex guarantees vs what it only hints at

All field definitions below are from the official attributes / OA / fulltext pages.

| Field | What the owner says it is | What it is **not** |
| --- | --- | --- |
| `open_access.is_oa` | True if a URL exists where you can read full text without paying or logging in ([OA docs](https://help.openalex.org/data/works/open-access/)). ~121M / 322M works globally in that page’s prose; live API `is_oa:true` on 2026-08-16 was **123,672,025**. | Not a PDF. Not a license. Not “OpenAlex will give you the bytes.” |
| `open_access.oa_url` | “The best OA URL (closest to the version of record); **may be a PDF or a landing page**” ([attributes](https://help.openalex.org/data/works/attributes/)). Same as the URL of `best_oa_location`. | Not a fetchable PDF. |
| `primary_location.pdf_url` / `locations[].pdf_url` | “A direct link to a full-text PDF of this copy, or null when only a landing page is known” ([locations](https://help.openalex.org/data/locations/)). | **Not** the OpenAlex content-archive object. Official warning: do **not** map work IDs to archive files via `locations[].pdf_url` — that is the original publisher URL ([fulltext](https://help.openalex.org/access/fulltext/)). |
| `has_pdf_url` | Filterable convenience flag on works ([works overview](https://help.openalex.org/api-reference/works)). Live English OA count: **45,542,044**. | Still a *publisher/repo* PDF hint, not `content.openalex.org`. |
| `has_content.pdf` / `has_content.grobid_xml` | Whether OpenAlex’s content archive has that format. Docs: 50M+ PDFs, ~43M TEI XML; “a work may have a PDF but no XML (GROBID can’t parse every PDF)” ([fulltext](https://help.openalex.org/access/fulltext/)). Live: **54,999,764** `has_content.pdf:true`, **41,621,035** `has_content.grobid_xml:true`. | `has_content.pdf` is the cached file, not a guarantee the publisher URL still 200s. GROBID XML is a *parse*, not a faithful PDF. |
| `content_urls.{pdf,grobid_xml}` | API-only URLs under `content.openalex.org`. Fetching requires an API key and is billed as a content download ([fulltext](https://help.openalex.org/access/fulltext/), [attributes](https://help.openalex.org/data/works/attributes/)). | Not in the snapshot. |
| `has_fulltext` | Attributes page: “true if any downloadable full-text format exists (i.e. either `has_content.pdf` or `has_content.grobid_xml`)” ([attributes](https://help.openalex.org/data/works/attributes/)). Replaced the removed `has_ngrams` filter ([deprecations](https://help.openalex.org/api/deprecations/)). | **Live API does not match that definition.** See counts below. |
| `language` | Language of **title/abstract metadata**, ISO 639-1, via `langdetect`. “Not necessarily the full text,” unset when there aren’t enough words ([attributes](https://help.openalex.org/data/works/attributes/)). | Not a full-text language guarantee. |

`is_oa` also excludes ResearchGate (login / publishing-agreement) and CAPTCHA-gated hosts such as SSRN ([OA docs](https://help.openalex.org/data/works/open-access/)).

### Measured English OA funnel (2026-08-16, default corpus)

Queried as `GET https://api.openalex.org/works?filter=…&per_page=1` (list+filter). `meta.count`:

| Filter | Count | Share of English OA (82,806,613) |
| --- | ---: | ---: |
| `language:en` | 221,037,818 | — |
| `language:en,is_oa:true` | 82,806,613 | 100% |
| `language:en,is_oa:true,has_pdf_url:true` | 45,542,044 | 55.0% |
| `language:en,is_oa:true,has_content.pdf:true` | 40,365,297 | 48.7% |
| `language:en,is_oa:true,has_fulltext:true` (**this app’s feed**) | 34,539,775 | 41.7% |
| `language:en,is_oa:true,has_content.grobid_xml:true` (**what the reader fetches**) | 30,467,766 | 36.8% |
| `language:en,is_oa:true,has_fulltext:true,has_content.grobid_xml:true` | 27,522,599 | 33.2% of EN OA; **79.7% of the feed** |
| `language:en,is_oa:true,has_fulltext:true,has_content.grobid_xml:false` | 7,017,176 | **20.3% of the feed** has no GROBID XML |
| `language:en,is_oa:true,has_content.grobid_xml:true,best_oa_location.license:cc-by` | 9,230,520 | 11.1% of EN OA |

English OA by `oa_status` (same query, `group_by=open_access.oa_status`): green 39,584,431; gold 12,947,757; bronze 12,526,353; diamond 10,845,850; hybrid 6,902,222.

Among English OA with GROBID XML: bronze 8,894,249; gold 6,870,104; diamond 6,610,163; green 4,966,134; hybrid 3,127,116. Bronze is the largest GROBID slice even though green is the largest OA slice — repository copies are often not in the content archive.

**Documented vs live `has_fulltext`:** the attributes page says `has_fulltext ≡ has_content.pdf ∨ has_content.grobid_xml`. The live API disagrees:

- `language:en,is_oa:true,has_content.pdf:true,has_fulltext:false` → **7,973,570**
- `language:en,is_oa:true,has_content.grobid_xml:true,has_fulltext:false` → **2,945,167**
- Example work `W2889646458` returned `has_fulltext: false` with `has_content: {pdf: true, grobid_xml: false}` and a `content_urls.pdf`. The same query’s OQL labeled `has_content.pdf` as “PDF-linked”.

So a coverage percentage that treats `has_fulltext` as “OpenAlex will serve bytes” is not licensed by the owner’s own API. This app’s feed uses `has_fulltext`; the reader uses `grobid-xml`. Those sets overlap but are not equal.

### What “open in-app” means *for this codebase*

The only in-app body is GROBID TEI. OpenAlex’s own quality note: GROBID “can’t parse every PDF,” does no OCR, and “a meaningful share of files will contain errors” (missing/duplicated references, truncated sections, bad headers). They tell consumers to filter `has_content.grobid_xml:true` and to treat XML as GROBID’s output unchanged ([fulltext](https://help.openalex.org/access/fulltext/)). They do **not** publish a “readable section” success rate. This research therefore **cannot** honestly quote a single “reliably readable” percentage. The documented upper bound for *this* reader is “works with `has_content.grobid_xml:true`,” measured at **30.5M English OA** (36.8% of English OA; 13.8% of English works).

## What Unpaywall adds if used

- **Not used at HEAD.** See above.
- **Same pipeline as OpenAlex OA.** Since the Walden rewrite, Unpaywall “is not a separate database”; records are a legacy-compatible format over OpenAlex. Official recommendation: new projects should use the OpenAlex API ([Unpaywall product page on OpenAlex](https://help.openalex.org/access/unpaywall/)).
- **If reintroduced**, official Unpaywall REST API ([source of [unpaywall.org/products/api](https://unpaywall.org/products/api)](https://github.com/ourresearch/unpaywall-website/blob/master/src/views/products/Api.vue)):
  - `GET /v2/:doi?email=YOUR_EMAIL` (email is required).
  - **100,000 calls per day**; larger jobs should use the snapshot.
  - Crossref DOIs only; DataCite DOIs 404. Invalid / other-agency DOIs 404 ([OpenAlex Unpaywall page](https://help.openalex.org/access/unpaywall/)).
- **`best_oa_location.url_for_pdf` is nullable.** Official data format: `url_for_pdf` is `String|null` (“the URL with a PDF version”); `url` falls back to the landing page when there is no PDF ([DataFormat.vue](https://github.com/ourresearch/unpaywall-website/blob/master/src/views/DataFormat.vue)). `is_oa` is just `best_oa_location != null`. Publisher `url_for_landing_page` “usually includes HTML fulltext” — i.e. an HTML page, not a PDF stream. Official sample in that repo’s `api_responses.md` includes a bronze Cell paper (`10.1016/j.cell.2007.11.019`) with `is_oa: true` and `best_oa_location.url_for_pdf: null`.
- **Legal posture (Unpaywall).** FAQ: they harvest “legal sources” (repositories + publisher OA); they remove copyright-violating copies on notice ([Faq.vue](https://github.com/ourresearch/unpaywall-website/blob/master/src/views/Faq.vue)). Terms: a limited, revocable license to *identify and locate* publicly available publications via the Database/Data — not a license to the PDFs themselves ([TermsOfService.vue](https://github.com/ourresearch/unpaywall-website/blob/master/src/views/legal/TermsOfService.vue)).
- **What Unpaywall would not add now:** a second OA graph. It can still add a *publisher/repo* `url_for_pdf` for works that have one, which this app would then have to fetch (CORS / 403 / HTML) unless it stays on `content.openalex.org`.

## Failure modes (code + hosts)

| Failure | Observed in this repo | What the host documents |
| --- | --- | --- |
| **CORS on publisher PDFs** | Spec: arXiv / OSF / publisher hosts “do not serve permissive CORS headers”; public CORS proxies truncate binaries ([`agy_spec.md:5-9`](agy_spec.md)). Report: browser blocked client-side PDF fetch ([`reader_development_report.md:12`](reader_development_report.md)). | Current reader **avoids this** by using `content.openalex.org`, which **does** send `Access-Control-Allow-Origin: *` (HEAD/GET + OPTIONS 204, measured 2026-08-16). `api.openalex.org` also sends `*`. `export.arxiv.org/pdf/…` also sends `Access-Control-Allow-Origin: *` (measured on `1706.03762`) — that is why the adapter rewrites to `export.arxiv.org`. |
| **403 bot blocks** | Report: Cloudflare proxy + missing/bot-like UA got 403 from Zenodo/arXiv ([`reader_development_report.md:13`](reader_development_report.md)). Commits `0929a4a`, `0398939`. Proxy now sends `User-Agent: AcademicSerendipityReader/1.0 (mailto:admin@example.com)` ([`functions/api/proxy.ts:26-31`](functions/api/proxy.ts), [`vite.config.ts:37-42`](vite.config.ts)). | arXiv: indiscriminate automated downloads are forbidden; continued requests after `403: Access denied` are treated as an attack ([robots](https://info.arxiv.org/help/robots.html)). Harvest must use `export.arxiv.org` at ~4 req/s bursts with 1s sleep; do not crawl the full corpus off the HTML site ([bulk data](https://info.arxiv.org/help/bulk_data.html)). OpenAlex excludes CAPTCHA hosts (SSRN) and login hosts (ResearchGate) from OA locations ([OA docs](https://help.openalex.org/data/works/open-access/)). |
| **HTML landing pages / paywalls** | Report: OpenAlex `oa_url` / `pdf_url` often pointed at Elsevier-style landing pages the PDF viewer could not parse ([`reader_development_report.md:15`](reader_development_report.md)). Official: `oa_url` “may be a PDF or a landing page.” Unpaywall `url` falls back to landing page; `url_for_pdf` may be null. | This is why the Content API path exists. The leftover adapter still stores those URLs. If `/api/proxy` is reused, it will happily stream `text/html` (Vite sets upstream `Content-Type`; the Pages Function defaults missing type to `application/pdf` — [`functions/api/proxy.ts:49-51`](functions/api/proxy.ts) — which can mislabel HTML as a PDF). |
| **Double-compression / `%PDF` corruption** | Report: proxy + compression headers produced a scrambled stream ([`reader_development_report.md:14`](reader_development_report.md)). Production proxy **deletes** `content-encoding`, `content-length`, `transfer-encoding` ([`functions/api/proxy.ts:41-46`](functions/api/proxy.ts)). Vite proxy materializes `arrayBuffer()` and writes raw bytes ([`vite.config.ts:59-60`](vite.config.ts)). | Cloudflare Workers `fetch`: gzip/brotli is “automatically requested” and applied on the way back to the client unless the Worker preserves `Content-Encoding` and does not read the body ([Workers Fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/)). Copying an upstream `Content-Encoding: gzip` after the runtime already decompressed the body is the classic double-gunzip. The proxy’s header strip matches that documented failure. **Content API is a different case:** measured response is `Content-Type: application/gzip` with **no** `Content-Encoding`, body starting `\x1f\x8b` (a `.xml.gz` attachment). Browser `fetch` will **not** auto-decode that; the app’s `DecompressionStream('gzip')` is the correct handling. |
| **GROBID / empty body** | Reader treats missing sections as error ([`ReaderModeView.tsx:25-29`](src/components/reader/ReaderModeView.tsx)). Parser only walks `body > div > p` or all `body p` ([`openalex-content.ts:75-108`](src/services/openalex-content.ts)). | OpenAlex: no OCR; unusual/malformed PDFs fail; filter `has_content.grobid_xml:true`. App does **not** use that filter. ~20% of the current feed has `has_fulltext` but no GROBID XML; those still open the reader if `has_content.pdf` is true, then fail. |
| **Content API 402/429 / budget** | Not handled specially: any `!res.ok` → `null` → “unavailable.” | Each download costs **$0.01** (`X-RateLimit-Cost-USD: 0.01` measured; [example costs](https://help.openalex.org/access/example-costs/)). Free key = **~$1/day ≈ 100 files**. 429 if daily budget exceeded or **>100 req/s** ([authentication](https://help.openalex.org/api/authentication/)). The API key is **hardcoded in client JS** ([`openalex-content.ts:3,32`](src/services/openalex-content.ts), [`openalex.ts:45-47`](src/services/adapters/openalex.ts)), so every user’s reader shares one daily 100-file budget. |
| **Paywalled / bronze flicker** | N/A on Content API path. | Bronze = free on the publisher page *without* an identifiable open license; availability “can come and go” ([OA docs](https://help.openalex.org/data/works/open-access/)). Publisher `pdf_url` can 403 tomorrow even if OpenAlex still lists it. |

No Vercel Edge `fetch` behavior is relevant to HEAD: there is no Vercel function in the repo. If `/api/proxy` is later deployed as a Cloudflare Pages Function, the Workers `fetch` rules above apply.

## Rate limits, User-Agent / polite-pool, legal OA constraint

### Rate / identity

- **OpenAlex polite pool is gone.** Before February 2026, `mailto=` raised limits. That parameter is now ignored; keys replaced it ([deprecations](https://help.openalex.org/api/deprecations/)).
- **OpenAlex API (metadata):** free key, $1/day; 100 rps; `per_page` max 100; basic paging 10k results. List+filter = $0.10 / 1,000 calls; search = $1 / 1,000; single-entity GET is free ([authentication](https://help.openalex.org/api/authentication/), [example costs](https://help.openalex.org/access/example-costs/)). This app’s feed is a `list+filter` (and optional `search=`).
- **OpenAlex Content API:** $0.01/file, ~100/day on the free key, intended “up to ~10K files” via API ([fulltext](https://help.openalex.org/access/fulltext/)). Measured headers on `content.openalex.org`: `x-ratelimit-limit-usd: 1`, `x-ratelimit-cost-usd: 0.01`.
- **Unpaywall (if used):** email required; 100k calls/day ([Api.vue](https://github.com/ourresearch/unpaywall-website/blob/master/src/views/products/Api.vue)).
- **arXiv:** API ToU: ≤1 request / 3 seconds, one connection, across all your machines ([API ToU](https://info.arxiv.org/help/api/tou.html)). Harvest: `export.arxiv.org`, ~4 req/s bursts + 1s sleep ([bulk data](https://info.arxiv.org/help/bulk_data.html)). 403 + block if you ignore robots ([robots](https://info.arxiv.org/help/robots.html)).
- **This proxy’s UA** (`mailto:admin@example.com`) is a placeholder, not a monitored contact.

### Legal

- **OpenAlex metadata** is CC0; they sell *serving*, not the data ([pricing](https://help.openalex.org/access/pricing/)).
- **OpenAlex full text:** “The PDFs retain their original copyright. OpenAlex does not grant any additional rights to the content.” Use `best_oa_location.license` (e.g. `cc-by`) to know what you may do ([fulltext](https://help.openalex.org/access/fulltext/)). Elsevier user license is explicitly **not** counted as open and “doesn’t allow redistribution” ([OA docs](https://help.openalex.org/data/works/open-access/)). Bronze has no identifiable open license.
- **arXiv content:** arXiv is usually *not* the copyright holder. Default license is a non-exclusive right for *arXiv* to distribute. ToU: you **must not** “store and serve arXiv e-prints (PDFs, source files, or other content) from your servers” unless the paper’s own license allows it. Metadata is CC0. Link to the abstract page ([API ToU](https://info.arxiv.org/help/api/tou.html), [bulk data](https://info.arxiv.org/help/bulk_data.html)).
- **Unpaywall / OA discovery** locates legally posted copies; it does not license the PDF.
- **Implication for this app:** serving OpenAlex GROBID XML or proxying publisher PDFs into IndexedDB is *redistribution of the work*, not just metadata. That is only clearly allowed when the work’s `best_oa_location.license` (or the paper’s own license) permits it. The current code does **not** filter on license. CC-BY ∩ English OA ∩ GROBID is **9.2M** works (11.1% of English OA) — a documented *license-safe* subset, not a claim that everything else is illegal to *read*.

## Honest unknowns

- **No measured “reader success rate.”** OpenAlex does not publish the share of GROBID XML that yields a complete, readable body. This app’s parser can also drop works whose TEI is not `body > div > p`. We did not sample-parse the 30.5M set.
- **`has_fulltext` semantics are inconsistent** between the attributes page and live `meta.count`. Until OpenAlex reconciles that, do not treat the feed filter as “bytes exist.”
- **Publisher `pdf_url` / Unpaywall `url_for_pdf` fetch success** (200 + `%PDF` vs 403 vs HTML) is **not** measured here. Hosts change. The previous PDF pipeline is not on the current reader path.
- **Shared hardcoded API key budget** under real multi-user load is untested. 100 content downloads/day is the documented free-tier cap for that key.
- **Production hosting of `/api/proxy`** is not declared in-repo (no Wrangler/Vercel config). Pages Function vs unused file is unknown from source alone.
- **`language:en` is metadata language**, not full-text language.
- **Expansion corpus** (`corpus=all`) is excluded from the counts above; OpenAlex warns those ~190M extra works are lower quality ([attributes](https://help.openalex.org/data/works/attributes/)).

## Facts later tickets can depend on

1. The in-app reader at HEAD fetches **only** `content.openalex.org/…grobid-xml` (CORS `*`, `Content-Type: application/gzip`, $0.01/file). It does not call Unpaywall and does not use `/api/proxy`.
2. `is_oa` / `oa_url` / `pdf_url` are **location hints**. `has_content.*` / `content_urls` are the archive. Do not key archive files off `locations[].pdf_url`.
3. Live English OA (82.8M): 41.7% pass this app’s `has_fulltext` filter; 36.8% have GROBID XML; **20.3% of the current feed have no GROBID XML**. Live `has_fulltext` ≠ documented `has_content.pdf ∨ grobid_xml`.
4. Free OpenAlex key ≈ **100 content downloads/day**, 100 rps; polite-pool/`mailto` is retired. The key is in client JS.
5. OpenAlex grants **no extra rights** to PDFs/XML. arXiv ToU forbids storing/serving most e-prints. License-safe in-app copies need `best_oa_location.license` (CC-BY ∩ EN OA ∩ GROBID = 9.2M on 2026-08-16).
