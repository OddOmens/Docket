# Contributing

Suggestions and fixes are welcome.

1. **Fork** the repository and make your change on a branch in your fork.
2. Run the checks locally (you only need Docker and Node):
   - `make test` for the Go tests.
   - `npm run build` in `frontend/`.
3. Open a **pull request** against `main`, saying what it changes and why.

Docket's security model is short and strict, so please keep to it:

- One owner account. API tokens never reach the account, sessions or other tokens, and can't delete a product or empty the trash.
- Every change to a product or item is written to the activity log with who made it (you, or the token's name).
- Markdown is sanitised before it's shown, and the Content Security Policy stays as strict as it is.
- Nothing may grow without a limit: new tables, caches and logs need pruning.

Docket is licensed under the [GNU AGPL v3.0](LICENSE). By opening a pull request you agree that your contribution is licensed under it too.

For a bug or an idea you'd rather not code yourself, open an issue. For a **security problem**, don't open an issue or pull request; see [SECURITY.md](SECURITY.md).
