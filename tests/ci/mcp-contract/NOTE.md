# Frozen — pending migration to `inflight-vite/apps/mcp`

These tests are **not** part of automated CI. They were originally built here on the assumption that the Inflight MCP server accepted personal access tokens; it doesn't (OAuth-only, see `apps/api/src/routes/mcp.ts` in `inflight-vite`).

**Do not extend these files.** New MCP contract work should go in `inflight-vite/apps/mcp/src/__tests__/`.

See the migration plan: [`../../../docs/superpowers/plans/2026-05-27-migrate-mcp-contract-tests-to-inflight-vite.md`](../../../docs/superpowers/plans/2026-05-27-migrate-mcp-contract-tests-to-inflight-vite.md).

## Known issues with the current files

The schemas in `schemas/` and the test in `contract.test.ts` were written before the actual tool responses were verified against `apps/mcp/src/tools/*.ts`. Every schema has wrong field names/shapes (e.g., `inflight_get_workspaces` returns `{ workspaces: [...], default_workspace_id }`, not a bare array; `inflight_get_version_report` returns Markdown text, not JSON). The migration plan above lists the corrected shapes.

## When this directory can be deleted

After the `inflight-vite/apps/mcp/src/__tests__/contract.test.ts` work lands and is green in CI, delete this whole directory plus `tests/src/mcp-client.ts` and update `tests/README.md` to drop the MCP contract section.
