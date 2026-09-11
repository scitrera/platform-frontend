import React from 'react';
import {Loader2} from 'lucide-react';

const AreaLoadingSpinner = ({message}) => {

    return (
        <div className="flex-grow flex flex-col bg-gray-50 overflow-y-auto">
            <div className="flex flex-col items-center justify-center text-center p-6">
                {message && <p className="text-gray-500 mb-4">{message}</p>}
                {!message && (<p className="text-lg text-gray-600">Loading...</p>)}
                <div className="flex items-center justify-center text-gray-500 py-10">
                    <Loader2 size={48} className="animate-spin mr-2"/>
                </div>
            </div>
        </div>);
};

export default AreaLoadingSpinner;
