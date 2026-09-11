import React from 'react';
import {Loader2} from 'lucide-react';

/**
 * A placeholder component displayed when the user is not authenticated.
 * This component is shown in the app area when the user needs to log in.
 */
const UnauthenticatedPlaceholder = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full w-full p-8 bg-white">
            <div className="text-center max-w-md">
                <img src="/logo2.png" alt="Scitrera Logo" className="h-16 w-auto mx-auto mb-6"/>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">Welcome to Scitrera</h1>
                <p className="text-gray-600 mb-6">
                    Checking your login status...
                </p>
                <div className="flex justify-center items-center">
                    <Loader2 size={24} className="animate-spin text-blue-600"/>
                </div>
            </div>
        </div>
    );
};

export default UnauthenticatedPlaceholder;
