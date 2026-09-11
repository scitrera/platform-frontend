import React, {useState, useEffect} from 'react';
import {WifiOff, Wifi} from 'lucide-react';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';

/**
 * ConnectionStatusIcon component
 *
 * Displays a disconnected icon that flashes red when the WebSocket is disconnected.
 * The icon is hidden when the WebSocket is connected.
 */
const ConnectionStatusIcon = () => {
    const {isConnected} = useWebSocket();
    const [isFlashing, setIsFlashing] = useState(false);

    // Set up a flashing effect when disconnected
    useEffect(() => {
        if (!isConnected) {
            // Start flashing
            const flashInterval = setInterval(() => {
                setIsFlashing(prev => !prev);
            }, 500); // Toggle every 500ms

            return () => {
                clearInterval(flashInterval);
                setIsFlashing(false);
            };
        }
    }, [isConnected]);

    return (
        <div
            className="flex items-center justify-center"
            title={isConnected ? 'Connected to Server' : 'Disconnected from Server'}
        >
            {isConnected ? (
                <Wifi size={24} className={'text-green-700'}/>
            ) : (
                <WifiOff
                    size={20}
                    className={`${isFlashing ? 'text-red-600' : 'text-gray-600'} transition-colors duration-300`}
                />
            )}
        </div>
    );
};

export default ConnectionStatusIcon;