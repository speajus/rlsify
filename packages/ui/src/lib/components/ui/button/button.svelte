<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { buttonVariants, type Variant, type Size } from './index.js';
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: Variant;
    size?: Size;
    class?: string;
    children?: Snippet;
  }

  let {
    class: className,
    variant = 'default',
    size = 'default',
    children,
    ...restProps
  }: Props = $props();
</script>

<button class={cn(buttonVariants({ variant, size, className }))} {...restProps}>
  {#if children}
    {@render children()}
  {/if}
</button>

