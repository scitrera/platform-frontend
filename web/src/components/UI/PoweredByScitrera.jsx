import React, {useState} from 'react';
import {useWebSocket} from "../../hooks/useWebSocket.jsx";

const VersionDialog = ({isOpen, onClose}) => {
    const {backendVersion} = useWebSocket();

    if (!isOpen) return null;

    const devMode = import.meta.env.MODE === 'development';
    // eslint-disable-next-line no-undef
    const frontendVersion = devMode ? "Development" : __GIT_COMMIT_HASH__;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <a href="https://scitrera.ai" target="_blank"><img src="/logo2.png" className="h-10 w-auto"/></a>
                    <h2 className="text-xl font-semibold">Version Information</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-2">
                    <p><strong>Frontend Build:</strong> {frontendVersion}</p>
                    <p><strong>Backend Build:</strong> {backendVersion}</p>
                    <p><a href="/source.tar.gz" className="underline">Source code and licenses</a></p>
                </div>
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

const PoweredByScitrera = () => {
    const [showVersionDialog, setShowVersionDialog] = useState(false);

    const handleScitreraClick = (e) => {
        e.preventDefault();
        setShowVersionDialog(true);
    };

    return (
        <>
            <div
                className="fixed bottom-1 left-2 z-40 bg-white bg-opacity-90 backdrop-blur-sm rounded-full px-3 py-1 shadow-lg border border-gray-200 text-sm text-gray-600 hover:bg-opacity-100 transition-all duration-200">
                <span>Powered by </span>
                <button
                    onClick={handleScitreraClick}
                    className="inline-flex items-center hover:text-blue-600 transition-colors duration-200"
                >
                    <span className="font-medium">scitrera.ai</span>
                    <img
                        src="/logo2.png"
                        alt="Scitrera"
                        className="inline h-4 w-auto mr-1"
                    />
                </button>
            </div>

            <VersionDialog
                isOpen={showVersionDialog}
                onClose={() => setShowVersionDialog(false)}
            />
        </>
    );
};

export default PoweredByScitrera;