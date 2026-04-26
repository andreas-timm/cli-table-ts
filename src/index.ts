import Table from "cli-table3";
import { attachInsertLine } from "./insert-line";

export type TableAlign = "left" | "center" | "right";
export type TableWidth = number | "terminal" | "full";
export type TableLayout = "smart" | "uniform";
export type TableColumnFit = "content" | "fill";

export type TableColumnOptions = {
    index: number;
    align?: TableAlign;
    width?: number;
    widthPercent?: number;
    fit?: TableColumnFit;
    minWidth?: number;
    maxWidth?: number;
};

export type TableOptions = {
    head?: string[];
    aligns?: Array<{
        index: number;
        type: TableAlign;
    }>;
    colWidths?: number[];
    columns?: TableColumnOptions[];
    columnGap?: number;
    tableWidth?: TableWidth;
    layout?: TableLayout;
    wordWrap?: boolean;
    wrapOnWordBoundary?: boolean;
};

export type InsertLineOptions = {
    indent?: number;
};

type TableLike = {
    length: number;
    toString: () => string;
    // biome-ignore lint/suspicious/noExplicitAny: cli-table3 rows are intentionally opaque here.
    push: (...rows: any[]) => number;
    // biome-ignore lint/suspicious/noExplicitAny: cli-table3 rows are intentionally opaque here.
    splice: (start: number, deleteCount?: number, ...items: any[]) => any[];
};

export type TableWithInsertLine = TableLike & {
    insertLine: (
        rowIndex: number,
        content: string,
        options?: InsertLineOptions,
    ) => void;
    pushLine: (content: string, options?: InsertLineOptions) => void;
};

type ColumnSizing = {
    fixedWidth?: number;
    widthPercent?: number;
    fit?: TableColumnFit;
    minWidth?: number;
    maxWidth?: number;
};

type TableLikeWithOptions = TableWithInsertLine &
    Array<unknown> & {
        options: {
            colWidths: Array<number | null>;
        };
    };

const ANSI_ESCAPE_PATTERN = new RegExp(
    `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
    "g",
);

export function terminalColumnWidth(fallback = 80): number {
    return process.stdout.columns ?? fallback;
}

export function isPipedOutput(
    stream: { isTTY?: boolean } = process.stdout,
): boolean {
    return stream.isTTY !== true;
}

export function resolveTableWidth(
    widthOpt: number | string | undefined,
    options?: { min?: number; fallback?: number },
): number {
    const min = options?.min ?? 20;
    const tty = terminalColumnWidth(options?.fallback ?? 80);

    if (widthOpt === undefined) {
        return tty;
    }

    const n =
        typeof widthOpt === "string" ? Number.parseInt(widthOpt, 10) : widthOpt;
    if (!Number.isFinite(n) || n < 0) {
        return tty;
    }
    if (n === 0) {
        return tty;
    }
    return Math.max(min, n);
}

export function createTable(options: TableOptions = {}): TableWithInsertLine {
    const head = options.head || [];

    // Determine the number of columns.
    // If head is provided, use its length.
    // Otherwise, check if aligns index implies more columns.
    let numColumns = head.length;
    if (options.aligns) {
        for (const align of options.aligns) {
            if (align.index >= numColumns) {
                numColumns = align.index + 1;
            }
        }
    }
    if (options.colWidths && options.colWidths.length > numColumns) {
        numColumns = options.colWidths.length;
    }
    if (options.columns) {
        for (const column of options.columns) {
            if (column.index >= numColumns) {
                numColumns = column.index + 1;
            }
        }
    }

    const colAligns: Array<TableAlign> = new Array(numColumns).fill("left");
    const colWidths: Array<number | null> = new Array(numColumns).fill(null);
    const columnSizing: ColumnSizing[] = [];

    if (options.colWidths) {
        for (const [index, width] of options.colWidths.entries()) {
            const fixedWidth = normalizeWidth(width);
            colWidths[index] = fixedWidth;
            sizingFor(columnSizing, index).fixedWidth = fixedWidth;
        }
    }

    if (options.aligns) {
        for (const align of options.aligns) {
            colAligns[align.index] = align.type;
        }
    }
    if (options.columns) {
        for (const column of options.columns) {
            const sizing = sizingFor(columnSizing, column.index);
            applyColumnSizing(sizing, column);

            if (column.align) {
                colAligns[column.index] = column.align;
            }
            if (column.width !== undefined) {
                colWidths[column.index] =
                    sizing.fixedWidth ?? normalizeWidth(column.width);
            }
        }
    }

    const columnGap = Math.max(0, options.columnGap ?? 1);

    const table = new Table({
        head: head.length > 0 ? head : undefined,
        colAligns,
        colWidths,
        wordWrap: options.wordWrap ?? false,
        wrapOnWordBoundary: options.wrapOnWordBoundary ?? true,
        chars: {
            top: "",
            "top-mid": "",
            "top-left": "",
            "top-right": "",
            bottom: "",
            "bottom-mid": "",
            "bottom-left": "",
            "bottom-right": "",
            left: "",
            "left-mid": "",
            mid: "",
            "mid-mid": "",
            right: "",
            "right-mid": "",
            middle: " ".repeat(columnGap),
        },
        style: { "padding-left": 0, "padding-right": 0, border: [] },
    });

    const tableWithInsertLine = attachInsertLine(table, {
        numColumns,
        getNumColumns: () =>
            resolveColumnCount(tableWithInsertLine, head, numColumns),
        wordWrap: options.wordWrap ?? false,
        wrapOnWordBoundary: options.wrapOnWordBoundary ?? true,
    }) as TableLikeWithOptions;

    const originalToString =
        tableWithInsertLine.toString.bind(tableWithInsertLine);
    tableWithInsertLine.toString = () => {
        tableWithInsertLine.options.colWidths = resolveColumnWidths(
            tableWithInsertLine,
            head,
            numColumns,
            columnSizing,
            columnGap,
            options.tableWidth ?? "terminal",
            options.layout ?? "smart",
        );
        return originalToString();
    };

    return tableWithInsertLine;
}

function applyColumnSizing(sizing: ColumnSizing, column: TableColumnOptions) {
    const modeCount =
        Number(column.width !== undefined) +
        Number(column.widthPercent !== undefined) +
        Number(column.fit !== undefined);

    if (modeCount > 1) {
        throw new Error(
            "Only one of width, widthPercent, or fit can be set for a table column.",
        );
    }

    if (column.minWidth !== undefined) {
        sizing.minWidth = normalizeWidth(column.minWidth);
    }
    if (column.maxWidth !== undefined) {
        sizing.maxWidth = normalizeWidth(column.maxWidth);
    }

    if (column.width !== undefined) {
        sizing.fixedWidth = normalizeWidth(column.width);
        sizing.widthPercent = undefined;
        sizing.fit = undefined;
        return;
    }

    if (column.widthPercent !== undefined) {
        if (sizing.fixedWidth !== undefined || sizing.fit !== undefined) {
            throw new Error(
                "Only one of width, widthPercent, or fit can be set for a table column.",
            );
        }
        if (
            !Number.isFinite(column.widthPercent) ||
            column.widthPercent < 0 ||
            column.widthPercent > 100
        ) {
            throw new Error("widthPercent must be a number between 0 and 100.");
        }
        sizing.widthPercent = column.widthPercent;
        return;
    }

    if (column.fit !== undefined) {
        if (
            sizing.fixedWidth !== undefined ||
            sizing.widthPercent !== undefined
        ) {
            throw new Error(
                "Only one of width, widthPercent, or fit can be set for a table column.",
            );
        }
        sizing.fit = normalizeColumnFit(column.fit);
    }
}

function resolveColumnWidths(
    table: TableLikeWithOptions,
    head: string[],
    baseNumColumns: number,
    columnSizing: ColumnSizing[],
    columnGap: number,
    tableWidth: TableWidth,
    layout: TableLayout,
): Array<number | null> {
    const numColumns = resolveColumnCount(table, head, baseNumColumns);
    if (numColumns === 0) {
        return [];
    }

    const sizing = Array.from(
        { length: numColumns },
        (_, index) => columnSizing[index] ?? {},
    );
    if (tableWidth === "full") {
        validateFullWidthSizing(sizing);
        const contentWidths = resolveContentWidths(table, head, numColumns);
        return sizing.map((column, index) => {
            if (column.fixedWidth !== undefined) {
                return column.fixedWidth;
            }
            if (column.fit === "content") {
                return clampComputedWidth(
                    contentWidths[index] ?? minWidthFor(column),
                    column,
                );
            }
            return null;
        });
    }

    const boundedWidth = resolveBoundedTableWidth(tableWidth);
    const contentBudget = Math.max(
        numColumns,
        boundedWidth - Math.max(0, numColumns - 1) * columnGap,
    );
    const widths: Array<number | undefined> = new Array(numColumns).fill(
        undefined,
    );

    for (let index = 0; index < numColumns; index += 1) {
        const fixedWidth = sizing[index]?.fixedWidth;
        if (fixedWidth !== undefined) {
            widths[index] = fixedWidth;
        }
    }

    for (let index = 0; index < numColumns; index += 1) {
        const widthPercent = sizing[index]?.widthPercent;
        if (widthPercent !== undefined) {
            const rawWidth = Math.floor((contentBudget * widthPercent) / 100);
            widths[index] = clampComputedWidth(rawWidth, sizing[index]);
        }
    }

    const contentColumns = collectFitColumns(
        numColumns,
        widths,
        sizing,
        "content",
    );
    if (contentColumns.length > 0) {
        const contentWidths = resolveContentWidths(table, head, numColumns);
        for (const index of contentColumns) {
            widths[index] = clampComputedWidth(
                contentWidths[index] ?? minWidthFor(sizing[index]),
                sizing[index],
            );
        }
    }

    const fillColumns = collectFitColumns(numColumns, widths, sizing, "fill");
    const autoColumns = collectAutoColumns(numColumns, widths, sizing);

    if (fillColumns.length > 0) {
        assignMinimums(widths, autoColumns, sizing);
        const remaining = contentBudget - sumAssignedWidths(widths);
        assignWeightedWidths(
            widths,
            fillColumns,
            remaining,
            fillColumns.map(() => 1),
            sizing,
        );
    } else if (autoColumns.length > 0) {
        const remaining = contentBudget - sumAssignedWidths(widths);
        const weights =
            layout === "uniform"
                ? autoColumns.map(() => 1)
                : resolveSmartWeights(table, head, numColumns, autoColumns);
        assignWeightedWidths(widths, autoColumns, remaining, weights, sizing);
    }

    for (let index = 0; index < numColumns; index += 1) {
        if (widths[index] === undefined) {
            widths[index] = minWidthFor(sizing[index]);
        }
    }

    return widths.map((width) => width ?? 1);
}

function validateFullWidthSizing(sizing: ColumnSizing[]) {
    for (const column of sizing) {
        if (column.widthPercent !== undefined || column.fit === "fill") {
            throw new Error(
                "widthPercent and fit: 'fill' require a bounded tableWidth.",
            );
        }
    }
}

function resolveBoundedTableWidth(
    tableWidth: Exclude<TableWidth, "full">,
): number {
    if (tableWidth === "terminal") {
        return terminalColumnWidth();
    }
    return normalizeWidth(tableWidth);
}

function collectAutoColumns(
    numColumns: number,
    widths: Array<number | undefined>,
    sizing: ColumnSizing[],
): number[] {
    const columns: number[] = [];
    for (let index = 0; index < numColumns; index += 1) {
        if (widths[index] !== undefined) {
            continue;
        }
        if (sizing[index]?.fit === undefined) {
            columns.push(index);
        }
    }
    return columns;
}

function collectFitColumns(
    numColumns: number,
    widths: Array<number | undefined>,
    sizing: ColumnSizing[],
    fit: TableColumnFit,
): number[] {
    const columns: number[] = [];
    for (let index = 0; index < numColumns; index += 1) {
        if (widths[index] === undefined && sizing[index]?.fit === fit) {
            columns.push(index);
        }
    }
    return columns;
}

function assignMinimums(
    widths: Array<number | undefined>,
    columns: number[],
    sizing: ColumnSizing[],
) {
    for (const index of columns) {
        widths[index] = minWidthFor(sizing[index]);
    }
}

function assignWeightedWidths(
    widths: Array<number | undefined>,
    columns: number[],
    budget: number,
    weights: number[],
    sizing: ColumnSizing[],
) {
    if (columns.length === 0) {
        return;
    }

    const minimums = columns.map((index) => minWidthFor(sizing[index]));
    const minTotal = minimums.reduce((sum, width) => sum + width, 0);
    const maxTotal = maxTotalFor(columns, sizing);
    const target = Math.max(
        minTotal,
        maxTotal === undefined ? budget : Math.min(budget, maxTotal),
    );
    const resolved = [...minimums];
    let remaining = target - minTotal;

    while (remaining > 0) {
        const active = columns
            .map((column, position) => ({ column, position }))
            .filter(({ column, position }) => {
                const maxWidth = maxWidthFor(sizing[column]);
                return (
                    maxWidth === undefined ||
                    (resolved[position] ?? 0) < maxWidth
                );
            });

        if (active.length === 0) {
            break;
        }

        const activeWeightTotal = active.reduce(
            (sum, { position }) => sum + Math.max(1, weights[position] ?? 1),
            0,
        );
        let distributed = 0;

        for (const { column, position } of active) {
            const currentWidth =
                resolved[position] ?? minWidthFor(sizing[column]);
            const maxWidth = maxWidthFor(sizing[column]);
            const capacity =
                maxWidth === undefined
                    ? remaining
                    : Math.max(0, maxWidth - currentWidth);
            const share = Math.floor(
                (remaining * Math.max(1, weights[position] ?? 1)) /
                    activeWeightTotal,
            );
            const add = Math.min(capacity, share);
            if (add > 0) {
                resolved[position] = currentWidth + add;
                distributed += add;
            }
        }

        remaining -= distributed;
        if (remaining <= 0) {
            break;
        }

        let addedOne = false;
        for (const { column, position } of active) {
            if (remaining <= 0) {
                break;
            }
            const currentWidth =
                resolved[position] ?? minWidthFor(sizing[column]);
            const maxWidth = maxWidthFor(sizing[column]);
            if (maxWidth !== undefined && currentWidth >= maxWidth) {
                continue;
            }
            resolved[position] = currentWidth + 1;
            remaining -= 1;
            addedOne = true;
        }

        if (!addedOne) {
            break;
        }
    }

    for (const [position, column] of columns.entries()) {
        widths[column] = resolved[position] ?? minWidthFor(sizing[column]);
    }
}

function clampComputedWidth(width: number, sizing?: ColumnSizing): number {
    const minWidth = minWidthFor(sizing);
    const maxWidth = maxWidthFor(sizing);
    const normalized = Math.max(minWidth, Math.floor(width));
    return maxWidth === undefined ? normalized : Math.min(normalized, maxWidth);
}

function maxTotalFor(
    columns: number[],
    sizing: ColumnSizing[],
): number | undefined {
    let total = 0;
    for (const index of columns) {
        const maxWidth = maxWidthFor(sizing[index]);
        if (maxWidth === undefined) {
            return undefined;
        }
        total += maxWidth;
    }
    return total;
}

function minWidthFor(sizing?: ColumnSizing): number {
    return sizing?.minWidth ?? 1;
}

function maxWidthFor(sizing?: ColumnSizing): number | undefined {
    if (sizing?.maxWidth === undefined) {
        return undefined;
    }
    return Math.max(minWidthFor(sizing), sizing.maxWidth);
}

function sumAssignedWidths(widths: Array<number | undefined>): number {
    return widths.reduce<number>((sum, width) => sum + (width ?? 0), 0);
}

function resolveContentWidths(
    table: TableLikeWithOptions,
    head: string[],
    numColumns: number,
): number[] {
    const { maxes } = resolveColumnMetrics(table, head, numColumns);
    return Array.from({ length: numColumns }, (_, index) =>
        Math.max(1, maxes[index] ?? 1),
    );
}

function resolveSmartWeights(
    table: TableLikeWithOptions,
    head: string[],
    numColumns: number,
    targetColumns: number[],
): number[] {
    const { totals, maxes, counts } = resolveColumnMetrics(
        table,
        head,
        numColumns,
    );

    return targetColumns.map((index) => {
        const count = counts[index] ?? 0;
        const average = count > 0 ? (totals[index] ?? 0) / count : 1;
        return Math.max(1, Math.ceil(((maxes[index] ?? 1) + average) / 2));
    });
}

function resolveColumnMetrics(
    table: TableLikeWithOptions,
    head: string[],
    numColumns: number,
) {
    const totals: number[] = new Array(numColumns).fill(0);
    const maxes: number[] = new Array(numColumns).fill(1);
    const counts: number[] = new Array(numColumns).fill(0);

    addArrayCellsToMetrics(head, totals, maxes, counts);
    for (const row of table) {
        addRowToMetrics(row, totals, maxes, counts);
    }

    return { totals, maxes, counts };
}

function addRowToMetrics(
    row: unknown,
    totals: number[],
    maxes: number[],
    counts: number[],
) {
    if (Array.isArray(row)) {
        addArrayCellsToMetrics(row, totals, maxes, counts);
        return;
    }

    if (!isRecord(row)) {
        return;
    }

    const key = Object.keys(row)[0];
    if (key === undefined) {
        return;
    }

    addCellToMetrics(0, key, totals, maxes, counts);
    const value = row[key];
    if (Array.isArray(value)) {
        addArrayCellsToMetrics(value, totals, maxes, counts, 1);
    } else {
        addCellToMetrics(1, value, totals, maxes, counts);
    }
}

function addArrayCellsToMetrics(
    cells: unknown[],
    totals: number[],
    maxes: number[],
    counts: number[],
    startColumn = 0,
) {
    let column = startColumn;
    for (const cell of cells) {
        const colSpan = cellColSpan(cell);
        const width = Math.max(
            1,
            Math.ceil(visibleTextWidth(cellContent(cell)) / colSpan),
        );
        for (let offset = 0; offset < colSpan; offset += 1) {
            addWidthToMetrics(column + offset, width, totals, maxes, counts);
        }
        column += colSpan;
    }
}

function addCellToMetrics(
    column: number,
    cell: unknown,
    totals: number[],
    maxes: number[],
    counts: number[],
) {
    addWidthToMetrics(
        column,
        visibleTextWidth(cellContent(cell)),
        totals,
        maxes,
        counts,
    );
}

function addWidthToMetrics(
    column: number,
    width: number,
    totals: number[],
    maxes: number[],
    counts: number[],
) {
    totals[column] = (totals[column] ?? 0) + width;
    maxes[column] = Math.max(maxes[column] ?? 1, width);
    counts[column] = (counts[column] ?? 0) + 1;
}

function resolveColumnCount(
    table: Array<unknown>,
    head: string[],
    baseNumColumns: number,
): number {
    let numColumns = Math.max(baseNumColumns, head.length);
    for (const row of table) {
        numColumns = Math.max(numColumns, rowColumnCount(row));
    }
    return numColumns;
}

function rowColumnCount(row: unknown): number {
    if (Array.isArray(row)) {
        return arrayColumnCount(row);
    }

    if (!isRecord(row)) {
        return 0;
    }

    const key = Object.keys(row)[0];
    if (key === undefined) {
        return 0;
    }

    const value = row[key];
    return Array.isArray(value) ? 1 + arrayColumnCount(value) : 2;
}

function arrayColumnCount(cells: unknown[]): number {
    return cells.reduce<number>((count, cell) => count + cellColSpan(cell), 0);
}

function cellColSpan(cell: unknown): number {
    if (
        isRecord(cell) &&
        typeof cell.colSpan === "number" &&
        Number.isFinite(cell.colSpan)
    ) {
        return Math.max(1, Math.floor(cell.colSpan));
    }
    return 1;
}

function cellContent(cell: unknown): unknown {
    if (isRecord(cell) && "content" in cell) {
        return cell.content;
    }
    return cell;
}

function visibleTextWidth(value: unknown): number {
    const text = value == null ? "" : String(value);
    const lines = stripAnsi(text).split("\n");
    return Math.max(0, ...lines.map((line) => Array.from(line).length));
}

function stripAnsi(text: string): string {
    return text.replace(ANSI_ESCAPE_PATTERN, "");
}

function sizingFor(sizing: ColumnSizing[], index: number): ColumnSizing {
    sizing[index] ??= {};
    return sizing[index] as ColumnSizing;
}

function normalizeWidth(width: number): number {
    if (!Number.isFinite(width)) {
        throw new Error("Table widths must be finite numbers.");
    }
    return Math.max(1, Math.floor(width));
}

function normalizeColumnFit(fit: TableColumnFit): TableColumnFit {
    if (fit !== "content" && fit !== "fill") {
        throw new Error("fit must be either 'content' or 'fill'.");
    }
    return fit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
