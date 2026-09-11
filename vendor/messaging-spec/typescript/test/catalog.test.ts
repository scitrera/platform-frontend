import {describe, expect, it} from 'vitest';

import invokeFixture from '../../go/testdata/tool_catalog/invoke.json';
import pageFixture from '../../go/testdata/tool_catalog/page.json';
import publicationFixture from '../../go/testdata/tool_catalog/publication.json';
import queryFixture from '../../go/testdata/tool_catalog/query.json';

import {
    TOOL_CATALOG_MAX_SEQUENCE,
    TOOL_CATALOG_SCHEMA_VERSION,
    normalizeToolCatalogCapabilities,
    validateToolCatalogPage,
    validateToolCatalogPublication,
    validateToolCatalogQuery,
    validateToolInvokeEnvelope,
    type ToolCatalogPage,
    type ToolCatalogPublication,
    type ToolCatalogQuery,
    type ToolInvokeEnvelope,
} from '../src/index';

describe('tool catalog contract', () => {
    it('validates and round-trips the shared publication fixture', () => {
        const publication = structuredClone(publicationFixture) as ToolCatalogPublication;
        expect(() => validateToolCatalogPublication(publication)).not.toThrow();
        expect(publication.schema_version).toBe(TOOL_CATALOG_SCHEMA_VERSION);
        expect(publication.future).toBe('kept');
        expect(JSON.parse(JSON.stringify(publication))).toEqual(publication);
    });

    it('validates the shared query and deterministic page fixtures', () => {
        const query = structuredClone(queryFixture) as ToolCatalogQuery;
        const page = structuredClone(pageFixture) as ToolCatalogPage;
        expect(() => validateToolCatalogQuery(query)).not.toThrow();
        expect(() => validateToolCatalogPage(page)).not.toThrow();
        expect(page.entries.map((entry) => entry.ref.name)).toEqual(['read_file', 'shell']);
        expect(page.future).toBe(true);
    });

    it('validates exact invocation references and rejects name mismatch', () => {
        const envelope = structuredClone(invokeFixture) as ToolInvokeEnvelope;
        expect(() => validateToolInvokeEnvelope(envelope)).not.toThrow();
        envelope.name = 'shell';
        expect(() => validateToolInvokeEnvelope(envelope)).toThrow('name must equal tool_ref.name');
    });

    it('rejects non-canonical, unsafe, and downgraded publications', () => {
        const unordered = structuredClone(publicationFixture) as ToolCatalogPublication;
        unordered.entries.reverse();
        expect(() => validateToolCatalogPublication(unordered)).toThrow('ascending order');

        const mismatched = structuredClone(publicationFixture) as ToolCatalogPublication;
        mismatched.entries[0]!.descriptor.name = 'other';
        expect(() => validateToolCatalogPublication(mismatched)).toThrow('descriptor.name');

        const unknownEffect = structuredClone(publicationFixture) as unknown as ToolCatalogPublication;
        (unknownEffect.entries[0] as {effect: string}).effect = 'unknown';
        expect(() => validateToolCatalogPublication(unknownEffect)).toThrow('unsupported tool effect');

        const unsafeSequence = structuredClone(publicationFixture) as ToolCatalogPublication;
        unsafeSequence.sequence = TOOL_CATALOG_MAX_SEQUENCE + 1;
        expect(() => validateToolCatalogPublication(unsafeSequence)).toThrow('JSON-safe');

        const invalidTimestamp = structuredClone(publicationFixture) as ToolCatalogPublication;
        invalidTimestamp.lease_expires_at = '2026-02-30T12:00:00Z';
        expect(() => validateToolCatalogPublication(invalidTimestamp)).toThrow('RFC3339');
    });

    it('normalizes capabilities deterministically', () => {
        expect(normalizeToolCatalogCapabilities([' tool.ref.v1 ', 'tool.cancel.v1', 'tool.ref.v1', ''])).toEqual([
            'tool.cancel.v1',
            'tool.ref.v1',
        ]);
    });
});
