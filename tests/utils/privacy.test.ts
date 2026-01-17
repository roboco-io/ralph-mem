/**
 * Privacy utilities tests
 */

import { describe, expect, it } from "vitest";
import {
	extractPrivateContent,
	hasPrivateTags,
	isEntirelyPrivate,
	stripPrivateTags,
} from "../../src/utils/privacy";

describe("stripPrivateTags", () => {
	it("should remove single private tag", () => {
		const input = "My API key is <private>sk-1234567890</private>";
		const result = stripPrivateTags(input);
		expect(result).toBe("My API key is [PRIVATE]");
	});

	it("should remove multiple private tags", () => {
		const input =
			"Key: <private>secret1</private> and <private>secret2</private>";
		const result = stripPrivateTags(input);
		expect(result).toBe("Key: [PRIVATE] and [PRIVATE]");
	});

	it("should handle multiline private content", () => {
		const input = `Config:
<private>
API_KEY=secret
DB_PASSWORD=password123
</private>
End of config`;
		const result = stripPrivateTags(input);
		expect(result).toBe(`Config:
[PRIVATE]
End of config`);
	});

	it("should be case insensitive", () => {
		const input = "Data: <PRIVATE>secret</PRIVATE>";
		const result = stripPrivateTags(input);
		expect(result).toBe("Data: [PRIVATE]");
	});

	it("should handle mixed case tags", () => {
		const input = "Data: <Private>secret</Private>";
		const result = stripPrivateTags(input);
		expect(result).toBe("Data: [PRIVATE]");
	});

	it("should return unchanged if no private tags", () => {
		const input = "No secrets here";
		const result = stripPrivateTags(input);
		expect(result).toBe("No secrets here");
	});
});

describe("hasPrivateTags", () => {
	it("should return true when private tags exist", () => {
		expect(hasPrivateTags("<private>secret</private>")).toBe(true);
		expect(hasPrivateTags("Data: <private>secret</private>")).toBe(true);
	});

	it("should return false when no private tags", () => {
		expect(hasPrivateTags("No secrets")).toBe(false);
		expect(hasPrivateTags("<other>tag</other>")).toBe(false);
	});
});

describe("extractPrivateContent", () => {
	it("should extract content from private tags", () => {
		const input =
			"Key: <private>secret1</private> and <private>secret2</private>";
		const result = extractPrivateContent(input);
		expect(result).toEqual(["secret1", "secret2"]);
	});

	it("should return empty array if no private tags", () => {
		const result = extractPrivateContent("No secrets");
		expect(result).toEqual([]);
	});

	it("should handle multiline content", () => {
		const input = "<private>\nline1\nline2\n</private>";
		const result = extractPrivateContent(input);
		expect(result).toEqual(["\nline1\nline2\n"]);
	});
});

describe("isEntirelyPrivate", () => {
	it("should return true for entirely private content", () => {
		expect(isEntirelyPrivate("<private>all secret</private>")).toBe(true);
		expect(isEntirelyPrivate("  <private>all secret</private>  ")).toBe(true);
	});

	it("should return false for partially private content", () => {
		expect(isEntirelyPrivate("Prefix <private>secret</private>")).toBe(false);
		expect(isEntirelyPrivate("<private>secret</private> suffix")).toBe(false);
	});

	it("should return false for no private tags", () => {
		expect(isEntirelyPrivate("No secrets here")).toBe(false);
	});
});
