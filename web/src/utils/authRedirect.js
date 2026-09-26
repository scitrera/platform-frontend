// SPDX-License-Identifier: AGPL-3.0-only
// Auth-go only supplies this hint for a signed-in user with one tenant at a
// configured generic entry origin. Explicit shared tenant paths stay usable.
export function followAuthApplicationRedirect(data, location = window.location) {
    if (data?.auth !== 'valid' || data.authorized === false || data.tenants?.length !== 1 ||
        typeof data.redirect_url !== 'string') return false;
    try {
        const current = new URL(location.href);
        const target = new URL(data.redirect_url);
        if (current.pathname !== '/' || target.protocol !== 'https:' || target.username || target.password ||
            target.origin === current.origin) return false;
        location.replace(target.href);
        return true;
    } catch {
        return false;
    }
}
