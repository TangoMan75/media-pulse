# AGENTS.md - Media Pulse

## Commands

```bash
npm run scrape # Run the scraper
npm test       # Run all tests (Node.js test runner)
npm run lint   # Syntax check
```

## Architecture

- **Entry**: `media-pulse.js` (ES module)
- **Output**: Writes to `docs/` (NOT `dist/` - workflow has stale path)
- **Dependencies**: jsdom for HTML parsing
- **Node.js**: v22

## Testing

- Tests are in `test/unit/`
- Uses Node.js built-in test runner with `node:test`
- **Note**: README mentions `npm run test:unit` and `npm run test:functional` but these scripts don't exist in package.json. Use `npm test` instead.

## Gotchas

- Site IDs in code: `lemonde`, `obs`, `telerama`, `courrier`, `diplo` (not the full names from README)
- Metrics are averaged over last 12 months
- SVG and JSON files written per-site to `docs/`

## Maintenance

- Update `./specs/*.feature` file when script functionality changes (use Gherkin syntax)
- Update `README.md` file when script functionality changes
- Update `./test/unit/*.test.js` file when script functionality changes
- **ALWAYS update unit tests when making changes to the codebase**