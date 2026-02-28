export type RenameMappingCaptureKind = 'old' | 'new';

export interface OffsetRange {
	start: number;
	end: number;
}

export interface RenameMappingCapture {
	kind: RenameMappingCaptureKind;
	range: OffsetRange;
}

interface ParsedStringLiteral extends OffsetRange {
	content: string;
	isStatic: boolean;
}

interface DictAssignment extends OffsetRange {
	name: string;
}

interface CallArgument {
	name?: string;
	expression: OffsetRange;
}

interface RenameCall {
	renameStart: number;
	openParen: number;
	closeParen: number;
	isMethodCall: boolean;
	receiverIdentifier?: string;
	receiverContext: string;
}

interface PolarsContext {
	aliases: Set<string>;
	importedSymbols: Set<string>;
	variables: Set<string>;
}

const OPENING_BRACKETS = new Set(['(', '[', '{']);
const CLOSING_TO_OPENING: Record<string, string> = {
	')': '(',
	']': '[',
	'}': '{',
};

export function extractRenameMappingCaptures(source: string): RenameMappingCapture[] {
	const assignments = collectDictAssignments(source);
	const polarsContext = collectPolarsContext(source);
	const calls = collectRenameCalls(source);

	const dictRanges: OffsetRange[] = [];
	for (const call of calls) {
		const argumentsList = parseCallArguments(source, call.openParen + 1, call.closeParen);
		const mappingExpressions = collectMappingExpressionsForCall(source, argumentsList, call, polarsContext);
		for (const expression of mappingExpressions) {
			const resolvedDictRanges = resolveDictRangesFromExpression(
				source,
				expression,
				assignments,
				call.renameStart
			);
			dictRanges.push(...resolvedDictRanges);
		}
	}

	const captures: RenameMappingCapture[] = [];
	const dedupe = new Set<string>();
	for (const dictRange of dictRanges) {
		for (const capture of collectDictCaptures(source, dictRange)) {
			const key = `${capture.kind}:${capture.range.start}:${capture.range.end}`;
			if (!dedupe.has(key)) {
				dedupe.add(key);
				captures.push(capture);
			}
		}
	}

	captures.sort((left, right) => {
		if (left.range.start !== right.range.start) {
			return left.range.start - right.range.start;
		}
		if (left.range.end !== right.range.end) {
			return left.range.end - right.range.end;
		}
		if (left.kind === right.kind) {
			return 0;
		}
		return left.kind === 'old' ? -1 : 1;
	});

	return captures;
}

function collectDictAssignments(source: string): Map<string, DictAssignment[]> {
	const assignments = new Map<string, DictAssignment[]>();
	let lineStart = 0;

	while (lineStart < source.length) {
		const lineEnd = findLineEnd(source, lineStart);
		let cursor = skipSpaces(source, lineStart, lineEnd);
		const identifier = readIdentifier(source, cursor, lineEnd);
		if (!identifier) {
			lineStart = nextLineStart(source, lineEnd);
			continue;
		}

		cursor = skipSpaces(source, identifier.end, lineEnd);
		let equals = -1;
		if (cursor < lineEnd && source[cursor] === '=') {
			equals = cursor;
		} else if (cursor < lineEnd && source[cursor] === ':') {
			equals = findTopLevelCharacter(source, cursor + 1, lineEnd, '=');
		}

		if (equals === -1) {
			lineStart = nextLineStart(source, lineEnd);
			continue;
		}

		cursor = skipWhitespaceAndLineBreaks(source, equals + 1);
		if (cursor >= source.length || source[cursor] !== '{') {
			lineStart = nextLineStart(source, lineEnd);
			continue;
		}

		const closingBrace = findMatchingBracket(source, cursor);
		if (closingBrace === -1) {
			lineStart = nextLineStart(source, lineEnd);
			continue;
		}

		const current = assignments.get(identifier.value) ?? [];
		current.push({
			name: identifier.value,
			start: cursor,
			end: closingBrace + 1,
		});
		assignments.set(identifier.value, current);
		lineStart = nextLineStart(source, lineEnd);
	}

	return assignments;
}

function collectPolarsContext(source: string): PolarsContext {
	const aliases = new Set<string>();
	const importedSymbols = new Set<string>();
	const assignmentLines: Array<{ lhs: string; rhs: string }> = [];

	for (const line of source.split(/\r?\n/)) {
		const importMatch = line.match(/^\s*import\s+polars(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/);
		if (importMatch) {
			aliases.add(importMatch[1] ?? 'polars');
			continue;
		}

		const fromImportMatch = line.match(/^\s*from\s+polars\s+import\s+(.+)$/);
		if (fromImportMatch) {
			for (const part of fromImportMatch[1].split(',')) {
				const parsed = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
				if (parsed) {
					importedSymbols.add(parsed[2] ?? parsed[1]);
				}
			}
			continue;
		}

		const assignmentMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
		if (assignmentMatch) {
			assignmentLines.push({
				lhs: assignmentMatch[1],
				rhs: assignmentMatch[2],
			});
		}
	}

	if (aliases.size === 0) {
		aliases.add('pl');
	}

	const variables = new Set<string>();
	for (const assignment of assignmentLines) {
		if (rhsLooksPolars(assignment.rhs, aliases, importedSymbols, variables)) {
			variables.add(assignment.lhs);
		}
	}

	let changed = true;
	while (changed) {
		changed = false;
		for (const assignment of assignmentLines) {
			if (variables.has(assignment.lhs)) {
				continue;
			}
			if (rhsLooksPolars(assignment.rhs, aliases, importedSymbols, variables)) {
				variables.add(assignment.lhs);
				changed = true;
			}
		}
	}

	return { aliases, importedSymbols, variables };
}

function rhsLooksPolars(
	rightHandSide: string,
	aliases: Set<string>,
	importedSymbols: Set<string>,
	variables: Set<string>
): boolean {
	for (const alias of aliases) {
		if (new RegExp(`\\b${escapeRegex(alias)}\\s*\\.`).test(rightHandSide)) {
			return true;
		}
	}
	for (const symbol of importedSymbols) {
		if (new RegExp(`\\b${escapeRegex(symbol)}\\s*\\(`).test(rightHandSide)) {
			return true;
		}
	}
	for (const variable of variables) {
		if (new RegExp(`\\b${escapeRegex(variable)}\\s*\\.`).test(rightHandSide)) {
			return true;
		}
	}
	return false;
}

function collectRenameCalls(source: string): RenameCall[] {
	const calls: RenameCall[] = [];
	for (let cursor = 0; cursor < source.length; cursor++) {
		const stringLiteral = readStringLiteral(source, cursor);
		if (stringLiteral) {
			cursor = stringLiteral.end - 1;
			continue;
		}
		if (source[cursor] === '#') {
			cursor = skipComment(source, cursor);
			continue;
		}
		if (!source.startsWith('rename', cursor)) {
			continue;
		}
		if (!isIdentifierBoundary(source, cursor - 1) || !isIdentifierBoundary(source, cursor + 6)) {
			continue;
		}
		let openParen = skipSpacesAndTabs(source, cursor + 6);
		if (openParen >= source.length || source[openParen] !== '(') {
			continue;
		}

		const closeParen = findMatchingBracket(source, openParen);
		if (closeParen === -1) {
			continue;
		}

		const dotIndex = findPreviousNonWhitespace(source, cursor - 1);
		const isMethodCall = dotIndex !== -1 && source[dotIndex] === '.';
		const receiverIdentifier = isMethodCall ? getImmediateReceiverIdentifier(source, dotIndex) : undefined;
		const receiverContext = isMethodCall ? getReceiverContext(source, dotIndex) : '';
		calls.push({
			renameStart: cursor,
			openParen,
			closeParen,
			isMethodCall,
			receiverIdentifier,
			receiverContext,
		});
		cursor = closeParen;
	}
	return calls;
}

function collectMappingExpressionsForCall(
	source: string,
	argumentsList: CallArgument[],
	call: RenameCall,
	polarsContext: PolarsContext
): OffsetRange[] {
	const keywordArguments = new Map<string, CallArgument>();
	const positionalArguments: CallArgument[] = [];

	for (const argument of argumentsList) {
		if (argument.name) {
			keywordArguments.set(argument.name, argument);
		} else {
			positionalArguments.push(argument);
		}
	}

	const mappingExpressions: OffsetRange[] = [];
	const columnsArgument = keywordArguments.get('columns');
	if (columnsArgument) {
		mappingExpressions.push(columnsArgument.expression);
		return mappingExpressions;
	}

	if (positionalArguments.length === 0) {
		return mappingExpressions;
	}

	const axisArgument = keywordArguments.get('axis');
	if (axisArgument && isColumnsAxisExpression(source, axisArgument.expression)) {
		mappingExpressions.push(positionalArguments[0].expression);
		return mappingExpressions;
	}

	if (call.isMethodCall && isLikelyPolarsRenameCall(call, polarsContext)) {
		mappingExpressions.push(positionalArguments[0].expression);
	}

	return mappingExpressions;
}

function isColumnsAxisExpression(source: string, range: OffsetRange): boolean {
	const normalized = normalizeExpressionRange(source, range);
	if (!normalized) {
		return false;
	}
	const expressionText = source.slice(normalized.start, normalized.end).trim();
	if (expressionText === '1') {
		return true;
	}

	const literal = parseStaticStringLiteral(source, normalized);
	return literal?.content.trim().toLowerCase() === 'columns';
}

function isLikelyPolarsRenameCall(call: RenameCall, polarsContext: PolarsContext): boolean {
	const receiver = call.receiverIdentifier;
	if (receiver) {
		if (receiver.toLowerCase().startsWith('pl_')) {
			return true;
		}
		if (polarsContext.variables.has(receiver)) {
			return true;
		}
	}

	for (const alias of polarsContext.aliases) {
		if (new RegExp(`\\b${escapeRegex(alias)}\\s*\\.`).test(call.receiverContext)) {
			return true;
		}
	}

	return false;
}

function resolveDictRangesFromExpression(
	source: string,
	expression: OffsetRange,
	assignments: Map<string, DictAssignment[]>,
	callPosition: number
): OffsetRange[] {
	const dictLiteralRange = getDictLiteralExpressionRange(source, expression);
	if (dictLiteralRange) {
		return [dictLiteralRange];
	}

	const identifier = getIdentifierExpression(source, expression);
	if (!identifier) {
		return [];
	}

	const knownAssignments = assignments.get(identifier);
	if (!knownAssignments || knownAssignments.length === 0) {
		return [];
	}

	const precedingAssignments = knownAssignments.filter((assignment) => assignment.start <= callPosition);
	if (precedingAssignments.length > 0) {
		const latest = precedingAssignments.reduce((best, candidate) => (
			candidate.start > best.start ? candidate : best
		));
		return [{ start: latest.start, end: latest.end }];
	}

	return [];
}

function collectDictCaptures(source: string, dictRange: OffsetRange): RenameMappingCapture[] {
	const captures: RenameMappingCapture[] = [];
	const bodyStart = dictRange.start + 1;
	const bodyEnd = dictRange.end - 1;
	if (bodyEnd <= bodyStart) {
		return captures;
	}

	for (const entry of splitTopLevelRanges(source, bodyStart, bodyEnd, ',')) {
		const trimmedEntry = normalizeExpressionRange(source, entry, { unwrapParentheses: false });
		if (!trimmedEntry) {
			continue;
		}

		const entryText = source.slice(trimmedEntry.start, trimmedEntry.end).trimStart();
		if (entryText.startsWith('**')) {
			continue;
		}

		const separator = findTopLevelCharacter(source, trimmedEntry.start, trimmedEntry.end, ':');
		if (separator === -1) {
			continue;
		}

		const keyRange = normalizeExpressionRange(
			source,
			{ start: trimmedEntry.start, end: separator }
		);
		const valueRange = normalizeExpressionRange(
			source,
			{ start: separator + 1, end: trimmedEntry.end }
		);
		if (keyRange) {
			const keyLiteral = parseStaticStringLiteral(source, keyRange);
			if (keyLiteral) {
				captures.push({
					kind: 'old',
					range: { start: keyLiteral.start, end: keyLiteral.end },
				});
			}
		}

		if (valueRange) {
			const valueLiteral = parseStaticStringLiteral(source, valueRange);
			if (valueLiteral) {
				captures.push({
					kind: 'new',
					range: { start: valueLiteral.start, end: valueLiteral.end },
				});
			}
		}
	}

	return captures;
}

function parseCallArguments(source: string, start: number, end: number): CallArgument[] {
	const argumentsList: CallArgument[] = [];
	for (const segment of splitTopLevelRanges(source, start, end, ',')) {
		const argumentRange = normalizeExpressionRange(source, segment, { unwrapParentheses: false });
		if (!argumentRange) {
			continue;
		}
		const equals = findTopLevelCharacter(source, argumentRange.start, argumentRange.end, '=');
		if (equals === -1) {
			argumentsList.push({ expression: argumentRange });
			continue;
		}

		const left = normalizeExpressionRange(
			source,
			{ start: argumentRange.start, end: equals },
			{ unwrapParentheses: false }
		);
		const right = normalizeExpressionRange(
			source,
			{ start: equals + 1, end: argumentRange.end }
		);
		if (!left || !right) {
			continue;
		}
		const name = source.slice(left.start, left.end);
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
			argumentsList.push({ expression: argumentRange });
			continue;
		}
		argumentsList.push({
			name,
			expression: right,
		});
	}
	return argumentsList;
}

function getDictLiteralExpressionRange(source: string, range: OffsetRange): OffsetRange | undefined {
	const normalized = normalizeExpressionRange(source, range);
	if (!normalized || source[normalized.start] !== '{') {
		return undefined;
	}
	const closingBrace = findMatchingBracket(source, normalized.start);
	if (closingBrace === -1 || closingBrace + 1 !== normalized.end) {
		return undefined;
	}
	return normalized;
}

function getIdentifierExpression(source: string, range: OffsetRange): string | undefined {
	const normalized = normalizeExpressionRange(source, range);
	if (!normalized) {
		return undefined;
	}
	const expression = source.slice(normalized.start, normalized.end);
	if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expression)) {
		return expression;
	}
	return undefined;
}

function normalizeExpressionRange(
	source: string,
	range: OffsetRange,
	options: { unwrapParentheses?: boolean } = {}
): OffsetRange | undefined {
	let normalized = trimRange(source, range);
	if (!normalized) {
		return undefined;
	}

	normalized = trimRange(source, stripLeadingTopLevelComments(source, normalized)) ?? normalized;
	if (!normalized) {
		return undefined;
	}

	normalized = trimRange(source, stripTrailingTopLevelComment(source, normalized)) ?? normalized;
	if (!normalized) {
		return undefined;
	}

	const shouldUnwrap = options.unwrapParentheses ?? true;
	if (!shouldUnwrap) {
		return normalized;
	}

	while (source[normalized.start] === '(') {
		const closingParen = findMatchingBracket(source, normalized.start);
		if (closingParen === -1 || closingParen + 1 !== normalized.end) {
			break;
		}
		const inner = trimRange(source, { start: normalized.start + 1, end: normalized.end - 1 });
		if (!inner) {
			break;
		}
		normalized = inner;
	}

	return normalized;
}

function stripLeadingTopLevelComments(source: string, range: OffsetRange): OffsetRange {
	let start = range.start;
	while (start < range.end) {
		while (start < range.end && isWhitespaceCharacter(source[start])) {
			start++;
		}
		if (start >= range.end || source[start] !== '#') {
			break;
		}
		const commentEnd = skipComment(source, start);
		start = commentEnd + 1;
	}
	return { start, end: range.end };
}

function stripTrailingTopLevelComment(source: string, range: OffsetRange): OffsetRange {
	const stack: string[] = [];
	let hasMeaningfulContent = false;
	for (let cursor = range.start; cursor < range.end; cursor++) {
		const literal = readStringLiteral(source, cursor);
		if (literal) {
			hasMeaningfulContent = true;
			cursor = literal.end - 1;
			continue;
		}
		const char = source[cursor];
		if (char === '#') {
			if (stack.length === 0) {
				if (hasMeaningfulContent) {
					return { start: range.start, end: cursor };
				}
				cursor = skipComment(source, cursor);
				continue;
			}
			cursor = skipComment(source, cursor);
			continue;
		}
		if (OPENING_BRACKETS.has(char)) {
			hasMeaningfulContent = true;
			stack.push(char);
			continue;
		}
		const opening = CLOSING_TO_OPENING[char];
		if (opening && stack[stack.length - 1] === opening) {
			hasMeaningfulContent = true;
			stack.pop();
			continue;
		}
		if (!isWhitespaceCharacter(char)) {
			hasMeaningfulContent = true;
		}
	}
	return range;
}

function findTopLevelCharacter(source: string, start: number, end: number, target: string): number {
	const stack: string[] = [];
	for (let cursor = start; cursor < end; cursor++) {
		const literal = readStringLiteral(source, cursor);
		if (literal) {
			cursor = literal.end - 1;
			continue;
		}
		const char = source[cursor];
		if (char === '#') {
			cursor = skipComment(source, cursor);
			continue;
		}
		if (OPENING_BRACKETS.has(char)) {
			stack.push(char);
			continue;
		}
		const opening = CLOSING_TO_OPENING[char];
		if (opening && stack[stack.length - 1] === opening) {
			stack.pop();
			continue;
		}
		if (stack.length === 0 && char === target) {
			return cursor;
		}
	}
	return -1;
}

function splitTopLevelRanges(source: string, start: number, end: number, separator: string): OffsetRange[] {
	const segments: OffsetRange[] = [];
	let currentStart = start;
	const stack: string[] = [];
	for (let cursor = start; cursor < end; cursor++) {
		const literal = readStringLiteral(source, cursor);
		if (literal) {
			cursor = literal.end - 1;
			continue;
		}
		const char = source[cursor];
		if (char === '#') {
			cursor = skipComment(source, cursor);
			continue;
		}
		if (OPENING_BRACKETS.has(char)) {
			stack.push(char);
			continue;
		}
		const opening = CLOSING_TO_OPENING[char];
		if (opening && stack[stack.length - 1] === opening) {
			stack.pop();
			continue;
		}
		if (stack.length === 0 && char === separator) {
			segments.push({ start: currentStart, end: cursor });
			currentStart = cursor + 1;
		}
	}
	segments.push({ start: currentStart, end });
	return segments;
}

function parseStaticStringLiteral(source: string, range: OffsetRange): ParsedStringLiteral | undefined {
	const literal = readStringLiteral(source, range.start);
	if (!literal || literal.end !== range.end || !literal.isStatic) {
		return undefined;
	}
	return literal;
}

function readStringLiteral(source: string, start: number): ParsedStringLiteral | undefined {
	if (start >= source.length) {
		return undefined;
	}
	const firstCharacter = source[start];
	if (!isQuote(firstCharacter) && !isStringPrefixCharacter(firstCharacter)) {
		return undefined;
	}

	if (isStringPrefixCharacter(firstCharacter) && start > 0 && isIdentifierCharacter(source[start - 1])) {
		return undefined;
	}

	let cursor = start;
	while (cursor < source.length && isStringPrefixCharacter(source[cursor]) && cursor - start < 3) {
		cursor++;
	}

	if (!isQuote(source[cursor])) {
		if (cursor !== start) {
			return undefined;
		}
		cursor = start;
	}

	const prefix = source.slice(start, cursor);
	const quote = source[cursor];
	if (!isQuote(quote)) {
		return undefined;
	}

	const isTripleQuoted = source.startsWith(quote.repeat(3), cursor);
	const quoteLength = isTripleQuoted ? 3 : 1;
	const openingEnd = cursor + quoteLength;
	const isRaw = /r/i.test(prefix);
	const isFormatted = /f/i.test(prefix);
	let containsInterpolation = false;
	cursor = openingEnd;

	while (cursor < source.length) {
		const char = source[cursor];

		if (isFormatted && char === '{') {
			if (source[cursor + 1] === '{') {
				cursor += 2;
				continue;
			}
			containsInterpolation = true;
		}
		if (isFormatted && char === '}') {
			if (source[cursor + 1] === '}') {
				cursor += 2;
				continue;
			}
			containsInterpolation = true;
		}

		if (!isRaw && char === '\\') {
			cursor += 2;
			continue;
		}

		if (isTripleQuoted) {
			if (source.startsWith(quote.repeat(3), cursor)) {
				const end = cursor + 3;
				return {
					start,
					end,
					content: source.slice(openingEnd, cursor),
					isStatic: !isFormatted || !containsInterpolation,
				};
			}
			cursor++;
			continue;
		}

		if (char === quote) {
			const end = cursor + 1;
			return {
				start,
				end,
				content: source.slice(openingEnd, cursor),
				isStatic: !isFormatted || !containsInterpolation,
			};
		}

		cursor++;
	}

	return undefined;
}

function findMatchingBracket(source: string, openingIndex: number): number {
	const opening = source[openingIndex];
	if (!OPENING_BRACKETS.has(opening)) {
		return -1;
	}

	const stack: string[] = [opening];
	for (let cursor = openingIndex + 1; cursor < source.length; cursor++) {
		const literal = readStringLiteral(source, cursor);
		if (literal) {
			cursor = literal.end - 1;
			continue;
		}
		const char = source[cursor];
		if (char === '#') {
			cursor = skipComment(source, cursor);
			continue;
		}
		if (OPENING_BRACKETS.has(char)) {
			stack.push(char);
			continue;
		}
		const expectedOpening = CLOSING_TO_OPENING[char];
		if (!expectedOpening) {
			continue;
		}
		if (stack[stack.length - 1] === expectedOpening) {
			stack.pop();
			if (stack.length === 0) {
				return cursor;
			}
		}
	}
	return -1;
}

function getImmediateReceiverIdentifier(source: string, dotIndex: number): string | undefined {
	let cursor = dotIndex - 1;
	while (cursor >= 0 && isWhitespaceCharacter(source[cursor])) {
		cursor--;
	}
	if (cursor < 0 || !isIdentifierCharacter(source[cursor])) {
		return undefined;
	}

	const end = cursor + 1;
	while (cursor >= 0 && isIdentifierCharacter(source[cursor])) {
		cursor--;
	}
	const start = cursor + 1;
	return source.slice(start, end);
}

function getReceiverContext(source: string, dotIndex: number): string {
	const lineStart = source.lastIndexOf('\n', dotIndex) + 1;
	return source.slice(lineStart, dotIndex);
}

function readIdentifier(source: string, start: number, end: number): { value: string; end: number } | undefined {
	if (start >= end) {
		return undefined;
	}
	if (!isIdentifierStart(source[start])) {
		return undefined;
	}
	let cursor = start + 1;
	while (cursor < end && isIdentifierCharacter(source[cursor])) {
		cursor++;
	}
	return {
		value: source.slice(start, cursor),
		end: cursor,
	};
}

function trimRange(source: string, range: OffsetRange): OffsetRange | undefined {
	let start = range.start;
	let end = range.end;
	while (start < end && isWhitespaceCharacter(source[start])) {
		start++;
	}
	while (end > start && isWhitespaceCharacter(source[end - 1])) {
		end--;
	}
	return start < end ? { start, end } : undefined;
}

function isIdentifierBoundary(source: string, index: number): boolean {
	if (index < 0 || index >= source.length) {
		return true;
	}
	return !isIdentifierCharacter(source[index]);
}

function isIdentifierStart(character: string | undefined): boolean {
	return !!character && /[A-Za-z_]/.test(character);
}

function isIdentifierCharacter(character: string | undefined): boolean {
	return !!character && /[A-Za-z0-9_]/.test(character);
}

function isWhitespaceCharacter(character: string | undefined): boolean {
	return character === ' ' || character === '\t' || character === '\n' || character === '\r' || character === '\f';
}

function isQuote(character: string | undefined): boolean {
	return character === '"' || character === '\'';
}

function isStringPrefixCharacter(character: string | undefined): boolean {
	return !!character && /[rRuUbBfF]/.test(character);
}

function skipSpaces(source: string, start: number, end: number): number {
	let cursor = start;
	while (cursor < end && (source[cursor] === ' ' || source[cursor] === '\t')) {
		cursor++;
	}
	return cursor;
}

function skipSpacesAndTabs(source: string, start: number): number {
	let cursor = start;
	while (cursor < source.length && (source[cursor] === ' ' || source[cursor] === '\t')) {
		cursor++;
	}
	return cursor;
}

function skipWhitespaceAndLineBreaks(source: string, start: number): number {
	let cursor = start;
	while (cursor < source.length && isWhitespaceCharacter(source[cursor])) {
		cursor++;
	}
	return cursor;
}

function skipComment(source: string, start: number): number {
	let cursor = start;
	while (cursor < source.length && source[cursor] !== '\n') {
		cursor++;
	}
	return cursor;
}

function findPreviousNonWhitespace(source: string, start: number): number {
	let cursor = start;
	while (cursor >= 0 && isWhitespaceCharacter(source[cursor])) {
		cursor--;
	}
	return cursor;
}

function findLineEnd(source: string, start: number): number {
	const newlineIndex = source.indexOf('\n', start);
	return newlineIndex === -1 ? source.length : newlineIndex;
}

function nextLineStart(source: string, lineEnd: number): number {
	if (lineEnd >= source.length) {
		return source.length;
	}
	return lineEnd + 1;
}

function escapeRegex(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
