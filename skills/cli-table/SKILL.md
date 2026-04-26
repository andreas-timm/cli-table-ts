---
name: cli-table
description: Use `@andreas-timm/cli-table` in TypeScript or Node.js projects to render borderless CLI tables with terminal-aware widths, column alignment, fixed/percent/content/fill sizing, word wrapping, and inserted detail lines.
---

# CLI tables with `@andreas-timm/cli-table`

Use this skill when a project needs readable tabular terminal output. The package wraps `cli-table3` with borderless defaults and higher-level width controls.

This skill is for humans and AI agents working in projects that use `@andreas-timm/cli-table` as a dependency.

## Install cli-table skill

```sh
mkdir -p .agents/skills
ln -sv ../../node_modules/@andreas-timm/cli-table/skills/cli-table .agents/skills/cli-table
```

## Quick use

```ts
import { createTable, isPipedOutput } from '@andreas-timm/cli-table';

const table = createTable({
  tableWidth: isPipedOutput() ? 'full' : 'terminal',
  wordWrap: true,
  columns: [
    { index: 0, width: 6, align: 'right' },
    { index: 1, widthPercent: 25 },
    { index: 2, fit: 'fill' },
  ],
});

table.push(['1', 'build', 'Long description']);
table.pushLine('Indented details wrap with the table when wordWrap is enabled.');

console.log(table.toString());
```

`createTable()` returns a `cli-table3`-compatible table with `.push()` and `.toString()`, plus:

- `pushLine(content, options?)`: append one full-width detail line.
- `insertLine(rowIndex, content, options?)`: insert one full-width detail line before a row.
- `options.indent`: left indent for detail lines, default `4`.

When `wordWrap` is enabled, detail lines wrap to the rendered table width and keep their indent.

## Defaults

- Output is borderless: no ASCII box lines.
- `tableWidth` defaults to `'terminal'`.
- `layout` defaults to `'smart'`, so unset columns are distributed from pushed row content.
- Widths are resolved lazily in `toString()`, after rows have been pushed.
- The package is API-only. It does not provide a `bin`, parse `process.argv`, or create CLI flags.

## Options

| Option | Use |
| --- | --- |
| `head` | Header labels. Empty or omitted means no header row. |
| `columns` | Preferred per-column config: `{ index, align, width, widthPercent, fit, minWidth, maxWidth }`. |
| `aligns` | Legacy alignment config: `{ index, type }`. |
| `colWidths` | Legacy fixed widths by column index. |
| `columnGap` | Spaces between columns. Default `1`; negative values clamp to `0`. |
| `tableWidth` | `number`, `'terminal'`, or `'full'`. |
| `layout` | `'smart'` or `'uniform'`. |
| `wordWrap` | Wrap long cell content. Default `false`. |
| `wrapOnWordBoundary` | Wrap on word boundaries. Default `true`. |

Prefer `columns` for new code. `columns[].align` overrides `aligns` for the same column, and `columns[].width` overrides `colWidths[index]`.

## Widths

Choose one sizing mode per final column:

- `width`: exact fixed width.
- `widthPercent`: percentage of the content budget, from `0` to `100`.
- `fit: 'content'`: widest visible header/body cell, clamped by `minWidth` / `maxWidth`.
- `fit: 'fill'`: share remaining bounded width among fill columns.

Rules:

- `minWidth` defaults to `1`.
- `maxWidth` caps computed widths only; exact `width` / `colWidths` are not capped.
- `tableWidth: 'full'` disables package width limiting and lets `cli-table3` auto-size unset columns.
- `widthPercent` and `fit: 'fill'` require bounded width, so they cannot be used with `tableWidth: 'full'`.
- If no fill columns exist, unset columns use `layout: 'smart'` or `layout: 'uniform'`.

## Helpers

```ts
import {
  isPipedOutput,
  resolveTableWidth,
  terminalColumnWidth,
} from '@andreas-timm/cli-table';
```

- `isPipedOutput(stream = process.stdout)`: returns `stream.isTTY !== true`.
- `terminalColumnWidth(fallback = 80)`: returns `process.stdout.columns ?? fallback`.
- `resolveTableWidth(widthOpt, options?)`: convert caller-provided width input to a number.

`resolveTableWidth()` does not configure a table by itself. Use it after parsing project-specific config or CLI options, then pass the result as `tableWidth`.

## Recipes

**Right-align a numeric column**

```ts
const table = createTable({
  head: ['Name', 'Count'],
  columns: [{ index: 1, align: 'right' }],
});

table.push(['widgets', '42']);
```

**Fixed, percent, and fill columns**

```ts
const table = createTable({
  tableWidth: 'terminal',
  wordWrap: true,
  columns: [
    { index: 0, width: 6, align: 'right' },
    { index: 1, widthPercent: 30 },
    { index: 2, fit: 'fill' },
  ],
});
```

**Inserted detail line**

```ts
const table = createTable({
  colWidths: [12, 12],
  wordWrap: true,
});

table.push(['row 1', 'ok']);
table.pushLine('additional detail for the previous row', { indent: 4 });
```
