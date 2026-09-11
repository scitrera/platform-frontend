import {EmptyState} from '../_shared/EmptyState';

/**
 * MemoryLayer entities.
 *
 * There is currently no MemoryLayer admin endpoint for graph/knowledge
 * entities (no ``/v1/admin/entities`` or equivalent on the enterprise server),
 * so this section is a placeholder. When the server grows an entities listing
 * endpoint, wire a ``memorylayer.entities`` op + swap this for a
 * ``makePagedListSection`` like the other list views.
 */
export function MemoryLayerEntitiesSection() {
    return (
        <div className="flex flex-col h-full p-4">
            <h2 className="text-lg font-semibold mb-3">MemoryLayer Entities</h2>
            <div className="flex-1 min-h-0 border rounded bg-white">
                <EmptyState
                    title="Entities admin view not yet available"
                    description="MemoryLayer does not expose an admin entities listing endpoint yet. This section will populate once the server adds one."
                />
            </div>
        </div>
    );
}
