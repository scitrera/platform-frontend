import type {Authority} from '../types';

export function AuthorityBadge({authority}: {authority: Authority}) {
    if (authority !== 'super') return null;
    return (
        <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            Super
        </span>
    );
}
