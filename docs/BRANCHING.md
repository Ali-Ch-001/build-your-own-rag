# Branching Model

## Branches

### `main` — Production

- Reflects the currently deployed production state.
- Only updated via merge from `release/*` or `hotfix/*`.
- Tagged with semantic version on every merge (`git tag vX.Y.Z`).
- Protected: requires passing CI + at least 1 approving review. Direct pushes are blocked.

### `develop` — Integration

- Integration branch for ongoing development.
- All `feature/*` and `fix/*` branches are merged here first.
- Nightly staging deploys from this branch.
- Protected: requires passing CI. Direct pushes are blocked except for release manager.

### `feature/*` — New Functionality

- Branched from `develop`.
- Naming convention: `feature/<short-description>` (e.g., `feature/add-sso-login`).
- Merged back into `develop` via pull request after review and passing CI.
- Keep short-lived (< 5 business days); rebase on `develop` regularly.
- Delete branch after merge.

### `fix/*` — Non-Critical Bug Fixes

- Branched from `develop`.
- Naming convention: `fix/<issue-id>-<short-description>` (e.g., `fix/42-chunk-overlap-off-by-one`).
- Merged into `develop` via pull request.
- Delete branch after merge.

### `release/*` — Release Preparation

- Branched from `develop` when a release is imminent.
- Naming convention: `release/v<major>.<minor>` (e.g., `release/v1.2`).
- Only bug fixes, documentation, and release tasks committed here.
- Merged into `main` (with tag) AND back into `develop` after deployment.
- Protected: only release manager may push.

### `hotfix/*` — Critical Production Fixes

- Branched from `main` (or the relevant release tag).
- Naming convention: `hotfix/<issue-id>-<short-description>` (e.g., `hotfix/66-fix-auth-token-leak`).
- Merged into `main` (with tag) AND back into `develop` after deployment.
- Deployed directly to production after accelerated review.
- Protected: requires security team approval.

## Merge Flow

```
feature/* ──→ develop ──→ release/* ──→ main
fix/*    ──→                  ↑           ↑
                              └─── hotfix/* ──┘
```

## Rules

1. Never commit directly to `main` or `develop`.
2. All merges require a pull request with at least 1 approving review.
3. CI must pass (tests, lint, type-check, security scan) before merge.
4. Branch names must be lowercase, kebab-case.
5. Delete feature/fix branches after merge.
6. Keep `feature/*` and `fix/*` branches rebased on `develop` to avoid complex merges.
7. `hotfix/*` branches require security team sign-off before production deployment.
