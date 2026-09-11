export const DEBUG_MODE = (import.meta.env.MODE === 'development');

export const UI_CONSTANTS = {
    DEFAULT_TENANT_ID: 'tenant',
    HTTP_PATH_PREFIX: '/',

    APP_ID_CHAT: 'chat',
    APP_TYPE_CHAT_APP: 'chatApp',
    APP_TYPE_ADMIN_CONSOLE: 'admin-console',
    APP_ID_KNOWLEDGEBASE: 'knowledgebase',
    APP_TYPE_KNOWLEDGEBASE: 'knowledgebase',
    APP_ID_LIBRARY: 'library',
    APP_TYPE_LIBRARY: 'library',
    APP_ID_SHARING: 'sharing',
    APP_TYPE_SHARING: 'sharing',
    APP_ID_WORKSPACE_SETTINGS: 'workspace-settings',
    APP_TYPE_WORKSPACE_SETTINGS: 'workspace-settings',
    APP_ID_DOC_VIEWER: 'doc-viewer',
    APP_TYPE_DOC_VIEWER: 'doc-viewer',

    APP_ID_SELECT_WORKSPACE_PROMPT: 'select-workspace-prompt',

    APP_LAYOUT_HORIZONTAL: 'horizontal',
    APP_LAYOUT_VERTICAL: 'vertical',

    LOCAL_STORAGE_APP_SPLIT_KEY: 'ScitreraPlatformUIAppSplit',
    MIN_SPLIT_PCT: 10,
    DEFAULT_SPLIT_PCT: 50,
    MAX_SPLIT_PCT: 90,

    LOCAL_STORAGE_CHAT_RAIL_STATE: 'ScitreraPlatformChatRailState',
    LOCAL_STORAGE_CHAT_RAIL_WIDTH: 'ScitreraPlatformChatRailWidth',
    LOCAL_STORAGE_CHAT_RAIL_THREADS_OPEN: 'ScitreraPlatformChatRailThreadsOpen',
    LOCAL_STORAGE_CHAT_RAIL_ARTIFACTS_OPEN: 'ScitreraPlatformChatRailArtifactsOpen',
    LOCAL_STORAGE_CHAT_RAIL_TODOS_OPEN: 'ScitreraPlatformChatRailTodosOpen',
    CHAT_RAIL_MIN_WIDTH: 340,
    CHAT_RAIL_DEFAULT_WIDTH: 420,
    CHAT_RAIL_MOBILE_BREAKPOINT: 768,

    SIDEBAR_MODE_APPS: 'applications',
    SIDEBAR_MODE_WORKSPACES: 'workspaces',

    SIDEBAR_CLASS_COLLAPSED: 'w-16',
    SIDEBAR_CLASS_NORMAL: 'w-72',
    SIDEBAR_CLASS_EXTRA_WIDE: 'w-[70vw] max-w-2xl', // Takes 70% of viewport width, with a max
}

export const CHAT_UI_CONSTANTS = {
    MAX_WIDTH_CLASS: 'max-w-[1200px]',
    USER_MSG_BG: 'bg-gray-100 text-gray-900',
    AI_MSG_BG: 'bg-white text-gray-800',
    USER_CONTAINER: 'p-3 rounded-lg shadow-sm',
    AI_CONTAINER: 'p-4 rounded-md',
    MARKDOWN_PROSE: `prose max-w-none prose-headings:font-semibold prose-h1:text-xl prose-h1:mb-3 prose-h1:mt-4 prose-h2:text-lg prose-h2:mb-2 prose-h2:mt-3 prose-h3:text-base prose-h3:mb-1.5 prose-h3:mt-2 prose-p:my-2 prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5 prose-blockquote:my-2 prose-blockquote:pl-4 prose-blockquote:border-l-4 prose-code:px-1 prose-code:py-0.5 prose-code:bg-gray-200 prose-code:rounded prose-code:text-xs text-inherit leading-relaxed`,
    MARKDOWN_PROSE_AI: 'prose-blockquote:border-gray-300',
}

export const DEFAULT_APPS = {
    DEFAULT_CHAT_APP: {
        id: UI_CONSTANTS.APP_ID_CHAT,
        type: UI_CONSTANTS.APP_TYPE_CHAT_APP,
        title: 'Chat',
    },

    DEFAULT_SELECT_WORKSPACE_APP: {
        id: UI_CONSTANTS.APP_ID_SELECT_WORKSPACE_PROMPT,
        type: 'prompt',
        title: 'Welcome',
    },
}


/**
 * Permissions hierarchy (lowest to highest)
 */
export const PERMISSIONS_ENUMS = {
    READ: 'READ',
    RW: 'RW',
    RW_PLUS: 'RW_PLUS',
    ADMIN: 'ADMIN',
};
export const PERMISSIONS = [
    PERMISSIONS_ENUMS.READ,
    PERMISSIONS_ENUMS.RW,
    PERMISSIONS_ENUMS.RW_PLUS,
    PERMISSIONS_ENUMS.ADMIN,
];
export const PERMISSION_LABELS = {
    READ: 'Reader',
    RW: 'Writer',
    RW_PLUS: 'Manager',
    ADMIN: 'Admin',
};
export const permIndex = (p) => PERMISSIONS.indexOf(p);

// Backend ACL levels (int): NONE=0 READ=10 RW=20 MANAGE/RW_PLUS=30 ADMIN=40
// SUPER_ADMIN=50. The wire (sharing.list_members / sharing.share, etc.) speaks
// these ints; the UI speaks the PERMISSIONS_ENUMS strings above.
export const PERMISSION_LEVELS = {
    [PERMISSIONS_ENUMS.READ]: 10,
    [PERMISSIONS_ENUMS.RW]: 20,
    [PERMISSIONS_ENUMS.RW_PLUS]: 30,
    [PERMISSIONS_ENUMS.ADMIN]: 40,
};

// Map a backend ACL level (int, or numeric string) to a UI permission enum. A
// value already in enum form passes through. Levels >= 40 (incl. SUPER_ADMIN=50)
// map to ADMIN; unknown/low levels fall back to READ.
export const permissionFromLevel = (level) => {
    const n = typeof level === 'number' ? level : parseInt(level, 10);
    if (Number.isNaN(n)) return level;
    if (n >= 40) return PERMISSIONS_ENUMS.ADMIN;
    if (n >= 30) return PERMISSIONS_ENUMS.RW_PLUS;
    if (n >= 20) return PERMISSIONS_ENUMS.RW;
    return PERMISSIONS_ENUMS.READ;
};

// Reverse of permissionFromLevel: UI permission enum → backend ACL level int
// (for send paths, e.g. sharing.share target_role, which expects an int).
export const permissionToLevel = (perm) => PERMISSION_LEVELS[perm] ?? 10;

// Strip a leading ``user:`` principal prefix for display (backend user ids /
// some name/email fields arrive as ``user:<email>``).
export const stripUserPrefix = (s) =>
    (typeof s === 'string' ? s.replace(/^user:/, '') : s);

// Special principal ids (after stripping ``user:``) → friendly display.
// ``__authenticated__`` = any signed-in user; since there is no unauthenticated
// access, that's effectively everyone.
export const SPECIAL_PRINCIPALS = {
    __authenticated__: {name: 'All Users', detail: 'Any authenticated user'},
};

// Resolve a principal id to display info: {name, detail, special}. Special
// principals get a friendly name + detail; everyone else returns the bare
// (user:-stripped) value for both.
export const principalDisplay = (id) => {
    const bare = stripUserPrefix(id);
    const special = SPECIAL_PRINCIPALS[bare];
    return special
        ? {name: special.name, detail: special.detail, special: true}
        : {name: bare, detail: bare, special: false};
};