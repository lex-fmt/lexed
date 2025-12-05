import { cn } from '@/lib/utils';
import { forwardRef, HTMLAttributes } from 'react';

/**
 * ButtonGroup - visually groups buttons together with a shared border.
 *
 * Creates an outlined container with rounded corners that wraps child buttons.
 * Internal separators divide buttons while maintaining the cohesive group appearance.
 */
export const ButtonGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "inline-flex items-center",
                "border border-border rounded-md",
                // Remove border-radius from all children - the container handles rounding
                "[&>button]:rounded-none",
                "[&>button]:border-0",
                // First and last buttons get appropriate rounding to match container
                "[&>button:first-child]:rounded-l-[5px]",
                "[&>button:last-child]:rounded-r-[5px]",
                // Handle case where separator is first/last child
                "[&>button:first-of-type]:rounded-l-[5px]",
                "[&>button:last-of-type]:rounded-r-[5px]",
                className
            )}
            {...props}
        />
    )
);
ButtonGroup.displayName = 'ButtonGroup';

/**
 * Visual separator between buttons in a ButtonGroup.
 * Renders as a thin vertical line that spans the full height.
 */
export const ButtonGroupSeparator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            data-separator
            className={cn("w-px self-stretch bg-border", className)}
            {...props}
        />
    )
);
ButtonGroupSeparator.displayName = 'ButtonGroupSeparator';
