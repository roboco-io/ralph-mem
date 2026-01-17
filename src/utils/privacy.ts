/**
 * Privacy Utilities
 *
 * Handles <private> tag processing and content sanitization.
 * Inspired by claude-mem's privacy features.
 */

/**
 * Remove content wrapped in <private> tags from text.
 *
 * Example:
 *   Input:  "My API key is <private>sk-1234567890</private>"
 *   Output: "My API key is [PRIVATE]"
 *
 * Supports multiline content and nested content.
 */
export function stripPrivateTags(content: string): string {
	// Match <private>...</private> tags (case-insensitive, multiline)
	const privateTagRegex = /<private>[\s\S]*?<\/private>/gi;

	return content.replace(privateTagRegex, "[PRIVATE]");
}

/**
 * Check if content contains any <private> tags
 */
export function hasPrivateTags(content: string): boolean {
	const privateTagRegex = /<private>[\s\S]*?<\/private>/gi;
	return privateTagRegex.test(content);
}

/**
 * Extract content from <private> tags (for debugging/logging)
 * Returns the extracted private content without storing it
 */
export function extractPrivateContent(content: string): string[] {
	const privateTagRegex = /<private>([\s\S]*?)<\/private>/gi;
	const matches: string[] = [];

	for (const match of content.matchAll(privateTagRegex)) {
		matches.push(match[1]);
	}

	return matches;
}

/**
 * Check if entire content should be excluded (wrapped in <private>)
 * Returns true if the entire content is private
 */
export function isEntirelyPrivate(content: string): boolean {
	const trimmed = content.trim();

	// Check if entire content is wrapped in a single <private> tag
	const fullPrivateRegex = /^<private>[\s\S]*<\/private>$/i;

	if (fullPrivateRegex.test(trimmed)) {
		// Verify there's no non-private content
		const stripped = stripPrivateTags(trimmed);
		return stripped.trim() === "[PRIVATE]";
	}

	return false;
}
