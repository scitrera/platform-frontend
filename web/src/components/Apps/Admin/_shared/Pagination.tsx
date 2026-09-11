interface Props {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (next: number) => void;
}

export function Pagination({page, pageSize, total, onPageChange}: Props) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return (
        <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Page {page} of {totalPages} · {total} item(s)</span>
            <div className="flex gap-2">
                <button
                    className="px-2 py-1 rounded border disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >Prev</button>
                <button
                    className="px-2 py-1 rounded border disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                >Next</button>
            </div>
        </div>
    );
}
