// src/components/ui/button.jsx
import React from 'react'

export const Button = ({children, className = '', ...props}) => (
    <button
        className={
            'inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700 ' +
            'disabled:opacity-50 disabled:cursor-not-allowed ' +
            className
        }
        {...props}
    >
        {children}
    </button>
)