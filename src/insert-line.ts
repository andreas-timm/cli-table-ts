type InsertLineOptions = {
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

type TableWithInsertLine = TableLike & {
    insertLine: (
        rowIndex: number,
        content: string,
        options?: InsertLineOptions,
    ) => void;
    pushLine: (content: string, options?: InsertLineOptions) => void;
};

export type InsertLineConfig = {
    numColumns: number;
    getNumColumns?: () => number;
    wordWrap: boolean;
    wrapOnWordBoundary: boolean;
};

export function attachInsertLine(
    table: TableLike,
    config: InsertLineConfig,
): TableWithInsertLine {
    const tableWithInsertLine = table as TableWithInsertLine;
    const insert = (
        rowIndex: number,
        content: string,
        insertOptions: InsertLineOptions = {},
    ) => {
        const indent = Math.max(0, insertOptions.indent ?? 4);
        const indentText = " ".repeat(indent);
        const renderedWidth = resolveRenderedTableWidth(tableWithInsertLine);

        const wrapped =
            config.wordWrap && renderedWidth > indent
                ? wrapWithIndent(
                      content,
                      renderedWidth,
                      indentText,
                      config.wrapOnWordBoundary,
                  )
                : `${indentText}${content}`;

        const row = [
            {
                content: wrapped,
                colSpan: Math.max(
                    1,
                    config.getNumColumns?.() ?? config.numColumns,
                ),
            },
        ];

        const normalizedRowIndex = Math.max(
            0,
            Math.min(rowIndex, tableWithInsertLine.length),
        );
        tableWithInsertLine.splice(normalizedRowIndex, 0, row);
    };
    tableWithInsertLine.insertLine = insert;
    tableWithInsertLine.pushLine = (
        content: string,
        insertOptions: InsertLineOptions = {},
    ) => {
        insert(tableWithInsertLine.length, content, insertOptions);
    };

    return tableWithInsertLine;
}

function resolveRenderedTableWidth(table: TableLike): number {
    const output = table.toString();
    if (output.trim().length > 0) {
        return Math.max(...output.split("\n").map((line) => line.length));
    }

    const tableOptions = table as unknown as {
        options?: {
            colWidths?: Array<number | null>;
            chars?: { middle?: string };
        };
    };
    const colWidths = tableOptions.options?.colWidths ?? [];
    let configuredWidth = 0;
    for (const width of colWidths) {
        if (typeof width === "number") {
            configuredWidth += width;
        }
    }
    const colCount = colWidths.length;
    const separatorWidth =
        Math.max(0, colCount - 1) *
        (tableOptions.options?.chars?.middle?.length ?? 1);

    return configuredWidth + separatorWidth;
}

function wrapWithIndent(
    text: string,
    maxWidth: number,
    indent: string,
    wrapOnWordBoundary: boolean,
): string {
    const contentWidth = Math.max(1, maxWidth - indent.length);
    const source = text.replace(/\r\n/g, "\n");
    const paragraphs = source.split("\n");

    const wrappedParagraphs = paragraphs.map((paragraph) => {
        if (paragraph.length === 0) {
            return indent;
        }
        const pieces = wrapOnWordBoundary
            ? splitWordBoundary(paragraph, contentWidth)
            : splitHard(paragraph, contentWidth);
        return pieces.map((piece) => `${indent}${piece}`).join("\n");
    });

    return wrappedParagraphs.join("\n");
}

function splitHard(text: string, maxLength: number): string[] {
    const lines: string[] = [];
    let index = 0;
    while (index < text.length) {
        lines.push(text.slice(index, index + maxLength));
        index += maxLength;
    }
    return lines.length > 0 ? lines : [""];
}

function splitWordBoundary(text: string, maxLength: number): string[] {
    const words = text.trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === "")) {
        return [""];
    }

    const lines: string[] = [];
    let current = "";

    for (const word of words) {
        if (word.length > maxLength) {
            if (current.length > 0) {
                lines.push(current);
                current = "";
            }
            lines.push(...splitHard(word, maxLength));
            continue;
        }

        const candidate = current.length === 0 ? word : `${current} ${word}`;
        if (candidate.length <= maxLength) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
        }
    }

    if (current.length > 0) {
        lines.push(current);
    }

    return lines.length > 0 ? lines : [""];
}
