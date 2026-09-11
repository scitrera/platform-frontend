import {useState, useCallback} from 'react';

/**
 * usePagination - manages pagination state for list views.
 *
 * Usage in dynamic JSX:
 *   const pager = usePagination(
 *     (page, pageSize) => rpcToolCall("items_list", { page, per_page: pageSize }),
 *     20
 *   );
 *   // pager.items, pager.page, pager.loading, pager.nextPage(), pager.prevPage(), pager.goToPage(n)
 *
 * @param {function} fetcher - async (page, pageSize) => { items: [], total: number }
 * @param {number} [pageSize=20] - items per page
 * @returns {object} pagination state and controls
 */
export function usePagination(fetcher, pageSize = 20) {
    const [page, setPage] = useState(1);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const fetchPage = useCallback(async (targetPage) => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetcher(targetPage, pageSize);
            setItems(result.items || []);
            setTotal(result.total || 0);
            setPage(targetPage);
        } catch (err) {
            setError(err?.message || err);
        } finally {
            setLoading(false);
        }
    }, [fetcher, pageSize]);

    const nextPage = useCallback(() => {
        if (hasNext) fetchPage(page + 1);
    }, [hasNext, page, fetchPage]);

    const prevPage = useCallback(() => {
        if (hasPrev) fetchPage(page - 1);
    }, [hasPrev, page, fetchPage]);

    const goToPage = useCallback((n) => {
        const clamped = Math.max(1, Math.min(n, totalPages));
        fetchPage(clamped);
    }, [totalPages, fetchPage]);

    return {
        items, total, page, pageSize, totalPages,
        loading, error,
        hasNext, hasPrev,
        nextPage, prevPage, goToPage,
        refetch: () => fetchPage(page),
    };
}
