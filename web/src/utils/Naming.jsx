// sanitize slug: lower-case, DNS-safe, max 64 chars, no leading underscore, not reserved
export const reservedSlugs = ['none', 'null', 'scitrera'];
export const reservedPrefixes = ['wss', 'app', 'auth', 'www', 'rmq', 'mail', 'dev', 'hooks',]

export function cleanSlug(title) {
    let s = title.toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')       // non-alphanumeric => hyphen
        .replace(/^-+/, '')                 // trim leading hyphens
        .substring(0, 64);
    // TODO: add in reserved prefixes resolve by.... prefixing with xx?
    if (reservedSlugs.includes(s)) s = s + '-1';
    return s;
}
