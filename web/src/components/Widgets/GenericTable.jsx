// GenericTable.jsx
import React, {useState, useMemo, useCallback, isValidElement, cloneElement} from 'react'
import {useReactTable, getCoreRowModel, flexRender} from '@tanstack/react-table'

// Optional: export memoized component
const GenericTable = React.memo(function GenericTable({
                                                          data,
                                                          columns,
                                                          actions = [],
                                                          onRowSelect,
                                                          onRowDoubleClick,
                                                      }) {
    const [selectedRowIndex, setSelectedRowIndex] = useState(null)

    // Stable column defs (recomputed only if `columns` changes)
    const columnDefs = useMemo(() => columns.map(col => ({
        accessorKey: col.accessorKey,
        header: col.header,
        cell: col.cell ? info => col.cell(info.row.original) : info => info.getValue(),
        enableSorting: col.sortable ?? false,
    })), [columns])

    // Stable table instance (recomputed only if data/columns change)
    const table = useReactTable({
        data,
        columns: columnDefs,
        getCoreRowModel: getCoreRowModel(),
        getRowId: row => row.taskId ?? row.id ?? row.timestamp ??
            String(row.docId ?? row._id), // pick a stable unique key for your data
    })

    // Stable handlers so parents aren't passed new fns each render
    const handleRowClick = useCallback((row, index) => {
        setSelectedRowIndex(index)
        onRowSelect?.(row.original)
    }, [onRowSelect])

    const handleRowDoubleClick = useCallback((row) => {
        onRowDoubleClick?.(row.original)
    }, [onRowDoubleClick])

    function renderIcon(icon, iconProps) {
        if (!icon) return null
        if (isValidElement(icon)) return cloneElement(icon, iconProps || {})
        if (typeof icon === "function") {
            const C = icon
            return <C {...(iconProps || {})} />
        }
        // If some libraries return exotic elements, you can fallback:
        return null
    }

    return (
        <div className="w-full h-full flex flex-col min-h-0">
            {/* Toolbar */}
            <div className="flex justify-between items-center mb-2">
                <div/>
                <div className="flex space-x-2">
                    {actions.map((act, i) => {
                        // TODO: it would be good to add alt text / on hover text for the button of label if applicable
                        return (
                            <button
                                key={i}
                                onClick={act.onClick}
                                className="flex items-center px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                {renderIcon(act.icon, act.iconProps)}
                                {act.label && <span className="ml-1 text-sm">{act.label}</span>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto border rounded shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                            ))}
                        </tr>
                    ))}
                    </thead>

                    <tbody className="bg-white divide-y divide-gray-100">
                    {table.getRowModel().rows.map((row, idx) => {
                        const isSelected = idx === selectedRowIndex
                        return (
                            <tr
                                key={row.id}
                                onClick={() => handleRowClick(row, idx)}
                                onDoubleClick={() => handleRowDoubleClick(row)}
                                className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                                {row.getVisibleCells().map(cell => (
                                    <td key={cell.id} className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        )
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    )
});

export default GenericTable
