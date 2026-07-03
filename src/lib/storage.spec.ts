import { describe, it, expect } from "vitest";
import { mergeProjectLists, type ProjectMeta } from "./storage";

function meta(overrides: Partial<ProjectMeta> & { id: string }): ProjectMeta {
  return {
    name: "Project",
    createdAt: 1000,
    modifiedAt: 1000,
    ...overrides,
  };
}

describe("mergeProjectLists", () => {
  it("keeps local-only and server-only projects", () => {
    const local = [meta({ id: "a", name: "Local only" })];
    const server = [meta({ id: "b", name: "Server only" })];
    const merged = mergeProjectLists(local, server);
    expect(merged.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("server strictly newer wins", () => {
    const local = [meta({ id: "a", name: "Old local name", modifiedAt: 1000 })];
    const server = [meta({ id: "a", name: "New server name", modifiedAt: 2000 })];
    const [p] = mergeProjectLists(local, server);
    expect(p.name).toBe("New server name");
    expect(p.modifiedAt).toBe(2000);
  });

  it("local strictly newer keeps the local entry", () => {
    const local = [meta({ id: "a", name: "Newer local", modifiedAt: 3000 })];
    const server = [meta({ id: "a", name: "Stale server", modifiedAt: 2000 })];
    const [p] = mergeProjectLists(local, server);
    expect(p.name).toBe("Newer local");
    expect(p.modifiedAt).toBe(3000);
  });

  it("on a modifiedAt tie the server entry is applied", () => {
    // `>=` in the merge: equal timestamps take the server row (name repair and
    // thumb preservation still apply on top of it).
    const local = [meta({ id: "a", name: "Local", createdAt: 1, modifiedAt: 2000 })];
    const server = [meta({ id: "a", name: "Server", createdAt: 2, modifiedAt: 2000 })];
    const [p] = mergeProjectLists(local, server);
    expect(p.name).toBe("Server");
    expect(p.createdAt).toBe(2);
  });

  it("repairs an 'Untitled' local name with the server name", () => {
    const local = [meta({ id: "a", name: "Untitled", modifiedAt: 1000 })];
    const server = [meta({ id: "a", name: "Real name", modifiedAt: 2000 })];
    const [p] = mergeProjectLists(local, server);
    expect(p.name).toBe("Real name");
  });

  it("never lets a server-side 'Untitled' clobber a real local name", () => {
    const local = [meta({ id: "a", name: "Real name", modifiedAt: 1000 })];
    const server = [meta({ id: "a", name: "Untitled", modifiedAt: 2000 })];
    const [p] = mergeProjectLists(local, server);
    expect(p.name).toBe("Real name");
    expect(p.modifiedAt).toBe(2000); // server entry still wins the merge
  });

  it("preserves the local thumb when the winning server entry has none", () => {
    const local = [meta({ id: "a", modifiedAt: 1000, thumb: "data:image/png;base64,abc" })];
    const server = [meta({ id: "a", modifiedAt: 2000 })];
    const [p] = mergeProjectLists(local, server);
    expect(p.thumb).toBe("data:image/png;base64,abc");
  });

  it("prefers the server thumb when it has one", () => {
    const local = [meta({ id: "a", modifiedAt: 1000, thumb: "local-thumb" })];
    const server = [meta({ id: "a", modifiedAt: 2000, thumb: "server-thumb" })];
    const [p] = mergeProjectLists(local, server);
    expect(p.thumb).toBe("server-thumb");
  });
});
