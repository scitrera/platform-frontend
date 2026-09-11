import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:bg-blue-700',
        secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-800',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
      },
      size: {
        default: 'px-3 py-1.5',
        sm: 'px-2 py-1 text-xs',
        icon: 'p-1.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
