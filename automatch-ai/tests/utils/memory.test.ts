import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import { MemoryManager, ShortTermMemoryWindow, mergeMemory } from "../../src/memory/memory.js";

describe("MemoryManager", () => {
  it("persists bounded short-term windows per session", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-test-"));
    const manager = new MemoryManager(dir);
    const sessionId = "sess-memory";

    const snapshot = manager.load(sessionId);
    const window = new ShortTermMemoryWindow(snapshot.shortTerm);
    const turn = Array.from({ length: 20 }).map((_, idx) => ({
      role: idx % 2 === 0 ? "user" : "assistant",
      content: `msg-${idx}`,
    })) as any;

    window.add(turn);
    manager.persist(sessionId, { ...snapshot, shortTerm: window.snapshot() });

    const reloaded = manager.load(sessionId);
    expect(reloaded.shortTerm.messages.length).toBeLessThanOrEqual(reloaded.shortTerm.maxItems);
    expect(reloaded.shortTerm.messages.at(-1)?.content).toBe("msg-19");
  });

  it("merges provided history when no snapshot exists", () => {
    const merged = mergeMemory(undefined, [{ role: "assistant", content: "hello" } as any]);
    expect(merged.shortTerm.messages.length).toBe(1);
    expect(merged.working.product.preferredCategories).toEqual([]);
  });
});
