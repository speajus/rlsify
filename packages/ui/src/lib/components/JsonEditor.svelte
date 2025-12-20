<script lang="ts">
  import { JSONEditor, type Content, type OnChange } from 'svelte-jsoneditor';
  import 'svelte-jsoneditor/themes/jse-theme-dark.css';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';

  interface Props {
    value: string;
    onUpdate: (value: string) => void;
    rows?: number;
    label?: string;
    showCopyButton?: boolean;
  }

  let { value, onUpdate, rows = 4, label, showCopyButton = true }: Props = $props();

  let copySuccess = $state(false);

  // Parse the string value into content for the editor
  let content = $state<Content>({ text: value });

  // Track if we're currently updating from external source
  let isExternalUpdate = $state(false);

  // Sync external value changes to editor
  $effect(() => {
    // Only update if value changed externally
    if (value !== getTextFromContent(content)) {
      isExternalUpdate = true;
      content = { text: value };
      isExternalUpdate = false;
    }
  });

  function getTextFromContent(c: Content): string {
    if ('text' in c && c.text !== undefined) {
      return c.text;
    }
    if ('json' in c) {
      return JSON.stringify(c.json, null, 2);
    }
    return '';
  }

  const handleChange: OnChange = (newContent, _previousContent, { contentErrors }) => {
    if (isExternalUpdate) return;

    content = newContent;
    const text = getTextFromContent(newContent);

    // Only call onUpdate if there are no parse errors
    if (!contentErrors) {
      onUpdate(text);
    } else {
      // Still update with the text even if invalid (for editing)
      onUpdate(text);
    }
  };

  async function copyToClipboard() {
    try {
      const text = getTextFromContent(content);
      await navigator.clipboard.writeText(text);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  // Calculate height based on rows
  let editorHeight = $derived(`${Math.max(rows * 1.5, 6)}rem`);
</script>

<div class="json-editor-container">
  {#if label || showCopyButton}
    <div class="editor-header">
      {#if label}
        <span class="json-label">{label}</span>
      {/if}
      {#if showCopyButton}
        <button
          type="button"
          class="copy-button"
          onclick={copyToClipboard}
          title="Copy to clipboard"
        >
          {#if copySuccess}
            <Check class="h-3 w-3" />
            <span>Copied</span>
          {:else}
            <Copy class="h-3 w-3" />
            <span>Copy</span>
          {/if}
        </button>
      {/if}
    </div>
  {/if}
  <div class="editor-wrapper jse-theme-dark" style="height: {editorHeight}">
    <JSONEditor
      {content}
      onChange={handleChange}
      mode="text"
      mainMenuBar={false}
      navigationBar={false}
      statusBar={false}
    />
  </div>
</div>

<style>
  .json-editor-container {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .json-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .copy-button:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--muted));
    border-color: hsl(var(--ring));
  }

  .editor-wrapper {
    border-radius: 0.375rem;
    overflow: hidden;
    border: 1px solid hsl(var(--border));
  }

  /* Override svelte-jsoneditor styles for dark theme integration */
  .editor-wrapper :global(.jse-main) {
    border: none !important;
    min-height: 100% !important;
  }

  .editor-wrapper :global(.jse-text-mode) {
    border: none !important;
  }

  .editor-wrapper :global(.cm-editor) {
    font-size: 0.75rem !important;
  }

  .editor-wrapper :global(.cm-scroller) {
    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace !important;
  }
</style>

