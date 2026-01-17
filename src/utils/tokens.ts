/**
 * Token Counter Utility
 *
 * Provides token counting and budget calculation for context management.
 * Uses character-based estimation for Claude compatibility.
 *
 * See: docs/issues/023-token-counter/README.md
 */

/**
 * Message type for token counting
 */
export interface Message {
	role: "user" | "assistant" | "system";
	content: string;
}

/**
 * Token counter interface
 */
export interface TokenCounter {
	count(text: string): number;
	countMessages(messages: Message[]): number;
	estimateTokens(text: string): number;
}

/**
 * Budget calculator interface
 */
export interface BudgetCalculator {
	getUsedTokens(): number;
	getRemainingTokens(): number;
	isOverBudget(): boolean;
	getUsagePercent(): number;
}

/**
 * Token estimation constants
 *
 * Based on empirical analysis of Claude tokenization:
 * - English: ~4 characters per token
 * - Korean: ~1.5-2 characters per token
 * - Code: ~3.5 characters per token
 */
const CHARS_PER_TOKEN_EN = 4;
const CHARS_PER_TOKEN_KO = 1.5;
const CHARS_PER_TOKEN_CODE = 3.5;

/**
 * Message overhead tokens (role, structure)
 */
const MESSAGE_OVERHEAD = 4;

/**
 * Check if character is Korean
 */
function isKorean(char: string): boolean {
	const code = char.charCodeAt(0);
	// Hangul syllables: AC00-D7A3
	// Hangul Jamo: 1100-11FF
	// Hangul Compatibility Jamo: 3130-318F
	return (
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0x1100 && code <= 0x11ff) ||
		(code >= 0x3130 && code <= 0x318f)
	);
}

/**
 * Check if text appears to be code
 */
function isCodeLike(text: string): boolean {
	// Check for common code patterns
	const codePatterns = [
		/\bfunction\b/,
		/\bconst\b/,
		/\blet\b/,
		/\bvar\b/,
		/\bclass\b/,
		/\bimport\b/,
		/\bexport\b/,
		/\breturn\b/,
		/\bif\s*\(/,
		/\bfor\s*\(/,
		/\bwhile\s*\(/,
		/=>/,
		/\{\s*$/m,
		/^\s*\}/m,
		/\[\s*$/m,
		/^\s*\]/m,
		/;\s*$/m,
	];

	let matches = 0;
	for (const pattern of codePatterns) {
		if (pattern.test(text)) {
			matches++;
		}
	}

	// If more than 3 code patterns found, likely code
	return matches >= 3;
}

/**
 * Estimate tokens for text
 *
 * Uses character-based estimation with language detection.
 */
export function estimateTokens(text: string): number {
	if (!text) return 0;

	// Check if it looks like code
	if (isCodeLike(text)) {
		return Math.ceil(text.length / CHARS_PER_TOKEN_CODE);
	}

	// Count Korean vs other characters
	let koreanChars = 0;
	let otherChars = 0;

	for (const char of text) {
		if (isKorean(char)) {
			koreanChars++;
		} else {
			otherChars++;
		}
	}

	// Calculate weighted estimate
	const koreanTokens = Math.ceil(koreanChars / CHARS_PER_TOKEN_KO);
	const otherTokens = Math.ceil(otherChars / CHARS_PER_TOKEN_EN);

	return koreanTokens + otherTokens;
}

/**
 * Count tokens in text
 *
 * For now, uses estimation. Can be replaced with tiktoken for accuracy.
 */
export function countTokens(text: string): number {
	return estimateTokens(text);
}

/**
 * Count tokens in a message
 */
export function countMessageTokens(message: Message): number {
	return countTokens(message.content) + MESSAGE_OVERHEAD;
}

/**
 * Count tokens in messages array
 */
export function countMessagesTokens(messages: Message[]): number {
	return messages.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
}

/**
 * Create a token counter instance
 */
export function createTokenCounter(): TokenCounter {
	return {
		count(text: string): number {
			return countTokens(text);
		},

		countMessages(messages: Message[]): number {
			return countMessagesTokens(messages);
		},

		estimateTokens(text: string): number {
			return estimateTokens(text);
		},
	};
}

/**
 * Budget calculator options
 */
export interface BudgetOptions {
	totalBudget: number;
	getCurrentContent: () => string;
}

/**
 * Create a budget calculator instance
 */
export function createBudgetCalculator(
	options: BudgetOptions,
): BudgetCalculator {
	const { totalBudget, getCurrentContent } = options;

	return {
		getUsedTokens(): number {
			return countTokens(getCurrentContent());
		},

		getRemainingTokens(): number {
			return Math.max(0, totalBudget - this.getUsedTokens());
		},

		isOverBudget(): boolean {
			return this.getUsedTokens() > totalBudget;
		},

		getUsagePercent(): number {
			const used = this.getUsedTokens();
			if (totalBudget === 0) return 0;
			return Math.round((used / totalBudget) * 100);
		},
	};
}

/**
 * Quick estimate for budget check (faster, less accurate)
 */
export function quickEstimate(text: string): number {
	// Simple: ~3.5 chars per token on average
	return Math.ceil(text.length / 3.5);
}

/**
 * Get token estimate with accuracy level
 */
export function getTokenEstimate(
	text: string,
	accuracy: "quick" | "normal" | "precise" = "normal",
): number {
	switch (accuracy) {
		case "quick":
			return quickEstimate(text);
		case "precise":
			// For now, same as normal. Could use tiktoken here.
			return estimateTokens(text);
		default:
			return estimateTokens(text);
	}
}

/**
 * Calculate compression savings
 */
export function calculateSavings(
	original: string,
	compressed: string,
): {
	originalTokens: number;
	compressedTokens: number;
	savedTokens: number;
	savingsPercent: number;
} {
	const originalTokens = countTokens(original);
	const compressedTokens = countTokens(compressed);
	const savedTokens = originalTokens - compressedTokens;
	const savingsPercent =
		originalTokens > 0 ? Math.round((savedTokens / originalTokens) * 100) : 0;

	return {
		originalTokens,
		compressedTokens,
		savedTokens,
		savingsPercent,
	};
}
