import { describe, expect, test } from "vitest";
import { validateEvent, type ValidatableEvent } from "./nostrValidation";

const baseEvent: ValidatableEvent = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  sig: "c".repeat(128),
  kind: 1,
  created_at: 1_700_000_000,
  content: "Hello Nostr",
  tags: []
};

describe("validateEvent", () => {
  test("passes for a valid kind 1 event", () => {
    expect(() => validateEvent(baseEvent)).not.toThrow();
  });

  test("throws for an invalid kind 1 event", () => {
    const invalidEvent: ValidatableEvent = {
      ...baseEvent,
      id: "123"
    } as ValidatableEvent;

    expect(() => validateEvent(invalidEvent)).toThrow(/validation failed/i);
  });

  test("passes for a valid kind 0 event", () => {
    const kind0: ValidatableEvent = {
      ...baseEvent,
      kind: 0,
      content: JSON.stringify({ name: "Synvya", about: "Testing" })
    };

    expect(() => validateEvent(kind0)).not.toThrow();
  });

  test("throws for invalid kind 0 event", () => {
    const invalid: ValidatableEvent = {
      ...baseEvent,
      kind: 0,
      content: 123 as unknown as string
    };

    expect(() => validateEvent(invalid)).toThrow();
  });

  test("passes for valid kind 30402 event", () => {
    const kind30402: ValidatableEvent = {
      ...baseEvent,
      kind: 30402,
      created_at: 1_700_000_010,
      tags: [
        ["d", "sq-testing"],
        ["title", "Test listing"]
      ]
    };

    expect(() => validateEvent(kind30402)).not.toThrow();
  });

  test("throws for kind 30402 event with invalid price tag", () => {
    const invalid30402: ValidatableEvent = {
      ...baseEvent,
      kind: 30402,
      tags: [["price", "abc", "USD"]]
    };

    expect(() => validateEvent(invalid30402)).toThrow();
  });

  test("ignores unsupported kinds", () => {
    const unsupported: ValidatableEvent = {
      ...baseEvent,
      kind: 9999
    };

    expect(() => validateEvent(unsupported)).not.toThrow();
  });
});
