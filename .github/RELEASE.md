# Release

1. Bump `version` in `package.json`, `cli.js`, and `index.js` log text.
2. Add a `CHANGELOG.md` section for that version.
3. Commit, then tag and push:

```sh
git tag v0.0.1
git push origin main --tags
```

The `Release` workflow publishes to npm (`dsh-web-access`) and creates a GitHub Release.

Required repository secret:

- `NPM_TOKEN` — npm granular access token with read/write for `dsh-web-access`

The workflow uses the `npm` GitHub Environment. Create it once under repo Settings → Environments if it does not exist.
