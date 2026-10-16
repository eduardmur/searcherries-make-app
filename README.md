# Searcherries app for Make

Custom [Make](https://www.make.com) app for the [Searcherries REST API](https://searcherries.com/docs/api/overview): connect your scenarios to the AI visibility, search and traffic data Searcherries stores for your projects (brand presence in ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude and Grok; competitors and cited sources; Google Search Console, Bing Webmaster Tools and GA4 AI-traffic snapshots; a prioritized action plan).

The repository is laid out the way the [Make Apps Editor for VS Code](https://marketplace.visualstudio.com/items?itemName=Integromat.apps-sdk) stores a locally developed app (its *Local development for Apps* feature), so the app can be deployed to a Make account straight from these files and later pulled, compared and re-deployed from VS Code. Nothing here talks to Make on its own.

- `src/` – the app: `makecomapp.json` (manifest), `general/base.iml.jsonc`, the connection, two RPCs, ten modules, `modules/groups.json`, `README.md` (shown on the app page in Make)
- `assets/logo.png` – the 512 × 512 app logo (black glyph on a transparent canvas, see below)
- `reference/openapi-v1.yaml` – copy of the API document the interfaces are generated from
- `scripts/` – `generate-interfaces.mjs` (module interfaces from the OpenAPI schemas) and `validate.mjs` (structure, references, conventions)
- `TESTING.md` – manual test plan, one scenario per module plus error and pagination scenarios
- `MAKE-SUBMISSION.md` – how to create the app in Make from this repo, test it and request the app review

## App

| | |
| --- | --- |
| Label | Searcherries |
| Name (app ID) | `searcherries` (set in `src/makecomapp.json` → `origins[0].appId`; change it if the name is taken in your zone) |
| Description | Connect your scenarios to your AI visibility and SEO data: how AI platforms present your brand, the competitors and sources they name, Search Console, Bing and GA4 AI traffic, and a prioritized action plan. |
| Theme | `#000000` |
| Language | English |
| Audience | Global |
| Base URL | `https://app.searcherries.com/api/v1` |
| Connection | Basic (API key): one password field `personal_access_token`, validated by `GET /projects`; the connection is labelled with the first project of the account |

### Modules

| Module (ID) | Type | Endpoint |
| --- | --- | --- |
| List projects (`listProjects`) | search | `GET /projects` |
| Get a project summary (`getProjectSummary`) | action (read) | `GET /projects/{project}` with `period`, `include` |
| Get an action plan (`getActionPlan`) | action (read) | `GET /projects/{project}/action-plan` |
| Search AI answers (`listAnswers`) | search | `GET /projects/{project}/answers` |
| List competitors (`listCompetitors`) | search | `GET /projects/{project}/competitors` (`ranking`, `history`) |
| Get a competitor (`getCompetitor`) | action (read) | `GET /projects/{project}/competitors?dataset=detail` |
| Search citations (`listCitations`) | search | `GET /projects/{project}/citations` |
| Get search performance (`getSearchPerformance`) | action (read) | `GET /projects/{project}/search-performance` |
| Get AI traffic (`getAiTraffic`) | action (read) | `GET /projects/{project}/ai-traffic` |
| Make an API call (`makeApiCall`) | universal | any `GET` under `https://app.searcherries.com/api` |

Search modules iterate the rows of the response, follow `pagination.has_more` with `offset = offset + returned` and stop at the module's **Limit** (default 10, as Make recommends). Action modules return the whole response as one bundle. The project is picked through the `rpcProjects` RPC (`GET /projects`); the customer question through `rpcQuestions`, nested under the project (`GET /projects/{project}?include=questions`). Every select's options and defaults come from the enums of the OpenAPI document.

Errors use the API envelope: `[401]` with the token hint, `[403]` with `plans_url` for `paid_plan_required`, `[404]`, `[422]` with the per-field messages (`DataError`), `[429]` with `retry_after` (`RateLimitError`, Make suspends and retries). The authorization header is sanitized from logs.

### Logo

`assets/logo.png` is the Searcherries mark rendered black on a transparent 512 × 512 canvas (`assets/logo.svg`, derived from `app.searcherries.com/icon.svg`). Make paints black areas white and transparent areas in the theme colour, so the module shows a white mark on black. Make requires a square PNG between 512 and 2048 px and under 500 kB; the logo is uploaded in Make (app settings → Options → Edit, or VS Code → right-click the app → Edit icon), it is not part of the deployed code.

## Working on the app

```bash
npm install
npm test               # regenerates nothing; checks interfaces are in sync and validates everything
npm run validate       # structure, references and conventions only
npm run generate:interfaces   # after updating reference/openapi-v1.yaml
```

`npm run validate` validates every code file against the JSON schemas the Make Apps Editor ships (copied to `scripts/schemas/`, see `NOTICE.md` there), checks the manifest, component IDs, `rpc://` and connection references, `{{parameters.x}}` against declared parameters, groups, the search/action/universal module conventions from the Make documentation, sample keys against the interface, and the logo. Make documents no separate command-line linter; the editor's schema validation is what this reproduces.

To work in VS Code with the Make Apps Editor: open this folder, put your Make API key in `.secrets/apikey` (one line, git-ignored), set `baseUrl` and `appId` in `src/makecomapp.json` → `origins`, then right-click `src/makecomapp.json` → **Deploy to Make**. `MAKE-SUBMISSION.md` walks through it.

## License

MIT. The JSON schemas in `scripts/schemas/` are © Celonis, Inc. (Make), MIT, copied from `integromat/vscode-apps-sdk`.
