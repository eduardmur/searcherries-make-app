# Creating the app in Make and requesting the review

Everything below happens in your Make account or on your machine; nothing in this repository contacts Make by itself. Steps marked **(you)** need your Make login, your API key or a decision only you can take.

Sources: Make's custom-apps documentation, sections *Get started → Make Apps Editor → VS Code → Local development for Apps*, *App review* and *Create your first app*, read on 2026-10-16.

## 1. Prerequisites (you)

1. A Make account with custom apps enabled (every Core plan and up has them; the **Custom apps** entry shows in the left menu).
2. A Make API key with the scopes `sdk-apps:read` and `sdk-apps:write` (Profile → API/MCP access → Add token). The key is zone-bound: note your zone (`eu1`, `eu2`, `us1`, `us2`, …) from the URL you log in at.
3. VS Code with the **Make Apps Editor** extension (`Integromat.apps-sdk`, Marketplace).
4. A Searcherries account on Starter or Pro with a ready project, and a personal access token from <https://app.searcherries.com/mcp> → **Other clients** (for testing the connection).

## 2. Create the empty app in Make (you)

The local files describe components; the app record itself (name, label, theme, logo) is created in Make once. Either way works:

**A. Make web interface.** Custom apps → **Create app**:

| Field | Value |
| --- | --- |
| Name | `searcherries` (internal ID, cannot be changed; must match `^[a-z][0-9a-z-]+[0-9a-z]$`) |
| Label | `Searcherries` |
| Description | Connect your scenarios to your AI visibility and SEO data: how AI platforms present your brand, the competitors and sources they name, Search Console, Bing and GA4 AI traffic, and a prioritized action plan. |
| Theme | `#000000` |
| Language | English |
| Audience | Global |
| App logo | `assets/logo.png` from this repository (512 × 512 PNG, black mark on transparent) |

**B. VS Code.** Make Apps Editor sidebar → **+** (or command `>Make Apps: New app`) → the same values; then right-click the app → **Edit icon** → `assets/logo.png`.

**C. Make API** (same result, from a terminal; replace the zone and the key):

```bash
curl -sS -X POST "https://eu1.make.com/api/v2/sdk/apps" \
  -H "Authorization: Token $MAKE_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"searcherries","label":"Searcherries","description":"Connect your scenarios to your AI visibility and SEO data: how AI platforms present your brand, the competitors and sources they name, Search Console, Bing and GA4 AI traffic, and a prioritized action plan.","theme":"#000000","language":"en","version":1,"global":true,"countries":[]}'
```

```bash
curl -sS -X PUT "https://eu1.make.com/api/v2/sdk/apps/searcherries/1/icon" \
  -H "Authorization: Token $MAKE_API_KEY" -H "Content-Type: image/png" \
  --data-binary @assets/logo.png
```

Make appends a random suffix to the name (the app created on 2026-10-20 in eu1 is `searcherries-340mt5`). Read the real name before step 3, because the deploy fails with "Access denied or App not found" on the bare `searcherries`:

```bash
curl -s -H "Authorization: Token $(cat .secrets/apikey)" https://eu1.make.com/api/v2/sdk/apps | python3 -c 'import json,sys; [print(a["name"], "|", a.get("label")) for a in json.load(sys.stdin).get("apps", [])]'
```

## 3. Point the local app at your Make app (you)

1. Clone this repository and open the folder in VS Code (`File → Open Folder`, trust the authors).
2. Configure the extension once: Make icon in the sidebar → **Add environment** → API URL `<zone>.make.com/api` → a label → your API key. The sidebar now lists your custom apps, including the empty one from step 2.
3. Create the key file the local-development feature reads: `.secrets/apikey` in the repository root, containing the API key on one line (the folder is git-ignored).
4. Edit `src/makecomapp.json` → `origins[0]`: set `baseUrl` to `https://<zone>.make.com/api`, `appId` to the app name from step 2, keep `appVersion` 1 and `apikeyFile` `../.secrets/apikey`. Leave `idMapping` empty; the extension fills it on the first deploy.

## 4. Deploy the components (you)

1. Right-click `src/makecomapp.json` → **Deploy to Make (beta)** → choose the origin.
2. For every component the extension cannot pair with an existing remote one (all of them the first time) a dialog asks how to resolve it: choose **create new component in Make**. Make assigns the connection its remote name (`searcherries` or similar); modules and RPCs keep their IDs.
3. The extension deploys in dependency order (connection → RPCs → modules). The groups file lists the modules, so if the `groups` deploy is reported as failed because a module did not exist yet, right-click `src/modules/groups.json` → **Deploy to Make** once more at the end.
4. In the Make web interface (Custom apps → Searcherries) check: Base tab shows the `https://app.searcherries.com/api/v1` base; Connections has one basic connection; Modules lists the twelve modules in the four groups; RPCs lists `rpcProjects` and `rpcQuestions`; the Readme tab shows `src/README.md`.

Later changes: edit the local files, `npm test`, commit, then **Deploy to Make** on the file, the component folder or the manifest. **Pull All Components from Make** brings edits made online back into the files; **Compare with Make** diffs one file.

## 5. Test (you)

Follow `TESTING.md`: one scenario per module, the error scenario and the paginated runs. Keep the scenarios; the review form asks for links to them and the reviewer reads their execution logs (logs expire, so re-run right before submitting).

Three things only a live run could confirm; all three worked on 2026-10-20 (app `searcherries-340mt5`):

- The `[422]` message assembles the per-field errors with `join(flatten(map(toArray(body.error.errors), 'value')), ' ')` (base, `response.error.422`): Make shows `[422] The request parameters are invalid. The max position field must be greater than or equal to 20.`
- The **Customer question** select is nested under **Project** (`options.store` + `nested`) and its RPC reads `parameters.project`: picking a question sent its `prompt_id`.
- The groups deploy after the modules in one **Deploy to Make** run.

The scenarios used for the review: one scenario **Searcherries – all modules** (the six single-result modules in a chain, then a Router with the search modules at the ends of its routes, so nothing runs once per row; Search AI answers with answer text on and Limit 30 to show 20-row pages) and **Searcherries – error**. A first version with the search modules mid-chain ran every later module once per row and hit the `[429]` limit.

Automatic review, 2026-10-20 (AppBot): the action modules **Get search performance** and **Get AI traffic** exposed Rows per page / Offset for list datasets. Fixed by moving those datasets into the search modules **List search performance rows** and **List AI traffic rows** (two more Router routes in the all-modules scenario; the error scenario now uses List search performance rows), returning a competitor no-match as `found: false`, entity names on bare IDs, brand casing, one `Project` label without the map toggle on by default, `InvalidAccessTokenError` on 401 and a project hint on 404 only for `Project not found.`. Make an API call stays GET-only: the API is read-only.

## 6. Before publishing (you)

- Remove any test modules or test connections you added while testing. Once the app is published, components can never be deleted, only hidden.
- Check every module label and description in Make once more (sentence case, no trailing periods in labels).
- `npm test` passes on the committed files; deploy once more so Make holds exactly what the repository holds.
- Decide the app name for good; publishing cannot be undone.

## 7. Publish and request the review (you)

1. Custom apps → Searcherries → **Publish** (top right). This is irreversible: the app stays public (invite link) and cannot be made private or deleted again.
2. **Modules** tab → switch every module to visible (hidden modules are not reviewed and not offered to users).
3. The **Review** tab appears. Fill the form:

| Field | Paste |
| --- | --- |
| Link to the API documentation | `https://searcherries.com/docs/api/overview` (OpenAPI document: `https://app.searcherries.com/openapi/v1.yaml`, endpoint reference: `https://searcherries.com/docs/api/endpoints`) |
| Link(s) to scenarios with the app modules | The scenario links from `TESTING.md` (projects, summary, action plan, answers, competitors, competitor detail, citations, search performance, AI traffic, API call, error) |

4. Click **Request review**. The button turns into *Review process started*, the app status becomes *pending approval*, and Make emails you a thread titled *App review: Searcherries* with a link to the developer form.

5. Developer form (arrives by email). Suggested answers:

| Question | Answer |
| --- | --- |
| Relationship with the vendor of the API | Vendor (ISV): Searcherries builds and operates the API. |
| Partnership contact | Your name and the Searcherries work address. |
| Support contact | The same address, plus `https://searcherries.com/docs/account/support`. |
| Categories and subcategories (make.com/integrations) | Marketing → SEO; Analytics → Marketing analytics; AI (if offered). |
| Logo of your company | `assets/logo.png`, or the brand mark on the violet background from `app.searcherries.com/icon.svg` if a coloured logo is preferred for the landing page. |
| URL to the service | `https://searcherries.com` |
| Trademark compliance | Confirm: Searcherries is your own brand; the module labels name third-party platforms (ChatGPT, Perplexity, Google, Bing, GA4) only descriptively. |
| External service T&C compliance | Confirm: the app calls only `https://app.searcherries.com/api/v1`, which you operate; no other third-party API is called. |

6. Automatic review (beta) sends a PDF with findings to the same thread; fix, re-deploy, re-run the scenarios, reply. Then the manual review by Make QA, feedback in the same thread, then approval and a release date. Make gives no timeline; a few weeks is normal.

Listing copy for the make.com page, if asked (leads with the benefit):

> Connect your scenarios to your AI visibility and SEO data. Searcherries tracks how ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude and Grok present your brand for the questions your customers ask, which competitors and sources they name, and joins it with Google Search Console, Bing Webmaster Tools and GA4 AI-traffic data. The Make app reads that data: build weekly reports, alert on negative answers, push cited pages and search opportunities into your content planning, or feed the prioritized action plan into your task tracker.

## 8. After approval (you)

Make keeps a development version (*custom app* tag) next to the public one; every change to the public version goes through Make's approval again (*App maintenance → Updating your app*). Keep this repository as the source: deploy to the development version, test, then request the update.

## Open questions for you

1. App name: `searcherries` is assumed free in your zone. Confirm or pick another and update `src/makecomapp.json`.
2. Zone: `origins[0].baseUrl` is set to `https://eu1.make.com/api`; change it if your account lives elsewhere.
3. Logo rendering: Make inverts black to white and fills transparency with the theme. Check the module tile after upload; if the mark is too small, `assets/logo.svg` can be re-rendered with a tighter viewBox.
4. Module labels follow Make's naming rules (sentence case, "Search …" for filtered lists). The other catalogs (Pipedream, Activepieces) use Title Case "Get AI Answers"; this is intentional per Make's review checklist.
5. Make's docs say custom IML functions are enabled on request only, so the app uses none; all error formatting is built-in IML.
