# dsh-web-access

Web search, URL extraction, and video/PDF/GitHub understanding for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

`0.0.1` is a **name reservation + installable bundle stub**. The `ctx.web` providers land next.

English | [中文](#中文)

## Why this exists

DeepSeek Harness already ships official `web_search` / `web_fetch` tools via [`@deepseek-ai/dsh-tool-web`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/web/tool-web). Providers register on `ctx.web`. That seam is real, but thin:

- search is **one provider at a time** — multiple usable backends become `WEB_PROVIDER_AMBIGUOUS`
- the request is just `query` + `maxResults` (no recency, domain filter, or fallback chain)
- fetch is anonymous HTTP(S) only; **SSRF is deferred**, so official compositions keep `web_fetch` disabled
- GitHub clone, PDF engines, YouTube/local video, blocked-page fallbacks, and source checking are out of scope

[pi-web-access](https://github.com/nicobailon/pi-web-access) already solved that product: zero-config Exa, 20+ search providers with fallback, Readability + hosted extractors, GitHub cloning, PDF, YouTube, and a content cache.

This plugin ports that **product contract** onto dsh. It does **not** fork the Pi host layer, and it does **not** register a second `web_search` tool.

## Status

| Piece | 0.0.1 |
|---|---|
| npm name `dsh-web-access` | reserved |
| `dsh plugin add` bundle stub | yes |
| `ctx.web` search provider (fallback chain) | not yet |
| `ctx.web` fetch provider (SSRF + extraction) | not yet |
| GitHub / PDF / YouTube extras | not yet |

## Install

```sh
dsh plugin --profile web add dsh-web-access
```

The stub loads and prints a placeholder log line. It does not search or fetch yet.

## Planned shape

- one search provider id on `ctx.web` that internally runs the pi-web-access fallback chain
- one fetch provider with SSRF, Readability, and hosted fallbacks
- extra tools only for things the seam cannot represent (YouTube/video frames, GitHub clone cache, `source_check`)
- keep official `web_search` / `web_fetch` names — do not collide with `@deepseek-ai/dsh-tool-web`

It is an independent plugin. It is not affiliated with DeepSeek AI.

## License

[MIT](LICENSE)

Inspired by [pi-web-access](https://github.com/nicobailon/pi-web-access) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的联网插件：多提供方搜索回退、带 SSRF 的抓取，以及 GitHub / PDF / YouTube 提取。

`0.0.1` 只抢注 npm 名并提供可安装的 bundle 占位。实现随后补上。

```sh
dsh plugin --profile web add dsh-web-access
```
