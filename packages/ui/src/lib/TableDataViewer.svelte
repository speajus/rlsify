<script lang="ts">
	import type { TableRow } from '@speajus/rlsify-types';

	interface Props {
		tableName: string;
		rows?: TableRow[];
	}

	let { tableName, rows = [] }: Props = $props();

	// Get all unique column names from the rows
	const columns = $derived.by(() => {
		if (!rows || rows.length === 0) return [];
		const colSet = new Set<string>();
		for (const row of rows) {
			Object.keys(row.data).forEach((key) => colSet.add(key));
		}
		return Array.from(colSet);
	});

	// Format cell value for display
	function formatValue(value: unknown): string {
		if (value === null || value === undefined) {
			return '∅';
		}
		if (typeof value === 'object') {
			return JSON.stringify(value);
		}
		if (typeof value === 'boolean') {
			return value ? '✓' : '✗';
		}
		return String(value);
	}

	// Truncate long values
	function truncate(str: string, maxLength: number = 50): string {
		if (str.length <= maxLength) return str;
		return str.substring(0, maxLength) + '...';
	}
</script>

<div class="table-data-viewer">
	<div class="header">
		<h2>{tableName}</h2>
		<span class="row-count">{rows?.length ?? 0} {rows?.length === 1 ? 'row' : 'rows'}</span>
	</div>

	{#if !rows || rows.length === 0}
		<div class="empty-state">
			<p>No data available</p>
		</div>
	{:else}
		<div class="table-container">
			<table>
				<thead>
					<tr>
						<th class="row-number">#</th>
						{#each columns as column}
							<th>{column}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row, index}
						<tr>
							<td class="row-number">{index + 1}</td>
							{#each columns as column}
								<td title={formatValue(row.data[column])}>
									{truncate(formatValue(row.data[column]))}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.table-data-viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-surface);
		border-radius: 8px;
		overflow: hidden;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-elevated);
	}

	.header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.row-count {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		padding: 0.25rem 0.75rem;
		background: var(--color-surface);
		border-radius: 12px;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.table-container {
		flex: 1;
		overflow: auto;
		padding: 1rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	thead {
		position: sticky;
		top: 0;
		background: var(--color-surface-elevated);
		z-index: 1;
	}

	th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		border-bottom: 2px solid var(--color-border);
		white-space: nowrap;
	}

	th.row-number {
		width: 60px;
		text-align: center;
		color: var(--color-text-secondary);
	}

	td {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-primary);
	}

	td.row-number {
		text-align: center;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	tbody tr:hover {
		background: var(--color-surface-hover);
	}

	tbody tr:last-child td {
		border-bottom: none;
	}
</style>

