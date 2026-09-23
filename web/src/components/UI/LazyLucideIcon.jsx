import React, {useEffect, useState} from 'react';

// Cache for resolved icon components
const iconCache = new Map();

// Utility function to fetch and cache icon
async function loadIcon(iconName) {
    if (iconCache.has(iconName)) {
        return iconCache.get(iconName);
    }

    const module = await import('lucide-react');
    const Icon = module[iconName] || module.AlertCircle;
    iconCache.set(iconName, Icon);
    return Icon;
}

export default function LazyLucideIcon({iconName, ...props}) {
    // Reset the loaded component when metadata changes, while reusing the cache.
    return <ResolvedLucideIcon key={iconName} iconName={iconName} {...props}/>;
}

function ResolvedLucideIcon({iconName, ...props}) {
    // TODO: if icon name ends with jpg/png, etc. then we just render image instead of Lucide icon?!?!

    const [IconComponent, setIconComponent] = useState(() =>
        iconCache.get(iconName)
    );

    useEffect(() => {
        let isMounted = true;

        if (!IconComponent) {
            loadIcon(iconName).then((Icon) => {
                if (isMounted) {
                    setIconComponent(() => Icon);
                }
            });
        }

        return () => {
            isMounted = false;
        };
    }, [iconName, IconComponent]);

    if (!IconComponent) {
        return <span className="text-muted">(o)</span>; // fallback
    }

    return <IconComponent key={iconName} {...props} />;
}
