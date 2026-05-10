# Releasing the SDK

How to cut a new `@tracebee/sdk` version.

## One-time setup

- Authenticated to npm: `npm whoami` should print your username. If not,
  `npm login`.
- `main` branch protection enabled: require a pull request, require both
  CI status checks (`SDK (typecheck, test, build)` and `Web (typecheck,
  lint)`) to pass.
- pnpm installed; the version is pinned via `packageManager` in the root
  `package.json`.

## Release flow

### 1. Branch + bump version

```sh
git checkout -b release/<new-version>
cd packages/sdk
pnpm version patch --no-git-tag-version   # or minor / major
cd ../..
git add packages/sdk/package.json
git commit -m "chore(sdk): release <new-version>"
```

`--no-git-tag-version` is intentional. With squash-merge, any tag created
on the release branch points to a commit that gets discarded at merge
time. We tag on `main` after the squash, in step 4.

### 2. Verify what would publish

```sh
pnpm --filter @tracebee/sdk build
cd packages/sdk && pnpm pack --dry-run && cd ../..
```

The dry-run lists every file the tarball would contain. `*.test.ts`,
source `.ts` files, and stray dotfiles should not appear. If they do,
check `tsconfig.build.json` and the `files` array in `package.json`.

### 3. Open PR, wait for CI green, squash-merge

```sh
git push -u origin release/<new-version>
```

Open the PR in the browser (or `gh pr create --fill` if you have the
GitHub CLI). Wait for both CI jobs to pass, then squash-merge in the UI.

### 4. Tag the squashed commit on main

```sh
git checkout main
git pull
git tag v<new-version>
git push origin v<new-version>
```

### 5. Publish to npm

```sh
cd packages/sdk
pnpm publish
```

`prepublishOnly` cleans and rebuilds `dist/` from `tsconfig.build.json`
automatically before the upload.

## After publishing

- Verify on <https://www.npmjs.com/package/@tracebee/sdk> — new version listed.
- Smoke-test in a fresh project: `npm install @tracebee/sdk@latest`,
  follow the README quickstart, confirm a trace lands in the dashboard.
- Optional: create a GitHub release for the tag if you want changelog
  visibility.

## Gotchas

- **Squash merges discard the source commit's hash.** That's why the tag
  is created on `main` *after* merge, not on the release branch.
- **`pnpm publish` will fail if the version already exists on npm.** Bump
  the version even for a re-publish — npm forbids re-using a version,
  even after unpublishing within the 24-hour window.
- **No-op Vercel deploys.** Every release commit triggers a dashboard
  redeploy. Harmless. To suppress, include `[vercel skip]` in the merge
  commit message.
