import type {WorkProfileOption} from '@/types/chat';

interface Props {
    profiles: WorkProfileOption[];
    value: string;
    onChange: (value: string) => void;
}

/** Chooses the profile for the next conversation without changing an existing one. */
export default function WorkProfileSelect({profiles, value, onChange}: Props) {
    if (!profiles.length) return null;
    return (
        <label className="block mb-2 text-xs text-gray-600">
            Work profile for new conversation
            <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
                value={value}
                onChange={event => onChange(event.target.value)}
            >
                <option value="">Personal</option>
                {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
        </label>
    );
}
