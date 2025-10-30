import { describe, it, expect, beforeEach } from "vitest";
import { useChamber } from "./useChamber";

describe("useChamber", () => {
  beforeEach(() => {
    // Reset state before each test
    useChamber.getState().clearChamberId();
  });

  it("should initialize with null chamberId", () => {
    const state = useChamber.getState();
    expect(state.chamberId).toBeNull();
  });

  it("should set chamber ID", () => {
    const { setChamberId } = useChamber.getState();
    setChamberId("snovalley");
    
    const state = useChamber.getState();
    expect(state.chamberId).toBe("snovalley");
  });

  it("should clear chamber ID", () => {
    const { setChamberId, clearChamberId } = useChamber.getState();
    
    setChamberId("snovalley");
    expect(useChamber.getState().chamberId).toBe("snovalley");
    
    clearChamberId();
    expect(useChamber.getState().chamberId).toBeNull();
  });

  it("should handle different chamber IDs", () => {
    const { setChamberId } = useChamber.getState();
    
    setChamberId("snovalley");
    expect(useChamber.getState().chamberId).toBe("snovalley");
    
    setChamberId("eastside");
    expect(useChamber.getState().chamberId).toBe("eastside");
    
    setChamberId("seattle");
    expect(useChamber.getState().chamberId).toBe("seattle");
  });

  it("should persist chamber ID across state reads", () => {
    const { setChamberId } = useChamber.getState();
    setChamberId("snovalley");
    
    // Read from multiple calls
    expect(useChamber.getState().chamberId).toBe("snovalley");
    expect(useChamber.getState().chamberId).toBe("snovalley");
  });
});

