interface Props {
    title: string;
    description?: string;
}

export function EmptyState({title, description}: Props) {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
            <p className="text-sm font-medium text-gray-900">{title}</p>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
    );
}
