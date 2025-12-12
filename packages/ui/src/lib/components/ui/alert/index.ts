import Root from './alert.svelte';
import Description from './alert-description.svelte';
import Title from './alert-title.svelte';
import { tv, type VariantProps } from 'tailwind-variants';

export const alertVariants = tv({
  base: 'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  variants: {
    variant: {
      default: 'bg-background text-foreground',
      destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
      success: 'border-green-500/50 text-green-400 dark:border-green-500 [&>svg]:text-green-400',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type Variant = VariantProps<typeof alertVariants>['variant'];

export {
  Root,
  Description,
  Title,
  Root as Alert,
  Description as AlertDescription,
  Title as AlertTitle,
};

