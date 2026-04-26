# @andreas-timm/cli-table

Utilities for rendering borderless CLI tables on top of `cli-table3`.

## Motivation

CLI tools often need readable tables that fit the current terminal, stay useful when piped, and do not repeat low-level `cli-table3` styling at every call site. `@andreas-timm/cli-table` centralizes those defaults while keeping table rendering explicit and API-only.

## Features

- Borderless table output for terminal and piped CLI text.
- Smart column sizing with fixed, percent, content-fit, and fill columns.
- Optional word wrapping plus full-width inserted detail lines.
- Small rendering API only; callers keep control of their own CLI flags and option parsing.

## Install

```sh
npm install @andreas-timm/cli-table
```

## Usage

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

For the full API, layout rules, and examples, see [`skills/cli-table/SKILL.md`](./skills/cli-table/SKILL.md).

## Agent skill `cli-table`

This package ships a reusable agent skill for assistants that need to format CLI table output consistently.

- In this repo: [`skills/cli-table/SKILL.md`](./skills/cli-table/SKILL.md)
- After install:
  ```sh
    mkdir -p .agents/skills
    ln -sv ../../node_modules/@andreas-timm/cli-table/skills/cli-table .agents/skills/cli-table
  ```
