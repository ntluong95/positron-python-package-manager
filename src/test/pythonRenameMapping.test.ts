import * as assert from 'assert';
import { extractRenameMappingCaptures } from '../pythonRenameMapping';

suite('Python Rename Mapping Highlighting', () => {
	function labels(source: string): string[] {
		return extractRenameMappingCaptures(source).map((capture) => (
			`${capture.kind}:${source.slice(capture.range.start, capture.range.end)}`
		));
	}

	test('highlights pandas columns keyword dict', () => {
		const source = 'df.rename(columns={"price": "cost", "quantity": "amount"}, inplace=True)';
		assert.deepStrictEqual(labels(source), [
			'old:"price"',
			'new:"cost"',
			'old:"quantity"',
			'new:"amount"',
		]);
	});

	test('highlights pandas positional dict with axis=1', () => {
		const source = 'df.rename({"price": "cost", "quantity": "amount"}, axis=1)';
		assert.deepStrictEqual(labels(source), [
			'old:"price"',
			'new:"cost"',
			'old:"quantity"',
			'new:"amount"',
		]);
	});

	test('highlights pandas positional dict with axis="columns"', () => {
		const source = 'df = df.rename({"a": "b"}, axis="columns")';
		assert.deepStrictEqual(labels(source), [
			'old:"a"',
			'new:"b"',
		]);
	});

	test('highlights polars rename dict', () => {
		const source = [
			'import polars as pl',
			'pl_df = pl.DataFrame({"price": [10]})',
			'pl_df = pl_df.rename({"price": "cost"})',
		].join('\n');
		assert.deepStrictEqual(labels(source), [
			'old:"price"',
			'new:"cost"',
		]);
	});

	test('highlights with pl_ receiver heuristic', () => {
		const source = 'pl_df = pl_df.rename({"price": "cost"})';
		assert.deepStrictEqual(labels(source), [
			'old:"price"',
			'new:"cost"',
		]);
	});

	test('supports multiline dicts, comments, and trailing commas', () => {
		const source = [
			'df.rename(',
			'    columns={',
			'        "price": "cost",  # old to new',
			'        "quantity": "amount",',
			'    },',
			'    inplace=True,',
			')',
		].join('\n');
		assert.deepStrictEqual(labels(source), [
			'old:"price"',
			'new:"cost"',
			'old:"quantity"',
			'new:"amount"',
		]);
	});

	test('supports static f-strings, raw strings, and triple-quoted strings', () => {
		const source = [
			'df.rename(columns={',
			'    r"old": f"new",',
			'    f"static": r\'value\',',
			'    """triple_old""": """triple_new""",',
			'    f"dyn_{x}": "final",',
			'})',
		].join('\n');
		assert.deepStrictEqual(labels(source), [
			'old:r"old"',
			'new:f"new"',
			'old:f"static"',
			'new:r\'value\'',
			'old:"""triple_old"""',
			'new:"""triple_new"""',
			'new:"final"',
		]);
	});

	test('only highlights top-level dict pairs', () => {
		const source = 'df.rename(columns={"a": {"nested": "value"}, "b": "c"})';
		assert.deepStrictEqual(labels(source), [
			'old:"a"',
			'old:"b"',
			'new:"c"',
		]);
	});

	test('does not highlight unrelated dict literals', () => {
		const source = [
			'config = {"price": "cost", "quantity": "amount"}',
			'print(config)',
		].join('\n');
		assert.deepStrictEqual(labels(source), []);
	});

	test('does not highlight pandas index rename without axis/columns context', () => {
		const source = 'df.rename({"row_old": "row_new"})';
		assert.deepStrictEqual(labels(source), []);
	});

	test('highlights dict literal assigned to variable used in rename', () => {
		const source = [
			'rename_map = {"old": "new"}',
			'df.rename(columns=rename_map)',
		].join('\n');
		assert.deepStrictEqual(labels(source), [
			'old:"old"',
			'new:"new"',
		]);
	});

	test('uses the nearest preceding mapping assignment when variable is reassigned', () => {
		const source = [
			'rename_map = {"old1": "new1"}',
			'rename_map = {"old2": "new2"}',
			'df.rename(columns=rename_map)',
		].join('\n');
		assert.deepStrictEqual(labels(source), [
			'old:"old2"',
			'new:"new2"',
		]);
	});

	test('does not highlight mapping variable assigned only after rename call', () => {
		const source = [
			'df.rename(columns=rename_map)',
			'rename_map = {"old": "new"}',
		].join('\n');
		assert.deepStrictEqual(labels(source), []);
	});
});
