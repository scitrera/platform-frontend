import React from 'react';
import {Building2, CheckCircle} from 'lucide-react';

// Component displayed when user needs to select a tenant
const SelectTenantPrompt = ({tenants, onTenantSelect, selectedTenant = null}) => {
    const handleTenantSelect = (tenant) => {
        if (onTenantSelect) {
            onTenantSelect(tenant);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
            <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-8">
                <div className="text-center mb-8">
                    <Building2 size={48} className="text-blue-400 mb-4 mx-auto"/>
                    <h2 className="text-2xl font-semibold text-gray-800 mb-2">Select Tenant</h2>
                    <p className="text-gray-600">
                        Please select a tenant to continue.
                    </p>
                </div>

                <div className="space-y-3">
                    {tenants && tenants.length > 0 ? (
                        tenants.map((tenant) => (
                            <div
                                key={tenant.id}
                                onClick={() => handleTenantSelect(tenant)}
                                className={`
                                    flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                                    ${selectedTenant?.id === tenant.id
                                    ? 'border-blue-400 bg-blue-50 shadow-md'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }
                                `}
                            >
                                <div className="flex-shrink-0 mr-4">
                                    {tenant.logo ? (
                                        <img
                                            src={tenant.logo}
                                            alt={`${tenant.name} logo`}
                                            className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                                        />
                                    ) : (
                                        // <img
                                        //     src="/logo2.png"
                                        //     alt={`${tenant.name} logo unavailable, so showing Scitrera logo`}
                                        //     className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                                        // />
                                        <div
                                            className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                                            <Building2 size={24} className="text-gray-500"/>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-grow">
                                    <h3 className="text-lg font-medium text-gray-800">{tenant.name}</h3>
                                    <p className="text-sm text-gray-500">{tenant.id}</p>
                                </div>

                                {selectedTenant?.id === tenant.id && (
                                    <div className="flex-shrink-0 ml-4">
                                        <CheckCircle size={24} className="text-blue-400"/>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-gray-500">No tenants available</p>
                        </div>
                    )}
                </div>

                {selectedTenant && (
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => handleTenantSelect(selectedTenant)}
                            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors duration-200"
                        >
                            Continue with {selectedTenant.name}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SelectTenantPrompt;