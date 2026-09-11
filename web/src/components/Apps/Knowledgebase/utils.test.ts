import {describe, expect, it} from 'vitest';
import {buildMetaChips, parseFrontmatter, resolveKbLink, rewriteCitations, rewriteWikilinks} from './utils';
import type {KbArticle} from '@/types/knowledgebase';

// Real entity-article frontmatter (from MemoryLayer knowledgebase_articles).
const ENTITY_MD = `---
type: entity
title: human
description: "Humans can intervene in HAZOP processes."
entity_type: person
aliases: [authors]
timestamp: "2026-07-12T16:20:39.387376+00:00"
member_count: 20
confidence: 0.508
tags: ["doc:doc_7c18a3d1ed8f", document_ingestion]
citation_coverage: 1.0
---

# human

Body text here.`;

describe('parseFrontmatter', () => {
    it('parses scalars, quoted strings, inline lists, and splits off the body', () => {
        const {data, body} = parseFrontmatter(ENTITY_MD);
        expect(data.type).toBe('entity');
        expect(data.entity_type).toBe('person');
        expect(data.member_count).toBe(20);
        expect(data.confidence).toBe(0.508);
        expect(data.aliases).toEqual(['authors']);
        expect(data.tags).toEqual(['doc:doc_7c18a3d1ed8f', 'document_ingestion']);
        // Quoted timestamp keeps its inner colons intact.
        expect(data.timestamp).toBe('2026-07-12T16:20:39.387376+00:00');
        expect(body.startsWith('# human')).toBe(true);
        expect(body).not.toContain('---');
    });

    it('returns the input unchanged when there is no frontmatter', () => {
        const md = '# Just a heading\n\ntext';
        expect(parseFrontmatter(md)).toEqual({data: {}, body: md});
    });
});

describe('buildMetaChips', () => {
    it('drops redundant keys and formats known fields', () => {
        const {data} = parseFrontmatter(ENTITY_MD);
        const chips = buildMetaChips(data);
        const byValue = Object.fromEntries(chips.map(c => [c.value, c]));

        // Redundant-with-header/body keys are never chips.
        for (const c of chips) {
            expect(['type', 'title', 'description', 'timestamp']).not.toContain(c.key);
        }
        // entity_type → accent chip, title-cased, no label.
        expect(byValue['Person']).toMatchObject({tone: 'accent'});
        expect(byValue['Person'].label).toBeUndefined();
        // percentages + counts formatted.
        expect(byValue['51%']).toMatchObject({label: 'Confidence'});
        expect(byValue['100%']).toMatchObject({label: 'Citations'});
        expect(byValue['20']).toMatchObject({label: 'Members'});
        // aliases collapsed into one "aka" chip.
        expect(byValue['authors']).toMatchObject({label: 'aka'});
        // label tags render individually; doc: tags collapse into a count.
        expect(byValue['document ingestion']).toMatchObject({tone: 'muted'});
        expect(byValue['1']).toMatchObject({label: 'Source docs'});
    });

    it('omits related_count when zero and surfaces contradictions', () => {
        expect(buildMetaChips({related_count: 0})).toEqual([]);
        expect(buildMetaChips({related_count: 3})[0]).toMatchObject({label: 'Related', value: '3'});
        expect(buildMetaChips({contradicted_by: ['a', 'b']})[0]).toMatchObject({tone: 'warn', value: '2'});
    });
});

describe('rewriteWikilinks', () => {
    it('preserves the raw target (folder/name) in a resolvable href', () => {
        expect(rewriteWikilinks('see [[communities/community-0|Community 0]] here'))
            .toBe('see [Community 0](#kb-link/communities%2Fcommunity-0) here');
        // Bare form uses the target as its own display text.
        expect(rewriteWikilinks('[[entities/response]]'))
            .toBe('[entities/response](#kb-link/entities%2Fresponse)');
    });
});

describe('rewriteCitations', () => {
    it('links inline [mN] runs but leaves bold Key-Memories labels alone', () => {
        expect(rewriteCitations('modalities [m4][m5][m14].'))
            .toBe('modalities [m4](#kb-cite/4)[m5](#kb-cite/5)[m14](#kb-cite/14).');
        // The `**[m1]**` definition label is not a reference — untouched.
        expect(rewriteCitations('- **[m1]** _[semantic]_ text')).toBe('- **[m1]** _[semantic]_ text');
    });
});

describe('resolveKbLink', () => {
    const ARTICLES = [
        {id: 'community-0', article_type: 'community', title: 'C0', metadata: {}, generated_at: ''},
        {id: 'entity-response-ent_102b', article_type: 'entity', title: 'response', metadata: {slug: 'response'}, generated_at: ''},
        {id: 'entity-human-ent_066e', article_type: 'entity', title: 'human', metadata: {slug: 'human'}, generated_at: ''},
        // No metadata slug → exercises the id-prefix fallback.
        {id: 'entity-foo-ent_1234', article_type: 'entity', title: 'foo', metadata: {}, generated_at: ''},
        {id: 'index', article_type: 'index', title: 'idx', metadata: {}, generated_at: ''},
    ] as unknown as KbArticle[];

    it('maps community targets to their article id', () => {
        expect(resolveKbLink('communities/community-0', ARTICLES)).toBe('community-0');
    });

    it('maps entity targets by slug, then by id-prefix fallback', () => {
        expect(resolveKbLink('entities/response', ARTICLES)).toBe('entity-response-ent_102b');
        expect(resolveKbLink('entities/human', ARTICLES)).toBe('entity-human-ent_066e');
        expect(resolveKbLink('entities/foo', ARTICLES)).toBe('entity-foo-ent_1234');
    });

    it('resolves a bare/exact article id and returns null when unmatched', () => {
        expect(resolveKbLink('index', ARTICLES)).toBe('index');
        expect(resolveKbLink('communities/community-99', ARTICLES)).toBeNull();
        expect(resolveKbLink('entities/nope', ARTICLES)).toBeNull();
    });
});
