# Manual test plan

Make's app review wants every module used in at least one scenario, search modules run with enough rows to paginate, and one scenario that produces an error ([prerequisites](https://developers.make.com/custom-apps-documentation/app-review/prerequisites)). Execution logs expire, so run the scenarios again right before requesting the review.

Needs: the app deployed to a Make account (see `MAKE-SUBMISSION.md`), a Searcherries account on Starter or Pro (a trial counts) with at least one **ready** project that has Google Search Console and GA4 connected, and a personal access token from <https://app.searcherries.com/mcp> → **Other clients**.

Record for every scenario: run date, module version, bundles returned, and whether the output matched the Searcherries report.

## 0. Connection

| Step | Expect |
| --- | --- |
| Add any Searcherries module, click **Add** next to Connection, paste the token, save. | The connection is created and labelled `<first project brand> +N more` (or `no projects yet`). |
| Repeat with a made-up token. | `[401] ... Create a new token on https://app.searcherries.com/mcp ...` and the connection is not saved. |
| Repeat with a token of a free account (optional). | `[403] ... needs a paid plan ... Choose a plan at https://app.searcherries.com/plans.` |

## 1. List projects (search)

Scenario `Searcherries – projects`: **List projects** (Limit 10) → **Text aggregator** or any sink.

Expect one bundle per project with `id`, `brand_name`, `status`, `selected_ai_models`, `connections`, `connected_data`, `data_availability`. Compare the count with <https://app.searcherries.com/projects>.

## 2. Get a project summary (action)

Scenario `Searcherries – summary`: **Get a project summary** with Project ID picked from the list (map toggle off), Period `Last 30 days`, Blocks empty → sink.

Expect one bundle with every block listed in `included`. Run again with Blocks `Profile and business profile` + `Connection health`: `included` has exactly those two and the other blocks are absent. Check `ai_visibility.visibility_score` against the Overview of the project report.

## 3. Get an action plan (action)

Scenario `Searcherries – action plan`: **Get an action plan**, Audience `Marketing`, Maximum actions 3 → sink.

Expect `status` `ready` (or `needs_data` for a young project) and at most 3 `actions`, each with `evidence`, `report_url` and `next_request.url` pointing at `https://app.searcherries.com/api/v1/...`. Open one `report_url`; it must be the matching report section.

## 4. Search AI answers (search, paginated)

Scenario `Searcherries – answers`: **Search AI answers**, Project from the list, Customer question empty, Period `Last 90 days`, Limit 150 → sink.

Expect up to 150 bundles; with more than 100 stored answers the execution log shows two requests (`offset=0`, `offset=100`), the second only when `pagination.has_more` was true. Then:

- Customer question = the primary question (the nested select loads after the project): every bundle has that `prompt_id`.
- Maximum prominence `1`: every `insight.prominence_level` is 0 or 1.
- Only flagged answers on: every `insight.attention` is `negative`, `drawback` or `off_topic`.
- Include answer text on, Characters per answer 500, Limit 30: `response_text` present and at most 500 characters, log shows requests of 20 rows (`offset=0`, `offset=20`).
- From date / To date set to one week: `check_date` inside the week; Period is ignored.

## 5. List competitors (search)

Scenario `Searcherries – competitors`: **List competitors**, Dataset `Ranking`, Include highlights on, Highlights per platform 2, Limit 60 → sink.

Expect one bundle per brand ordered by `rank`, the own brand with `is_own_brand` true, `platform_highlights` with at most 2 sentences per platform; with more than 50 brands a second request with `offset=50`. Dataset `History`, Limit 12: one bundle per month with `period_start`, `period_end`, `own_brand`, `top_competitors`.

## 6. Get a competitor (action)

Scenario `Searcherries – competitor detail`: **Get a competitor**, Competitor = a name from scenario 5 (a fragment works, for example `mixp`) → sink.

Expect one bundle, `found` true, `competitor.name_variants` and `competitor.platform_highlights`. Run again with Competitor `zzz-no-such-brand`: the module errors with `[404] No competitor matching 'zzz-no-such-brand' was found ...` (a `DataError`, so the bundle goes to incomplete executions when those are enabled).

## 7. Search citations (search, paginated)

Scenario `Searcherries – citations`: **Search citations**, Group by `Cited URLs`, Limit 150 → sink.

Expect one bundle per URL with `mention_count`, `platforms`, `prompt_ids`, `is_own_site`; pagination as in scenario 4 when more than 100 URLs exist. Then Group by `Cited domains`: bundles carry `website_domain`, `citation_count`, `citation_percentage`. Own site only on: every `is_own_site` is true. URL contains `reddit`: every `url` contains it.

## 8. Get search performance (action)

Scenario `Searcherries – search performance`: **Get search performance**, Source `Google Search Console`, Window `Last 30 days`, Dataset `Summary` → sink.

Expect `available` true, `total_clicks`, `total_impressions`, `top_queries` (10 rows). Then Dataset `Top queries`, Sort by `Impressions, descending`, Minimum impressions 100, Rows per page 20, Offset 20: `rows` has at most 20 entries, all with `impressions >= 100`, `pagination.offset` 20. Source `Bing Webmaster Tools` on a project without Bing: `available` false with a `reason`, no error.

## 9. Get AI traffic (action)

Scenario `Searcherries – AI traffic`: **Get AI traffic**, Window `Last 90 days`, Dataset `Summary` → sink.

Expect `available` true, `ai_traffic.sessions`, `sources` with one row per AI source. Then Dataset `Landing pages`, AI source `ChatGPT`, Path contains `/`: `rows` of landing pages with `source` `chatgpt`. Dataset `History`: monthly rows.

## 10. Make an API call (universal)

Scenario `Searcherries – API call`: **Make an API call**, URL `/v1/projects` → sink.

Expect `statusCode` 200 and `body.projects`. Then URL `/v1/projects/<id>/citations` with Query string `group_by` = `domain`, `limit` = `5`: `body.rows` has 5 domains. URL `/v1/nope`: `[404] The route api/v1/nope could not be found.`

## 11. Error scenario (required by the review)

Scenario `Searcherries – error`: **Get search performance**, Dataset `Top queries`, Minimum position 20, Maximum position 5 → sink.

Expect the module to fail with `[422] The request parameters are invalid. max_position: ...` and the execution to stop (`DataError`). Keep this scenario's log for the review.

Also worth one run: a connection whose token was revoked on the MCP page → `[401]` on the next execution.

## 12. Rate limit (optional)

A scenario with **Search AI answers** Limit 3200 and a **Repeater** of 100 runs hits the per-minute budget: the execution shows `[429] ... Retry after N seconds.` and Make retries the scenario later instead of switching it off.

## Logs to keep for the review

- One execution per scenario above, run within the data retention window.
- The error scenario (11) with its failed execution.
- For scenarios 4, 5 and 7, an execution whose log shows more than one request (pagination).

None of the scenarios writes anything; the API is read-only.
