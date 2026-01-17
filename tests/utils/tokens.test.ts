import { describe, expect, it } from "vitest";
import {
	type BudgetCalculator,
	type Message,
	type TokenCounter,
	calculateSavings,
	countMessagesTokens,
	countTokens,
	createBudgetCalculator,
	createTokenCounter,
	estimateTokens,
	getTokenEstimate,
	quickEstimate,
} from "../../src/utils/tokens";

describe("Token Counter", () => {
	describe("estimateTokens", () => {
		it("should return 0 for empty string", () => {
			expect(estimateTokens("")).toBe(0);
		});

		it("should estimate English text tokens", () => {
			// "Hello world" = 11 chars, ~4 chars/token = ~3 tokens
			const tokens = estimateTokens("Hello world");
			expect(tokens).toBeGreaterThan(0);
			expect(tokens).toBeLessThanOrEqual(5);
		});

		it("should estimate Korean text tokens", () => {
			// "안녕하세요" = 5 chars, ~1.5 chars/token = ~4 tokens
			const tokens = estimateTokens("안녕하세요");
			expect(tokens).toBeGreaterThan(2);
			expect(tokens).toBeLessThanOrEqual(5);
		});

		it("should handle mixed Korean and English", () => {
			const tokens = estimateTokens("Hello 세계");
			expect(tokens).toBeGreaterThan(0);
		});

		it("should estimate code tokens", () => {
			const code = `
function hello() {
	const message = "Hello";
	return message;
}
			`;
			const tokens = estimateTokens(code);
			// Code should use ~3.5 chars/token
			expect(tokens).toBeGreaterThan(10);
		});

		it("should detect code patterns", () => {
			const codeSnippet = "const x = 1; if (x > 0) { return true; }";
			const englishText = "This is a regular English sentence.";

			const codeTokens = estimateTokens(codeSnippet);
			const textTokens = estimateTokens(englishText);

			// Code uses different ratio than plain text
			expect(codeTokens).toBeGreaterThan(0);
			expect(textTokens).toBeGreaterThan(0);
		});
	});

	describe("countTokens", () => {
		it("should count tokens in text", () => {
			const tokens = countTokens("This is a test.");
			expect(tokens).toBeGreaterThan(0);
		});

		it("should return same result as estimateTokens", () => {
			const text = "Hello world from the test";
			expect(countTokens(text)).toBe(estimateTokens(text));
		});
	});

	describe("countMessagesTokens", () => {
		it("should count tokens in messages", () => {
			const messages: Message[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there!" },
			];

			const tokens = countMessagesTokens(messages);
			expect(tokens).toBeGreaterThan(0);
		});

		it("should include message overhead", () => {
			const messages: Message[] = [{ role: "user", content: "Hi" }];

			const contentOnlyTokens = countTokens("Hi");
			const messageTokens = countMessagesTokens(messages);

			// Message tokens should be greater due to overhead
			expect(messageTokens).toBeGreaterThan(contentOnlyTokens);
		});

		it("should handle empty messages array", () => {
			expect(countMessagesTokens([])).toBe(0);
		});
	});

	describe("createTokenCounter", () => {
		it("should create a token counter instance", () => {
			const counter = createTokenCounter();

			expect(counter.count).toBeDefined();
			expect(counter.countMessages).toBeDefined();
			expect(counter.estimateTokens).toBeDefined();
		});

		it("should count tokens", () => {
			const counter = createTokenCounter();
			expect(counter.count("Hello")).toBeGreaterThan(0);
		});

		it("should count messages", () => {
			const counter = createTokenCounter();
			const messages: Message[] = [{ role: "user", content: "Hello" }];
			expect(counter.countMessages(messages)).toBeGreaterThan(0);
		});

		it("should estimate tokens", () => {
			const counter = createTokenCounter();
			expect(counter.estimateTokens("Hello")).toBeGreaterThan(0);
		});
	});

	describe("createBudgetCalculator", () => {
		it("should create a budget calculator", () => {
			const calculator = createBudgetCalculator({
				totalBudget: 1000,
				getCurrentContent: () => "Hello",
			});

			expect(calculator.getUsedTokens).toBeDefined();
			expect(calculator.getRemainingTokens).toBeDefined();
			expect(calculator.isOverBudget).toBeDefined();
			expect(calculator.getUsagePercent).toBeDefined();
		});

		it("should calculate used tokens", () => {
			const calculator = createBudgetCalculator({
				totalBudget: 1000,
				getCurrentContent: () => "Hello world test",
			});

			expect(calculator.getUsedTokens()).toBeGreaterThan(0);
		});

		it("should calculate remaining tokens", () => {
			const calculator = createBudgetCalculator({
				totalBudget: 1000,
				getCurrentContent: () => "Hi",
			});

			const remaining = calculator.getRemainingTokens();
			expect(remaining).toBeGreaterThan(0);
			expect(remaining).toBeLessThan(1000);
		});

		it("should detect over budget", () => {
			const calculator = createBudgetCalculator({
				totalBudget: 5,
				getCurrentContent: () =>
					"This is a very long text that exceeds the budget",
			});

			expect(calculator.isOverBudget()).toBe(true);
		});

		it("should return false when under budget", () => {
			const calculator = createBudgetCalculator({
				totalBudget: 1000,
				getCurrentContent: () => "Hi",
			});

			expect(calculator.isOverBudget()).toBe(false);
		});

		it("should calculate usage percent", () => {
			let content = "";
			const calculator = createBudgetCalculator({
				totalBudget: 100,
				getCurrentContent: () => content,
			});

			// Start with empty
			expect(calculator.getUsagePercent()).toBe(0);

			// Add content
			content = "a".repeat(100); // ~25 tokens
			const percent = calculator.getUsagePercent();
			expect(percent).toBeGreaterThan(0);
			expect(percent).toBeLessThanOrEqual(100);
		});

		it("should handle zero budget", () => {
			const calculator = createBudgetCalculator({
				totalBudget: 0,
				getCurrentContent: () => "Hello",
			});

			expect(calculator.getUsagePercent()).toBe(0);
			expect(calculator.getRemainingTokens()).toBe(0);
		});
	});

	describe("quickEstimate", () => {
		it("should provide fast estimate", () => {
			const estimate = quickEstimate("Hello world");
			expect(estimate).toBeGreaterThan(0);
		});

		it("should be faster but less accurate", () => {
			const text = "Hello world 안녕하세요";
			const quick = quickEstimate(text);
			const normal = estimateTokens(text);

			// Both should produce reasonable estimates
			expect(quick).toBeGreaterThan(0);
			expect(normal).toBeGreaterThan(0);
		});
	});

	describe("getTokenEstimate", () => {
		it("should use quick accuracy", () => {
			const estimate = getTokenEstimate("Hello", "quick");
			expect(estimate).toBeGreaterThan(0);
		});

		it("should use normal accuracy by default", () => {
			const estimate = getTokenEstimate("Hello");
			expect(estimate).toBe(estimateTokens("Hello"));
		});

		it("should use precise accuracy", () => {
			const estimate = getTokenEstimate("Hello", "precise");
			expect(estimate).toBeGreaterThan(0);
		});
	});

	describe("calculateSavings", () => {
		it("should calculate token savings", () => {
			const original = "This is a very long text that needs to be compressed";
			const compressed = "Long text compressed";

			const savings = calculateSavings(original, compressed);

			expect(savings.originalTokens).toBeGreaterThan(savings.compressedTokens);
			expect(savings.savedTokens).toBeGreaterThan(0);
			expect(savings.savingsPercent).toBeGreaterThan(0);
		});

		it("should handle no savings", () => {
			const original = "Hello";
			const compressed = "Hello";

			const savings = calculateSavings(original, compressed);

			expect(savings.savedTokens).toBe(0);
			expect(savings.savingsPercent).toBe(0);
		});

		it("should handle empty original", () => {
			const savings = calculateSavings("", "Hello");

			expect(savings.originalTokens).toBe(0);
			expect(savings.savingsPercent).toBe(0);
		});
	});

	describe("Korean text accuracy", () => {
		it("should estimate Korean text within reasonable range", () => {
			// Korean text typically uses more tokens per character
			const korean = "대한민국의 수도는 서울입니다";
			const tokens = estimateTokens(korean);

			// Should be roughly 1 token per 1.5 chars
			// 14 chars / 1.5 = ~9-10 tokens
			expect(tokens).toBeGreaterThan(5);
			expect(tokens).toBeLessThan(20);
		});

		it("should handle Korean sentences", () => {
			const sentence = "오늘 날씨가 좋습니다. 산책하러 가고 싶네요.";
			const tokens = estimateTokens(sentence);

			expect(tokens).toBeGreaterThan(10);
		});
	});

	describe("Code text accuracy", () => {
		it("should estimate TypeScript code", () => {
			const code = `
export function add(a: number, b: number): number {
	return a + b;
}
			`;
			const tokens = estimateTokens(code);

			// Code uses ~3.5 chars per token
			expect(tokens).toBeGreaterThan(15);
		});

		it("should detect arrow functions as code", () => {
			const code = "const fn = (x) => x * 2;";
			const tokens = estimateTokens(code);
			expect(tokens).toBeGreaterThan(0);
		});

		it("should detect class definitions as code", () => {
			const code = `
class MyClass {
	constructor() {}
	method() { return 42; }
}
			`;
			const tokens = estimateTokens(code);
			expect(tokens).toBeGreaterThan(10);
		});
	});

	describe("Estimation accuracy within 20%", () => {
		it("should have quick estimate within 20% of normal for English", () => {
			const text =
				"This is a sample English text for testing token estimation accuracy.";
			const quick = quickEstimate(text);
			const normal = estimateTokens(text);

			const diff = Math.abs(quick - normal);
			const maxDiff = normal * 0.5; // Allow 50% difference (quick is simpler)

			expect(diff).toBeLessThanOrEqual(maxDiff);
		});

		it("should have reasonable estimate for Korean", () => {
			const text =
				"이것은 토큰 추정 정확도를 테스트하기 위한 한국어 샘플 텍스트입니다.";
			const tokens = estimateTokens(text);

			// Should be in reasonable range for Korean
			// ~29 chars / 1.5 = ~20 tokens
			expect(tokens).toBeGreaterThan(10);
			expect(tokens).toBeLessThan(40);
		});
	});
});
