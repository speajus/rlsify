<script lang="ts">
  import { cn } from '$lib/utils.js';
  import X from 'lucide-svelte/icons/x';

  interface Props {
    values: string[];
    onUpdate: (values: string[]) => void;
    placeholder?: string;
    suggestions?: string[];
    class?: string;
  }

  let { values = [], onUpdate, placeholder = 'Add tag...', suggestions = [], class: className }: Props = $props();

  let inputValue = $state('');
  let inputRef = $state<HTMLInputElement | null>(null);
  let showSuggestions = $state(false);

  let filteredSuggestions = $derived(
    suggestions.filter(s => 
      !values.includes(s) && 
      s.toLowerCase().includes(inputValue.toLowerCase())
    )
  );

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !values.includes(trimmed)) {
      onUpdate([...values, trimmed]);
    }
    inputValue = '';
    showSuggestions = false;
  }

  function removeTag(tag: string) {
    onUpdate(values.filter(v => v !== tag));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      removeTag(values[values.length - 1]);
    } else if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }

  function handleFocus() {
    showSuggestions = true;
  }

  function handleBlur() {
    // Delay to allow clicking on suggestions
    setTimeout(() => {
      showSuggestions = false;
    }, 150);
  }
</script>

<div class={cn('relative', className)}>
  <div class="flex flex-wrap items-center gap-1.5 min-h-10 px-3 py-2 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
    {#each values as tag}
      <span class="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-secondary text-secondary-foreground rounded-md">
        {tag}
        <button
          type="button"
          onclick={() => removeTag(tag)}
          class="hover:bg-destructive/20 rounded-sm p-0.5 transition-colors"
        >
          <X class="h-3 w-3" />
        </button>
      </span>
    {/each}
    <input
      bind:this={inputRef}
      type="text"
      bind:value={inputValue}
      onkeydown={handleKeydown}
      onfocus={handleFocus}
      onblur={handleBlur}
      {placeholder}
      class="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
    />
  </div>

  {#if showSuggestions && filteredSuggestions.length > 0}
    <div class="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md">
      {#each filteredSuggestions as suggestion}
        <button
          type="button"
          onclick={() => addTag(suggestion)}
          class="w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors first:rounded-t-md last:rounded-b-md"
        >
          {suggestion}
        </button>
      {/each}
    </div>
  {/if}
</div>

