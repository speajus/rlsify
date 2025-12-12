<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { HTMLSpanAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  interface Props extends HTMLSpanAttributes {
    class?: string;
    placeholder?: string;
    children?: Snippet;
  }

  let { class: className, placeholder = '', children, ...restProps }: Props = $props();
</script>

<span class={cn('pointer-events-none', className)} {...restProps}>
  {#if children}
    {@render children()}
  {:else if placeholder}
    <span class="text-muted-foreground">{placeholder}</span>
  {/if}
</span>

