/**
 * Generic CSV export helper.
 * Handles BOM for Excel compatibility, proper quoting, and download trigger.
 */

export interface CSVColumn<T> {
    header: string;
    getValue: (row: T) => string | number | null | undefined;
}

/**
 * Exports data as a CSV file and triggers browser download.
 * @param filename - Name of the downloaded file (without extension)
 * @param columns - Column definitions with headers and value extractors
 * @param data - Array of data rows
 * @param separator - Column separator (default ";' for Excel BR compatibility)
 */
export function exportCSV<T>(
    filename: string,
    columns: CSVColumn<T>[],
    data: T[],
    separator = ";"
): void {
    const headers = columns.map((c) => c.header);

    const rows = data.map((row) =>
        columns.map((c) => {
            const val = c.getValue(row);
            const str = val == null ? "" : String(val);
            // Quote fields that contain separator, quotes, or newlines
            return `"${str.replace(/"/g, '""')}"`;
        }).join(separator)
    );

    const csvContent = [headers.join(separator), ...rows].join("\n");

    // BOM for UTF-8 Excel compatibility
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}
