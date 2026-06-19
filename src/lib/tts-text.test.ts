import { describe, it, expect } from "vitest";
import { normalizeMoneyForTTS, numberToWords, normalizeForTTS } from "./tts-text";

describe("normalizeMoneyForTTS", () => {
  it("expands dollars and cents", () => {
    expect(normalizeMoneyForTTS("The stock hit $5.08 today")).toBe(
      "The stock hit 5 dollars and 8 cents today"
    );
  });

  it("handles cents-only amounts", () => {
    expect(normalizeMoneyForTTS("up $0.50 a share")).toBe("up 50 cents a share");
  });

  it("drops zero cents", () => {
    expect(normalizeMoneyForTTS("priced at $5.00 flat")).toBe("priced at 5 dollars flat");
  });

  it("treats a single decimal digit as tens of cents", () => {
    expect(normalizeMoneyForTTS("$5.8")).toBe("5 dollars and 80 cents");
  });

  it("moves the dollar word after magnitudes", () => {
    expect(normalizeMoneyForTTS("a $1.5 billion buyback")).toBe("a 1.5 billion dollars buyback");
    expect(normalizeMoneyForTTS("worth $3B now")).toBe("worth 3 billion dollars now");
    expect(normalizeMoneyForTTS("$250 million deal")).toBe("250 million dollars deal");
    expect(normalizeMoneyForTTS("a $1.2T market")).toBe("a 1.2 trillion dollars market");
  });

  it("expands whole-dollar amounts and keeps thousands separators", () => {
    expect(normalizeMoneyForTTS("oil could hit $150 soon")).toBe("oil could hit 150 dollars soon");
    expect(normalizeMoneyForTTS("$1,250.50 total")).toBe("1,250 dollars and 50 cents total");
  });

  it("uses singular for one dollar / one cent", () => {
    expect(normalizeMoneyForTTS("just $1 more")).toBe("just 1 dollar more");
    expect(normalizeMoneyForTTS("$0.01 moves")).toBe("1 cent moves");
  });

  it("leaves percentages and plain decimals alone", () => {
    expect(normalizeMoneyForTTS("up 3.24% on volume of 2.5 million")).toBe(
      "up 3.24% on volume of 2.5 million"
    );
  });

  it("handles multiple amounts in one sentence", () => {
    expect(normalizeMoneyForTTS("from $5.08 to $150 and $2B")).toBe(
      "from 5 dollars and 8 cents to 150 dollars and 2 billion dollars"
    );
  });
});

describe("numberToWords", () => {
  it("converts common values", () => {
    expect(numberToWords(102)).toBe("one hundred and two");
    expect(numberToWords(21)).toBe("twenty-one");
    expect(numberToWords(90)).toBe("ninety");
    expect(numberToWords(1250)).toBe("one thousand two hundred and fifty");
    expect(numberToWords(1000000)).toBe("one million");
    expect(numberToWords(0)).toBe("zero");
  });
});

describe("normalizeForTTS (full pipeline)", () => {
  it("spells out standalone integers", () => {
    expect(normalizeForTTS("The index dropped 102 points")).toBe(
      "The index dropped one hundred and two points"
    );
  });

  it("spells out the digits produced by money expansion", () => {
    expect(normalizeForTTS("it hit $5.08")).toBe("it hit five dollars and eight cents");
    expect(normalizeForTTS("oil could hit $150")).toBe("oil could hit one hundred and fifty dollars");
  });

  it("leaves decimal percentages as digits", () => {
    expect(normalizeForTTS("up 3.24% with volume at 2.5 million")).toBe(
      "up 3.24% with volume at 2.5 million"
    );
  });

  it("spells out whole/large percentages", () => {
    expect(normalizeForTTS("the stock is up 2,215%")).toBe(
      "the stock is up two thousand two hundred and fifteen percent"
    );
    expect(normalizeForTTS("a 300% gain")).toBe("a three hundred percent gain");
    expect(normalizeForTTS("the VIX spiked above 23%")).toBe("the VIX spiked above twenty-three percent");
  });

  it("leaves bare years as digits", () => {
    expect(normalizeForTTS("back in 2026 the market")).toBe("back in 2026 the market");
  });

  it("converts hyphen ranges to 'to'", () => {
    expect(normalizeForTTS("just 2-3 days from a deal")).toBe(
      "just two to three days from a deal"
    );
  });

  it("handles comma-separated thousands", () => {
    expect(normalizeForTTS("sold 1,250 units")).toBe(
      "sold one thousand two hundred and fifty units"
    );
  });
});
