# dsh-web-access

Web search, URL extraction, and video/PDF/GitHub understanding for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

English | [中文](#中文)

This plugin ports the [pi-web-access](https://github.com/nicobailon/pi-web-access) product onto dsh:

- `web_search` / `web_access_search` with 20+ providers and fallback
- `fetch_content` for pages, GitHub clones, PDFs, YouTube, and local video
- `get_search_content` for stored slices and passage find
- `source_check` for claim verification
- optional `ctx.web` providers so official `web_search` / `web_fetch` can use the same backends
- `/websearch`, `/curator`, `/search`, `/google-account`, `/webaccess`
- Web UI overlay: activity monitor (`Ctrl+Shift+W`), curator pane (`Ctrl+Shift+S`), and a config panel
- Official `card: 'web'` search/fetch cards, background-fetch notices, and image attachments when `ctx.attachments` is present

It is an independent plugin. It is not affiliated with DeepSeek AI.

## Install

```sh
dsh plugin --profile web add dsh-web-access
```

If the profile already has official `@deepseek-ai/dsh-tool-web` `web_search`, this plugin registers as `web_access_search` instead of colliding. Set `replaceOfficialSearch: true` or disable official search to keep the `web_search` name.

```yaml
- id: dsh-web-access
  name: dsh-web-access
  config:
    replaceOfficialSearch: false
    registerProviders: true
```

To point official tools at this backend:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: web-access
    fetchProvider: web-access
```

## Config

Reads `web-access.json` or the older `web-search.json` from:

1. `$DSH_WEB_ACCESS_DIR`
2. `$PI_CODING_AGENT_DIR` (so existing pi-web-access configs just work)
3. `$DSH_HOME`
4. `$XDG_CONFIG_HOME/dsh` or `$XDG_CONFIG_HOME/pi`
5. `~/.dsh` or `~/.pi`

A zero-config Exa / DuckDuckGo / SearXNG setup works the same way as pi-web-access. Add provider keys for more backends.

## Tools

```ts
web_search({ query: "TypeScript 5.9 rewriteRelativeImportExtensions" })
web_search({ queries: ["query 1", "query 2"], workflow: "auto-summary" })
fetch_content({ url: "https://docs.example.com/guide" })
fetch_content({ url: "https://github.com/owner/repo" })
fetch_content({ url: "https://youtube.com/watch?v=abc", prompt: "What libraries are shown?" })
get_search_content({ responseId: "abc123", urlIndex: 0 })
source_check({ claim: "The API supports streaming responses" })
```

Default workflow is `auto-summary` (generate a summary without opening the curator; deterministic if no summary model is available). `summary-review` opens the HTTP curator and prints a URL. If the curator cannot auto-open a browser, open the printed URL manually.

Provider keys such as `jinaApiKey` / `JINA_API_KEY` enable [Jina Search](https://s.jina.ai) (`jina`). Config example: `"summaryGenerationDeadlineMs": 30000`. `summaryGenerationDeadlineMs` is capped at `600000`.

## License

[MIT](LICENSE)

Inspired by [pi-web-access](https://github.com/nicobailon/pi-web-access) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 DeepSeek Harness 用的联网插件：多提供方搜索回退、带 SSRF 的抓取，以及 GitHub / PDF / YouTube 提取。

```sh
dsh plugin --profile web add dsh-web-access
```

官方已经挂了 `web_search` 时，本插件会改用 `web_access_search`，避免重名。现有 `~/.pi/web-search.json` 可以直接接着用。
