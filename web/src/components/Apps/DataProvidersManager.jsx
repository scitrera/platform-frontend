import React, {useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import {Plus, CheckCircle, XCircle, RefreshCw} from 'lucide-react';

const EMPTY_PROVIDERS = [];

/**
 * DataProviderManager
 *
 * @param {{
 *   implementations: Record<
 *     string,
 *     {
 *       friendlyName: string;
 *       params: Array<{
 *         name: string;
 *         label: string;
 *         type: 'text' | 'secret' | 'dropdown' | 'integer' | 'boolean' | 'path';
 *         options?: string[];
 *         defaultValue?: any;
 *       }>;
 *     }
 *   >;
 *   initialProviders: Array<{ name: string; type: string; config: Record<string, any>; status?: 'ok'|'error'|'testing' }>;
 *   onSave: (provider) => Promise<void>;
 *   onDelete: (name: string) => Promise<void>;
 *   onTest: (provider) => Promise<boolean>;
 * }} props
 */
export default function DataProviderManager({implementations, initialProviders = EMPTY_PROVIDERS, onSave, onDelete, onTest}) {
    const [providerEdits, setProviderEdits] = useState(null);
    const providers = providerEdits?.input === initialProviders ? providerEdits.value : initialProviders;
    const setProviders = value => setProviderEdits({input: initialProviders, value});
    const [dialogOpen, setDialogOpen] = useState(false);
    const editingIndex = -1; // Editing controls are not exposed by this scaffold.
    const [formState, setFormState] = useState({name: '', type: '', config: {}});
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    function closeDialog() {
        setDialogOpen(false);
        setTesting(false);
        setTestResult(null);
    }

    async function handleTest() {
        setTesting(true);
        const ok = await onTest(formState);
        setTestResult(ok);
        setTesting(false);
    }

    async function handleSave() {
        await onSave(formState);
        const updated = [...providers];
        if (editingIndex >= 0) updated[editingIndex] = formState;
        else updated.push(formState);
        setProviders(updated);
        closeDialog();
    }

    async function handleDelete() {
        if (editingIndex >= 0) {
            await onDelete(formState.name);
            setProviders(providers.filter((_, i) => i !== editingIndex));
            closeDialog();
        }
    }

    function initializeConfigForType(typeKey) {
        const impl = implementations[typeKey];
        const initialConfig = {};
        impl.params.forEach(param => {
            if (param.defaultValue !== undefined) {
                initialConfig[param.name] = param.defaultValue;
            } else {
                initialConfig[param.name] = param.type === 'boolean' ? false : '';
            }
        });
        return initialConfig;
    }

    function renderField(param) {
        const value = formState.config[param.name] ?? '';
        const baseInputClasses = 'w-full px-2 py-1 border rounded-md';

        switch (param.type) {
            case 'text':
            case 'path':
            case 'secret':
                return (
                    <input
                        type={param.type === 'secret' ? 'password' : 'text'}
                        className={baseInputClasses}
                        value={value}
                        onChange={e => setFormState({
                            ...formState,
                            config: {...formState.config, [param.name]: e.target.value}
                        })}
                        placeholder={param.type === 'secret' ? '**Secret**' : param.label}
                    />
                );

            case 'dropdown':
                return (
                    <Select.Root
                        value={value}
                        onValueChange={val => setFormState({
                            ...formState,
                            config: {...formState.config, [param.name]: val}
                        })}
                    >
                        <Select.Trigger className={`inline-flex items-center justify-between ${baseInputClasses}`}>
                            <Select.Value placeholder={`Select ${param.label}`}/>
                            <Select.Icon/>
                        </Select.Trigger>
                        <Select.Content className="mt-1 bg-white border rounded-md">
                            {param.options?.map(opt => (
                                <Select.Item key={opt} value={opt} className="px-2 py-1 hover:bg-gray-100">
                                    <Select.ItemText>{opt}</Select.ItemText>
                                </Select.Item>
                            ))}
                        </Select.Content>
                    </Select.Root>
                );

            case 'integer':
                return (
                    <input
                        type="number"
                        className={baseInputClasses}
                        value={value}
                        onChange={e => setFormState({
                            ...formState,
                            config: {...formState.config, [param.name]: parseInt(e.target.value, 10)}
                        })}
                    />
                );

            case 'boolean':
                return (
                    <label className="inline-flex items-center space-x-2">
                        <CheckboxPrimitive.Root
                            checked={!!value}
                            onCheckedChange={checked => setFormState({
                                ...formState,
                                config: {...formState.config, [param.name]: checked}
                            })}
                            className="w-5 h-5 border rounded"
                        >
                            <CheckboxPrimitive.Indicator>
                                <CheckCircle size={16}/>
                            </CheckboxPrimitive.Indicator>
                        </CheckboxPrimitive.Root>
                        <span>{param.label}</span>
                    </label>
                );

            default:
                return null;
        }
    }

    return (
        <div className="bg-white rounded-2xl shadow p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Data Providers</h2>
                {/*<button*/}
                {/*    onClick={() => openDialog()}*/}
                {/*    className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50"*/}
                {/*>*/}
                {/*    <Plus className="mr-1" size={16}/> Add Provider*/}
                {/*</button>*/}
            </div>

            <table className="min-w-full divide-y divide-gray-200">
                <thead>
                <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium">Name</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Actions</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {providers.map(p => (
                    <tr
                        key={p.name}
                        // onDoubleClick={() => openDialog(i)}
                        className="hover:bg-gray-50 cursor-pointer"
                    >
                        <td className="px-4 py-2 text-sm">{p.name}</td>
                        <td className="px-4 py-2 text-sm">{implementations[p.type]?.friendlyName || p.type}</td>
                        <td className="px-4 py-2 text-sm">
                            {p.status === 'ok' ? <CheckCircle className="text-green-500"/> : p.status === 'error' ?
                                <XCircle className="text-red-500"/> : <RefreshCw className="animate-spin"/>}
                        </td>
                        <td className="px-4 py-2 text-sm">
                            {onTest ? (<button
                                onClick={() => onTest(p)}
                                className="px-2 py-1 border rounded hover:bg-gray-50"
                            >Test
                            </button>) : (<span>(Contact Support for Help)</span>)}
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>

            <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/50"/>
                    <Dialog.Content
                        className="fixed top-1/2 left-1/2 w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6">
                        <Dialog.Title className="text-lg font-medium mb-4">
                            {editingIndex >= 0 ? 'Edit Provider' : 'New Provider'}
                        </Dialog.Title>
                        <Dialog.Description>Data Providers Management</Dialog.Description>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium">Name / ID</label>
                                <input
                                    className="w-full px-2 py-1 border rounded-md"
                                    value={formState.name}
                                    disabled={editingIndex >= 0}
                                    onChange={e => setFormState({...formState, name: e.target.value})}
                                    placeholder="Unique provider name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium">Type</label>
                                <Select.Root
                                    value={formState.type}
                                    disabled={editingIndex >= 0}
                                    onValueChange={val => {
                                        const newConfig = initializeConfigForType(val);
                                        setFormState({name: '', type: val, config: newConfig});
                                    }}
                                >
                                    <Select.Trigger
                                        className="w-full inline-flex items-center justify-between px-2 py-1 border rounded-md">
                                        <Select.Value placeholder="Select provider type"/>
                                        <Select.Icon/>
                                    </Select.Trigger>
                                    <Select.Content className="mt-1 bg-white border rounded-md">
                                        {implementations && Object.entries(implementations).map(([key, impl]) => (
                                            <Select.Item key={key} value={key} className="px-2 py-1 hover:bg-gray-100">
                                                <Select.ItemText>{impl.friendlyName}</Select.ItemText>
                                            </Select.Item>
                                        ))}
                                    </Select.Content>
                                </Select.Root>
                            </div>

                            {formState.type &&
                                implementations[formState.type].params.map(param => (
                                    <div key={param.name}>
                                        {param.type !== 'boolean' &&
                                            <label className="block text-sm font-medium">{param.label}</label>}
                                        {renderField(param)}
                                    </div>
                                ))}
                        </div>

                        {testResult !== null && (
                            <p className={`mt-4 text-sm ${testResult ? 'text-green-600' : 'text-red-600'}`}>
                                {testResult ? 'Connection successful' : 'Connection failed'}
                            </p>
                        )}

                        <div className="mt-6 flex justify-between">
                            {editingIndex >= 0 ? (
                                <button
                                    onClick={handleDelete}
                                    className="px-3 py-1 border border-red-500 text-red-500 rounded hover:bg-red-50"
                                >Delete</button>
                            ) : <div/>}

                            <div className="space-x-2">
                                <button
                                    onClick={closeDialog}
                                    className="px-3 py-1 border rounded hover:bg-gray-50"
                                >Cancel
                                </button>
                                <button
                                    onClick={handleTest}
                                    disabled={testing || !formState.type || !formState.name}
                                    className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                                >Test
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={!formState.type || !formState.name}
                                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >Save
                                </button>
                            </div>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </div>
    );
}
