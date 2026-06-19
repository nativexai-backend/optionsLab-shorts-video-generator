import { describe, it, expect } from "vitest";
import {
  extractTagsFromFilename,
  tokenize,
  scoreLibraryMatch,
  rankLibrary,
  type LibraryImage,
} from "./library-types";

function img(over: Partial<LibraryImage>): LibraryImage {
  return {
    id: "x",
    filename: "x.jpg",
    ext: ".jpg",
    tags: [],
    description: "",
    category: "other",
    visionLabels: [],
    addedOn: 0,
    usedInProjects: [],
    ...over,
  };
}

describe("extractTagsFromFilename", () => {
  it("splits separators and drops the extension", () => {
    expect(extractTagsFromFilename("donald-trump_handshake.jpg")).toEqual([
      "donald", "trump", "handshake",
    ]);
  });
  it("splits camelCase and drops pure-number tokens", () => {
    expect(extractTagsFromFilename("teslaLogo2024.png")).toEqual(["tesla", "logo"]);
  });
});

describe("tokenize", () => {
  it("removes stopwords and short fragments", () => {
    expect(tokenize("a photo of the Tesla logo")).toEqual(["tesla", "logo"]);
  });
});

describe("scoreLibraryMatch", () => {
  it("scores tag hits higher than description hits", () => {
    const tagged = img({ tags: ["tesla"] });
    const described = img({ description: "tesla factory floor" });
    expect(scoreLibraryMatch(tagged, { text: "tesla" })).toBeGreaterThan(
      scoreLibraryMatch(described, { text: "tesla" })
    );
  });

  it("returns 0 when nothing matches", () => {
    expect(scoreLibraryMatch(img({ tags: ["apple"] }), { text: "tesla" })).toBe(0);
  });

  it("never surfaces a same-category image with no keyword overlap", () => {
    // A Trump portrait must NOT match an Elon shot just because both are "person"
    const trump = img({ tags: ["donald", "trump"], category: "person", usedInProjects: ["a", "b", "c"] });
    expect(scoreLibraryMatch(trump, { text: "Elon Musk on stage", category: "person" })).toBe(0);
  });

  it("does not surface popular-but-irrelevant images on usage alone", () => {
    const popular = img({ tags: ["apple"], usedInProjects: ["a", "b", "c", "d", "e"] });
    expect(scoreLibraryMatch(popular, { text: "nvidia chip" })).toBe(0);
  });

  it("does not surface on generic finance vocabulary alone", () => {
    // A Goldman image tagged with generic words must NOT match an abstract macro
    // line that names no entity — the overlap is only generic terms.
    const goldman = img({ tags: ["goldman", "sachs"], description: "investors growth inflation markets" });
    expect(scoreLibraryMatch(goldman, { text: "investors bracing for slower growth and cooler inflation" })).toBe(0);
    // But it still matches when the distinctive name is present.
    expect(scoreLibraryMatch(goldman, { text: "Goldman Sachs earnings" })).toBeGreaterThan(0);
  });

  it("boosts same-category matches that already share keywords", () => {
    const logo = img({ tags: ["tesla"], category: "logo" });
    const withCat = scoreLibraryMatch(logo, { text: "tesla", category: "logo" });
    const withoutCat = scoreLibraryMatch(logo, { text: "tesla" });
    expect(withCat).toBeGreaterThan(withoutCat);
  });
});

describe("rankLibrary", () => {
  it("orders by relevance and drops non-matches", () => {
    const images = [
      img({ id: "1", tags: ["elon", "musk"], description: "elon musk on stage" }),
      img({ id: "2", tags: ["tesla", "logo"], category: "logo" }),
      img({ id: "3", tags: ["apple"] }),
    ];
    const ranked = rankLibrary(images, { text: "Tesla logo on a building", category: "logo" });
    expect(ranked[0].id).toBe("2");
    expect(ranked.find((r) => r.id === "3")).toBeUndefined();
  });
});
