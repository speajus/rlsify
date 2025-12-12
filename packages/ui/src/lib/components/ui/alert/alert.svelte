<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { alertVariants, type Variant } from './index.js';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    variant?: Variant;
    class?: string;
    children?: Snippet;
  }

  let { class: className, variant = 'default', children, ...restProps }: Props = $props();
</script>

<div class={cn(alertVariants({ variant }), className)} role="alert" {...restProps}>
  {#if children}
    {@render children()}
  {/if}
</div>

