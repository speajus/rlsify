<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { Select as SelectPrimitive } from 'bits-ui';
  import Check from 'lucide-svelte/icons/check';
  import type { Snippet } from 'svelte';

  interface Props extends Omit<SelectPrimitive.ItemProps, 'children'> {
    class?: string;
    content?: Snippet;
  }

  const { class: className, content, ...restProps }: Props = $props();
</script>

<SelectPrimitive.Item
  class={cn(
    'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    className
  )}
  {...restProps}
>
  {#snippet children({ selected })}
    <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      {#if selected}
        <Check class="h-4 w-4" />
      {/if}
    </span>
    <span>
      {#if content}
        {@render content()}
      {:else}
        {restProps.label ?? restProps.value}
      {/if}
    </span>
  {/snippet}
</SelectPrimitive.Item>

