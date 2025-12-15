<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface Props extends DropdownMenuPrimitive.ItemProps {
    class?: string;
    inset?: boolean;
    children?: Snippet;
  }

  let { class: className, inset = false, children, ...restProps }: Props = $props();
</script>

<DropdownMenuPrimitive.Item
  class={cn(
    'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    inset && 'pl-8',
    className
  )}
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</DropdownMenuPrimitive.Item>

