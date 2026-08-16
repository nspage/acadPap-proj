# What Gist sync actually carries today

Research for [issue #6](https://github.com/nspage/acadPap-proj/issues/6). Primary sources: this repo’s `src/services/gist-sync.ts` and callers, plus official GitHub Gist REST, PAT-scope, and rate-limit docs. No product changes.

## Exact payload

`pushStateToGist` builds a `SyncState` object and PATCHes it as a single gist file named `state.json`:

```ts
export interface SyncState {
  savedPapers: any[];
  notes: any[];
  sources: any[];
  discardedIds: any[];
  lastSyncedAt: number;
}
```

Source: [`src/services/gist-sync.ts:3-8`](../../src/services/gist-sync.ts).

Tables that go up (full `toArray()` of each):

| Field | Dexie table | Primary key | What the rows are |
| --- | --- | --- | --- |
| `savedPapers` | `db.savedPapers` | `id` | Full `PaperCard` metadata (title, abstract, authors, URLs, citation/OA fields). Not the PDF. [`src/lib/db.ts:5`](../../src/lib/db.ts), [`src/types/index.ts:9-35`](../../src/types/index.ts) |
| `notes` | `db.notes` | `id` | `PaperNote` (takeaways, jargon, synthesis, quotes). [`src/types/index.ts:37-46`](../../src/types/index.ts) |
| `sources` | `db.sources` | `id` | `RepositoryConfig` channels (enabled flag, OpenAlex filter). [`src/types/index.ts:62-72`](../../src/types/index.ts) |
| `discardedIds` | `db.discardedIds` | `id` | `{ id, discardedAt }` swipe-left records. [`src/lib/db.ts:8`](../../src/lib/db.ts) |
| `lastSyncedAt` | *(not a table)* | — | `Date.now()` written on every successful push. Never read on pull. [`src/services/gist-sync.ts:23`](../../src/services/gist-sync.ts), [`src/services/gist-sync.ts:81-92`](../../src/services/gist-sync.ts) |

The HTTP write is `PATCH https://api.github.com/gists/${gistId}` with body `{ files: { "state.json": { content: payload } } }` and header `Authorization: token ${pat}`. [`src/services/gist-sync.ts:28-41`](../../src/services/gist-sync.ts). That matches the official Update-a-gist contract (`PATCH /gists/{gist_id}`, files keyed by filename, `content` is the new file body). [GitHub REST: Update a gist](https://docs.github.com/en/rest/gists/gists#update-a-gist).

The app never creates the gist. Settings asks the user for an existing “Private Gist ID” and a PAT. [`src/components/settings/SettingsModal.tsx:75-92`](../../src/components/settings/SettingsModal.tsx).

## Merge strategy on pull

Pull is `GET https://api.github.com/gists/${gistId}`, then `JSON.parse(gist.files['state.json'].content)`. [`src/services/gist-sync.ts:64-81`](../../src/services/gist-sync.ts). Official Get-a-gist: `GET /gists/{gist_id}`. [GitHub REST: Get a gist](https://docs.github.com/en/rest/gists/gists#get-a-gist).

Local apply (one Dexie `rw` transaction):

```ts
if (state.savedPapers?.length) await db.savedPapers.bulkPut(state.savedPapers);
if (state.notes?.length)       await db.notes.bulkPut(state.notes);
if (state.sources?.length)     await db.sources.bulkPut(state.sources);
if (state.discardedIds?.length) await db.discardedIds.bulkPut(state.discardedIds);
```

Source: [`src/services/gist-sync.ts:83-92`](../../src/services/gist-sync.ts).

What that means in this code:

- **Upsert, not replace-table.** The comment says `bulkPut` “performs an upsert (insert or replace)” and “safely merges cloud state over local state.” Same-key local rows are overwritten by the cloud object. [`src/services/gist-sync.ts:83-85`](../../src/services/gist-sync.ts).
- **No delete-propagation.** Rows that exist only locally are left in place. Empty cloud arrays are skipped (`if (state.*.length)`), so a wiped table on device A will not clear device B.
- **Not field-level merge.** The whole record for a key is replaced. `lastSyncedAt` is not compared. Concurrent note edits on the same `id` last-write-wins at the next push, not at the next field.
- **Whole-table overwrite on the gist.** Each push serializes the *current* local arrays. GitHub’s PATCH only replaces the files named in the request; other gist files are unchanged. [Update a gist](https://docs.github.com/en/rest/gists/gists#update-a-gist).

## When pull and push run

| Event | What happens | Source |
| --- | --- | --- |
| Boot | If `localStorage.github_pat` and `localStorage.gist_id` are set, `isHydrating=true`, `await pullStateFromGist`, then `loadFeed()`. One pull per page load. | [`src/App.tsx:62-76`](../../src/App.tsx) |
| After `savedPapers`, `notes`, or `dbSources` change | 3s debounce, then `pushStateToGist`. Skipped while `isLoading` or `isHydrating`. | [`src/App.tsx:81-99`](../../src/App.tsx) |
| Discard only | Writes `discardedIds` but is **not** in the debounce dependency list. A discard-only session does not schedule a push. | [`src/App.tsx:99`](../../src/App.tsx) vs [`src/App.tsx:116-121`](../../src/App.tsx) |
| Settings Save | Writes PAT + gist id to `localStorage`. Does not pull or push. | [`src/components/settings/SettingsModal.tsx:44-48`](../../src/components/settings/SettingsModal.tsx) |

PAT and gist id live only in this origin’s `localStorage` (`github_pat`, `gist_id`). Each device must be configured separately. [`src/components/settings/SettingsModal.tsx:25-26`](../../src/components/settings/SettingsModal.tsx), [`src/App.tsx:66-67`](../../src/App.tsx).

## What is omitted (and same-day phone/laptop bounce)

Dexie also has `pdfCache` and `contentCache`. [`src/lib/db.ts:9-10`](../../src/lib/db.ts). They are never read or written by `gist-sync.ts`.

| Omitted | Where it lives | Bounce consequence |
| --- | --- | --- |
| **`pdfCache`** | IndexedDB `CachedPdf` (`paperId`, `blob`, `cachedAt`, `sizeBytes`). [`src/types/index.ts:48-53`](../../src/types/index.ts), written by [`src/lib/db.ts:75-88`](../../src/lib/db.ts) | PDF binaries stay on the device that downloaded them. The other device has the `PaperCard` (including `pdfUrl`) after pull, then must re-fetch the blob. |
| **`contentCache`** | IndexedDB `CachedContent` (`paperId`, `xmlText`, `cachedAt`, `sizeBytes`). [`src/types/index.ts:55-60`](../../src/types/index.ts), written by [`src/services/openalex-content.ts:25-51`](../../src/services/openalex-content.ts) | GROBID XML is re-fetched from OpenAlex on the other device. Reader opens, but first paint waits on network. |
| **In-memory deck** | `SwipeDeck` copies `papers` into React state and `slice(1)` on swipe. [`src/components/deck/SwipeDeck.tsx:15-48`](../../src/components/deck/SwipeDeck.tsx). `App` holds `papers` in `useState` from a live OpenAlex fetch. [`src/App.tsx:19`](../../src/App.tsx), [`src/App.tsx:41-53`](../../src/App.tsx) | Queue position is not persisted at all. A phone that swiped 20 cards does not hand that cursor to the laptop. After discard IDs *do* sync, those papers are filtered out of a *new* fetch; until then, the laptop can re-show them. |
| **Reading position** | No Dexie column, no localStorage key, no gist field. `ReaderModeView` only keeps `fontSize` in component state and reloads content by `paper.id`. [`src/components/reader/ReaderModeView.tsx:15-38`](../../src/components/reader/ReaderModeView.tsx). `PaperNote.quotes[].pageNumber` is optional quote metadata, not a scroll cursor. [`src/types/index.ts:43`](../../src/types/index.ts) | Mid-paper place is lost on every close, let alone another device. |
| **Device settings** | `gemini_api_key`, `filter_geo`, `filter_impact`, `sort_impact` are `localStorage` only. [`src/App.tsx:24-30`](../../src/App.tsx), [`src/components/settings/SettingsModal.tsx:29-41`](../../src/components/settings/SettingsModal.tsx) | Quality filters and Gemini key do not follow the user. |
| **Deletes of saved papers** | `handleRemoveSavedPaper` deletes local `savedPapers` / `notes` / `pdfCache`. [`src/App.tsx:124-129`](../../src/App.tsx). Pull never `bulkDelete`s missing ids. | A paper removed on the laptop remains on the phone until that phone also deletes it. |

Practical same-day bounce: after a successful push + a fresh load on the other device (pull is boot-only), **journal metadata and notes appear**. PDFs and fulltext must download again. The swipe deck starts over from a new OpenAlex fetch, minus saved IDs and whatever discard IDs actually made it into the gist. There is no reading-position restore.

## Gist size, PAT, rate limits

### Size (official REST)

GitHub’s Gist REST docs state, and only state, these read limits ([About gists — Truncation](https://docs.github.com/en/rest/gists/gists#about-gists)):

- The API returns **at most 1 MB of `content` per gist file**. If the file is larger, `truncated` is `true` and `content` is a prefix.
- Full file via `raw_url` (GET). Files **larger than 10 MB** require cloning `git_pull_url`.
- A gist with more than **300 files** has a truncated file list (not relevant: this app writes one file).

This code never inspects `truncated` and never follows `raw_url`. [`src/services/gist-sync.ts:77-81`](../../src/services/gist-sync.ts). If `state.json` exceeds 1 MB, pull can parse a truncated prefix, throw, `console.error`, and return `false` — local DB is left as-is.

Official REST/gist pages **do not publish a hard write-size cap** for `PATCH /gists/{gist_id}`. The 1 MB / 10 MB figures are retrieval rules, not a documented upload quota. Treat “how large a `state.json` PATCH will accept” as unknown (see below).

Payload today is pretty-printed JSON of paper metadata + notes + sources + discard ids — not blobs — so 1 MB is the first limit that matters for this design.

### PAT scopes

Settings copy: “GitHub Personal Access Token (classic, `gist` scope)”. [`src/components/settings/SettingsModal.tsx:76`](../../src/components/settings/SettingsModal.tsx).

Official:

- Gist REST: “To read or write gists on a user’s behalf, you need the **gist** OAuth scope and a token.” [Gist REST — Authentication](https://docs.github.com/en/rest/gists/gists#authentication).
- Classic PAT scopes: **`gist`** = “Grants write access to gists.” [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes).
- Fine-grained PATs: account permission **Gists** (`gists=write`) exists. [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#permissions). Official gist docs: **Update a gist** requires fine-grained “Gists” user permission (write); **Get a gist** requires no fine-grained permission. [REST gists](https://docs.github.com/en/rest/gists/gists).
- GitHub still recommends fine-grained PATs when they cover the job, and notes classic tokens can do things fine-grained ones cannot. [Managing PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#about-personal-access-tokens).
- Unused classic/fine-grained PATs are **revoked after one year**. [Managing PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#personal-access-tokens-classic).

GitHub’s “secret” gist is **not private**: anyone with the URL can read it. [Creating gists](https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists). The UI’s “private Gist ID” wording overstates that.

### Authenticated rate limits

This app always sends a PAT, so unauthenticated 60/hour does not apply.

Primary (REST, authenticated user / PAT): **5,000 requests per hour**. [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-authenticated-users). Headers: `x-ratelimit-limit`, `-remaining`, `-used`, `-reset`. Exceeding returns **403 or 429**.

Secondary (abuse) limits that could theoretically bite a chatty client ([same page](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits)):

- ≤ 100 concurrent requests.
- ≤ 900 REST points per minute. Most GET = 1 point; most PATCH = 5 points.
- Content-generation: generally ≤ 80/min and ≤ 500/hour (docs do not enumerate whether `PATCH /gists` counts; they say “content-generating requests” including API + UI).

Same-day two-device bounce math from *this* code: 1 GET per boot + 1 PATCH per 3s after a watched table change. Primary 5,000/hour is not the constraint. A pathological edit loop could approach the undocumented-as-applied 500 content-gen/hour cap; a human phone/laptop hop will not.

The code does not read rate-limit headers and does not back off. [`src/services/gist-sync.ts:44-46`](../../src/services/gist-sync.ts), [`src/services/gist-sync.ts:72-74`](../../src/services/gist-sync.ts).

## Failure modes in this code

All user-visible sync is silent. Failures return `false` and log to the console only.

| Condition | Behavior | Source |
| --- | --- | --- |
| Missing PAT or gist id | Immediate `false`; no fetch. | [`src/services/gist-sync.ts:15`](../../src/services/gist-sync.ts), [`:61`](../../src/services/gist-sync.ts) |
| HTTP not OK (401/403/404/422/429…) | `console.error('Failed to push/pull…', await res.text())`; `false`. | [`:44-46`](../../src/services/gist-sync.ts), [`:72-74`](../../src/services/gist-sync.ts) |
| Network / JSON / Dexie throw | `console.error('Error pushing/pulling…', err)`; `false`. | [`:51-54`](../../src/services/gist-sync.ts), [`:96-99`](../../src/services/gist-sync.ts) |
| Gist has no `state.json` or empty `content` | Pull returns `false` with **no** log. | [`:78-79`](../../src/services/gist-sync.ts) |
| `truncated: true` / partial JSON | `JSON.parse` throws → catch → `console.error`. | [`:81`](../../src/services/gist-sync.ts) + [truncation docs](https://docs.github.com/en/rest/gists/gists#about-gists) |
| Push boolean ignored | `setTimeout(() => { pushStateToGist(pat, gistId); }, 3000)` — no `await`, no toast. | [`src/App.tsx:92-94`](../../src/App.tsx) |
| Pull boolean ignored | Boot `await`s pull but does not branch on `false`; feed still loads from local + OpenAlex. | [`src/App.tsx:69-75`](../../src/App.tsx) |

There is no retry, no conflict UI, no “last synced” display (despite `lastSyncedAt` on the wire).

## Honest unknowns

- **Hard gist write-size limit.** Official REST/gist docs document 1 MB `content` on GET and 10 MB before clone is required. They do not state a maximum `content` length that `PATCH /gists/{gist_id}` will accept. Community/support threads mention 100 MB / 25 MB web; those are **not** cited here because they are not official REST or PAT docs.
- **Whether `PATCH /gists` is a “content-generating” secondary-limit request.** GitHub lists 80/min and 500/hour as general content-creation caps and does not name this endpoint.
- **Fine-grained PAT against this client.** Officially `gists=write` covers Update-a-gist. This client sends `Authorization: token …` and `Accept: application/vnd.github.v3+json`, not the currently recommended `Bearer` + `application/vnd.github+json`. Untested in this repo.
- **Dexie `bulkPut` internals** beyond the in-repo comment (whole-object replace vs merge of omitted fields) were not re-derived from Dexie docs; later tickets should treat the cloud object as the new row.
- **Secret-gist URL leakage / PAT-in-localStorage risk** is implied by official gist + PAT guidance but not measured here.
- **No production gist in this clone** was fetched, so real `state.json` byte size for a lived-in library is unknown.

## Facts later tickets will depend on

1. Sync is **metadata only**: `savedPapers`, `notes`, `sources`, `discardedIds` (+ unused `lastSyncedAt`). **`pdfCache` and `contentCache` never leave the device.**
2. There is **no reading-position field** anywhere. The swipe **deck is in-memory only**.
3. Pull is **boot-only upsert** (`bulkPut`). Deletes and empty tables do not propagate. Discard-only edits **do not debounce-push**.
4. Failures are **console-only**; PAT + gist id are **per-device `localStorage`**.
5. Official constraints that matter first: classic **`gist` scope** (or fine-grained **Gists: write**), authenticated **5,000 req/h**, GET **`content` truncated at 1 MB**.
