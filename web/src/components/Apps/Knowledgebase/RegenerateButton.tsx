import {useState} from 'react';
import {Loader2, RefreshCw} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {useKnowledgebaseState} from '@/hooks/useKnowledgebaseState';
import {useToasts} from '@/hooks/useToasts';

export function RegenerateButton() {
    const {regenerate, loading} = useKnowledgebaseState();
    const {addToast} = useToasts();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [fullRegenerate, setFullRegenerate] = useState(false);

    const handleConfirm = () => {
        // Fire-and-forget: launch the (slow, LLM-heavy) regeneration and
        // immediately dismiss the dialog. The knowledgebase context tracks it
        // via `loading` (header button spinner) and reloads metadata + articles
        // when it finishes, so the user can keep working meanwhile instead of
        // being trapped behind a blocking modal.
        void regenerate(fullRegenerate);
        addToast('Knowledgebase regeneration started — this runs in the background.', 'info');
        setDialogOpen(false);
        setFullRegenerate(false);
    };

    const handleOpen = () => {
        if (loading) return;
        setDialogOpen(true);
    };

    return (
        <>
            <button
                onClick={handleOpen}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Regenerate knowledgebase"
            >
                {loading ? (
                    <Loader2 size={15} className="animate-spin"/>
                ) : (
                    <RefreshCw size={15}/>
                )}
                Regenerate
            </button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Regenerate Knowledgebase</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm text-gray-600 space-y-3">
                        <p>
                            This re-runs the full pipeline: graph analysis, community labeling, entity deep-dives,
                            and index article generation. It runs in the background — you can keep working while it
                            regenerates.
                        </p>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={fullRegenerate}
                                onChange={e => setFullRegenerate(e.target.checked)}
                                className="rounded border-gray-300"
                            />
                            <span>Full regenerate (clear existing articles and rebuild from scratch)</span>
                        </label>
                    </div>
                    <DialogFooter className="gap-2 mt-2">
                        <button
                            onClick={() => setDialogOpen(false)}
                            className="px-4 py-2 text-sm rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                            Start regeneration
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
