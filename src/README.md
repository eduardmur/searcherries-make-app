Searcherries
============

Connect your Make scenarios to the AI visibility, search and traffic data Searcherries stores for your projects: how your brand appears in ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude and Grok, the competitors and sources those platforms name, Google Search Console and Bing Webmaster Tools snapshots, GA4 traffic from AI assistants, and a prioritized action plan.

The app reads the [Searcherries REST API](https://searcherries.com/docs/api/overview). It never changes a project and never calls Google, Bing or an AI platform on your behalf: every module returns data Searcherries has already collected, and each output says when it was fetched.

Connection
----------

1. Sign in to Searcherries and open <https://app.searcherries.com/mcp>.
2. Open the **Other clients** tab, click **Create token** and copy the personal access token (it is shown once).
3. In Make, create a Searcherries connection and paste the token.

Every plan can connect: free accounts read projects, search performance, AI traffic and the action plan; AI answers, competitors and citations need Starter or Pro (an active trial counts). The connection is labelled with the first project of the account.

Modules
-------

| Module | Returns |
| --- | --- |
| List projects | The projects of the account with status, tracked AI platforms, connected sources and data counts. |
| Get a project summary | One compact snapshot of a project (profile, questions, KPIs, insights, competitors, citations, search and AI traffic totals, connections, latest recommendation). |
| Get an action plan | Up to ten prioritized actions with evidence, owner, success measure and report link. |
| Search AI answers | Stored AI answers with their judgments, cited URLs and web searches; filter by question, platform, prominence, flags and dates. |
| List competitors | Brands the AI platforms name, ranked for the period, or the month-by-month history. |
| Get a competitor | One brand with every highlight and per-platform numbers. |
| Search citations | Cited URLs or domains, with platforms and the questions they appeared for. |
| Get search performance | Google Search Console or Bing Webmaster Tools data for one window: totals with the top-10 lists, opportunities or trends. |
| List search performance rows | One row per query, page or country, per country with its top queries, per question-shaped query, per day or per month. |
| Get AI traffic | GA4 traffic from AI assistants for one window: all-site and AI-traffic totals with one row per AI source. |
| List AI traffic rows | One row per landing page, per AI source (with top landing pages and referrers), per day or per month. |
| Make an API call | Any `GET` endpoint of the API. |

Limits
------

30 requests per minute per account on Free, 60 on Starter, 120 on Pro. Paginated modules fetch further pages on their own up to the module's **Limit**.

Documentation: <https://searcherries.com/docs/api/endpoints> · Support: <https://searcherries.com/docs/account/support>
