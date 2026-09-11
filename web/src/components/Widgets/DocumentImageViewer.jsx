import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    Maximize,
    RotateCcw,
    FileText,
    Loader2,
    AlertCircle
} from 'lucide-react';

/**
 * DocumentViewer Component
 * @param {string} docId - Unique identifier for the document
 * @param {number} totalPages - Total count of pages in the document
 * @param {function} fetchPageUrls - Async function(docId, pageNos[]) -> Promise<{pageNo: number, url: string}[]>
 * @param {string} docTitle - (Optional) Title of the document
 * @param {number} initialPage - (Optional) Page to start on (1-indexed)
 * @param {boolean} hideControls - (Optional) Whether to hide the toolbar
 * @param {number} overscanCount - (Optional) How many pages ahead/behind to pre-fetch. Default 2.
 */
const DocumentImageViewer = ({
                                 docId,
                                 totalPages,
                                 fetchPageUrls,
                                 docTitle = null,
                                 initialPage = 1,
                                 hideControls = false,
                                 overscanCount = 2
                             }) => {
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [zoom, setZoom] = useState(100);
    const [pageCache, setPageCache] = useState({}); // { [pageNo]: url }
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isInputFocused, setIsInputFocused] = useState(false);

    // Keep track of which pages we have currently requested to avoid duplicate network calls
    const pendingRequestsRef = useRef(new Set());

    // Keep track of retries per page to handle expired tokens without infinite loops
    const failedPagesRef = useRef(new Map()); // { pageNo: retryCount }

    // Reset state when docId changes
    useEffect(() => {
        setPageCache({});
        setCurrentPage(initialPage);
        pendingRequestsRef.current.clear();
        failedPagesRef.current.clear();
    }, [docId, initialPage]);

    // The Core Fetching Logic
    const loadPages = useCallback(async (targetPage) => {
        if (!docId) return;

        // 1. Determine the range of pages we want (Target + Neighbors)
        const pagesNeeded = [];
        const start = Math.max(1, targetPage - overscanCount);
        const end = Math.min(totalPages, targetPage + overscanCount);

        for (let i = start; i <= end; i++) {
            // If not in cache and not currently being fetched
            if (!pageCache[i] && !pendingRequestsRef.current.has(i)) {
                pagesNeeded.push(i);
            }
        }

        if (pagesNeeded.length === 0) return;

        // 2. Mark as pending
        pagesNeeded.forEach(p => pendingRequestsRef.current.add(p));

        // Only set global loading if the *current* page is missing
        if (!pageCache[targetPage]) {
            setIsLoading(true);
            setError(null);
        }

        try {
            // 3. Fetch data
            const results = await fetchPageUrls(docId, pagesNeeded);

            // 4. Update Cache
            setPageCache(prev => {
                const newCache = {...prev};
                results.forEach(item => {
                    newCache[item.pageNo] = item.url;
                });
                return newCache;
            });
        } catch (err) {
            console.error("Failed to fetch pages:", err);
            setError("Failed to load document pages. Please try again.");
        } finally {
            // 5. Cleanup
            pagesNeeded.forEach(p => pendingRequestsRef.current.delete(p));
            setIsLoading(false);
        }
    }, [docId, totalPages, pageCache, fetchPageUrls, overscanCount]);

    // Trigger load when page changes
    useEffect(() => {
        loadPages(currentPage);
    }, [currentPage, loadPages]);

    // Handlers
    const handlePrev = () => {
        if (currentPage > 1) setCurrentPage(p => p - 1);
    };

    const handleNext = () => {
        if (currentPage < totalPages) setCurrentPage(p => p + 1);
    };

    const handleZoomIn = () => setZoom(z => Math.min(z + 25, 200));
    const handleZoomOut = () => setZoom(z => Math.max(z - 25, 50));
    const handleResetZoom = () => setZoom(100);

    const handlePageInput = (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
            setCurrentPage(val);
        }
    };

    // Handle expired tokens or broken images
    const handleImageError = () => {
        console.warn(`[DocumentViewer] Failed to load image for page ${currentPage}. Token might be expired.`);

        const currentRetries = failedPagesRef.current.get(currentPage) || 0;

        // Allow up to 3 retries for a specific page to fetch a fresh URL
        if (currentRetries < 3) {
            failedPagesRef.current.set(currentPage, currentRetries + 1);

            // Remove stale URL from cache
            setPageCache(prev => {
                const newCache = {...prev};
                delete newCache[currentPage];
                return newCache;
            });

            // Trigger re-fetch for this specific page (fresh token)
            setTimeout(() => loadPages(currentPage), 50);
        } else {
            setError("Failed to load image. The document might be unavailable.");
            setIsLoading(false);
        }
    };

    const handleImageLoad = () => {
        setIsLoading(false);
        // Successful load? Clear retry count for this page
        if (failedPagesRef.current.has(currentPage)) {
            failedPagesRef.current.delete(currentPage);
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isInputFocused) return; // Don't nav if typing in the page number box

            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentPage, totalPages, isInputFocused]);

    const currentImageUrl = pageCache[currentPage];
    const docDisplayTitle = docTitle || `Document ${docId.slice(0, 8)}...`;

    return (
        <div
            className="flex flex-col h-full min-h-0 min-w-0 bg-gray-100 rounded-lg overflow-hidden border border-gray-300 shadow-sm font-sans">

            {/* --- Toolbar --- */}
            {!hideControls && (
                <div
                    className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm z-10 shrink-0">

                    {/* Left: Page Navigation */}
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handlePrev}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-gray-700"
                            title="Previous Page (Left Arrow)"
                        >
                            <ChevronLeft size={20}/>
                        </button>

                        <div className="flex items-center text-sm font-medium text-gray-600 space-x-2">
                            <span>Page</span>
                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                value={currentPage}
                                onChange={handlePageInput}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                            <span className="text-gray-400">/ {totalPages}</span>
                        </div>

                        <button
                            onClick={handleNext}
                            disabled={currentPage === totalPages}
                            className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-gray-700"
                            title="Next Page (Right Arrow)"
                        >
                            <ChevronRight size={20}/>
                        </button>
                    </div>

                    {/* Center: Title/Status (Mobile Hidden usually, but kept simple here) */}
                    <div className="hidden md:flex items-center text-xs text-gray-400 font-mono">
                        {docDisplayTitle}
                    </div>

                    {/* Right: Zoom Controls */}
                    <div className="flex items-center space-x-1 border-l pl-2 border-gray-200">
                        <button
                            onClick={handleZoomOut}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut size={18}/>
                        </button>
                        <span className="text-xs font-medium w-10 text-center text-gray-600">{zoom}%</span>
                        <button
                            onClick={handleZoomIn}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn size={18}/>
                        </button>
                        <button
                            onClick={handleResetZoom}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors ml-1"
                            title="Reset Zoom"
                        >
                            <Maximize size={16}/>
                        </button>
                    </div>
                </div>
            )}

            {/* --- Main Viewport --- */}
            {/* Scroll inside the viewer; prevent parent growth and allow internal pan when zoomed */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto relative bg-gray-100 flex items-start justify-center p-4 md:p-8" style={{height: '100%'}}>

                {/* Loading State */}
                {isLoading && !currentImageUrl && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100/80 z-20">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3"/>
                        <p className="text-gray-500 font-medium">Loading Page {currentPage}...</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div
                        className="flex flex-col items-center text-red-500 bg-white p-6 rounded-lg shadow-md border border-red-100">
                        <AlertCircle size={32} className="mb-2"/>
                        <p>{error}</p>
                        <button
                            onClick={() => loadPages(currentPage)}
                            className="mt-4 px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors text-sm font-medium"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* The Document Page */}
                {currentImageUrl && !error && (
                    <div
                        className="bg-white shadow-2xl transition-all duration-200 ease-out origin-top"
                        style={{
                            width: `${800 * (zoom / 100)}px`, // Base width 800px scaled by zoom
                            maxWidth: zoom <= 100 ? '100%' : 'none', // Allow overflow if zoomed in
                            height: 'auto'
                        }}
                    >
                        <img
                            src={currentImageUrl}
                            alt={`Page ${currentPage}`}
                            className="w-full h-auto block select-none"
                            draggable={false}
                            onLoad={handleImageLoad}
                            onError={handleImageError}
                        />
                    </div>
                )}

                {/* Empty State / Initial Placeholder */}
                {!currentImageUrl && !isLoading && !error && (
                    <div className="text-gray-400 flex flex-col items-center">
                        <FileText size={48} className="mb-2 opacity-20"/>
                        <p>No page loaded</p>
                    </div>
                )}
            </div>

            {/* Footer Info (if controls hidden, optional feedback) */}
            {hideControls && (
                <div
                    className="absolute bottom-4 right-4 bg-black/75 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
                    {currentPage} / {totalPages}
                </div>
            )}
        </div>
    );
};

export default DocumentImageViewer;