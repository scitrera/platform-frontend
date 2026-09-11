import {UI_CONSTANTS} from '../constants/AppConstants';

/**
 * Parse the current URL path to extract tenant, workspace, app, and other parameters.
 * URL format: /{tenant_id}/{workspace_id}/{app_id}/{...appPath}
 */
export const parseUrlPath = () => {
    const path = window.location.pathname;
    const cleanedPath = path.startsWith(UI_CONSTANTS.HTTP_PATH_PREFIX) ? path.slice(UI_CONSTANTS.HTTP_PATH_PREFIX.length) : path;
    const pathParts = cleanedPath.split('/').filter(part => part !== '');

    const tenantId = pathParts[0] || UI_CONSTANTS.DEFAULT_TENANT_ID;
    const workspaceId = pathParts[1] || null;
    const appId = pathParts[2] || null;

    // Return query params as a plain object so consumers can use spread and
    // property access uniformly. updateUrl() and getAppQueryParameter() both
    // already accept either form, so this normalisation is safe.
    const searchParams = new URLSearchParams(window.location.search);
    const queryParams = searchParams.size > 0 ? Object.fromEntries(searchParams) : null;
    const hashParams = window.location.hash;
    const appPath = pathParts.length > 3 ? pathParts.slice(3).join('/') : null;

    return {tenantId, workspaceId, appId, queryParams, hashParams, appPath};
};

/**
 * Update the browser URL based on current app state without triggering a page reload.
 *
 * Uses history.pushState by default; pass replace=true for hash-only/transient
 * changes that shouldn't pollute the back/forward stack (e.g., admin drawer
 * open/close).
 */
export const updateUrl = (tenantId, workspaceId, appId, appPath = null, queryParams = null, hashParams = null, replace = false) => {
    let newPath = `${UI_CONSTANTS.HTTP_PATH_PREFIX}${tenantId}`;

    if (workspaceId) {
        newPath += `/${workspaceId}`;

        if (appId && appId !== UI_CONSTANTS.APP_ID_CHAT && appId !== UI_CONSTANTS.APP_ID_SELECT_WORKSPACE_PROMPT) {
            newPath += `/${appId}`;
        }

        if (appPath) {
            newPath += '/' + appPath;
        }

        if (queryParams) {
            // TODO: filter out queryParams with value === null
            const qp = new URLSearchParams(queryParams);
            if (qp.size > 0) {
                newPath += '?' + qp.toString();
            }
        }

        if (hashParams) {
            newPath += hashParams.startsWith('#') ? hashParams : '#' + hashParams;
        }
    }

    if (replace) {
        window.history.replaceState({}, '', newPath);
    } else {
        window.history.pushState({}, '', newPath);
    }
};
