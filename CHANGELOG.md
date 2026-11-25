# Changelog

All notable changes to Docket. Versions follow [semantic versioning](https://semver.org); each release's section here becomes its GitHub release notes.

## [Unreleased]

## [0.1.0] - 2026-11-25

First public release.

### Added

- **Products** with a short key, status, sidebar sections, icon, colour, version and links.
- **Items**: features, bugs, tasks, improvements, chores and ideas, numbered per product, with status, severity, labels, dates, milestones, a Markdown body, comments and a full change history.
- **Inbox** for items that don't have a product yet.
- **Views**: a home overview, boards, a filterable list, a calendar and milestones with progress.
- **REST API and MCP** at `/mcp`, so Claude or any MCP client can read and update the tracker with a read-only or read-write token you can revoke.
- **Sign-in** with Argon2id passwords, optional two-factor codes, a one-time setup code and sign-in limits; a trash for deleted items and a daily database snapshot.
- Images for x86-64 and ARM64 on GitHub Container Registry: `ghcr.io/oddomens/docket`.

[Unreleased]: https://github.com/OddOmens/Docket/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OddOmens/Docket/releases/tag/v0.1.0
