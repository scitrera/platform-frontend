// src/components/ui/card.jsx
import React from 'react'

export const Card = ({children, className = '', ...props}) => (
    <div
        className={
            'bg-white rounded-xl shadow-lg p-6 ' +
            className
        }
        {...props}
    >
        {children}
    </div>
)

export const CardHeader = ({children, className = '', ...props}) => (
    <div className={'mb-4 ' + className} {...props}>
        {children}
    </div>
)

export const CardContent = ({children, className = '', ...props}) => (
    <div className={className} {...props}>
        {children}
    </div>
)
