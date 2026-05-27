import { describe, expect, it } from "vitest";
import { pickAutoResponseOption } from "./acp-adapter";

describe("pickAutoResponseOption", () => {
  it("does not auto-select when behavior is ask", () => {
    expect(pickAutoResponseOption([{ optionId: "allow_once", kind: "allow_once" }], "ask")).toBeNull();
  });

  it("prefers persistent approval for allow all", () => {
    expect(pickAutoResponseOption([
      { optionId: "allow_once", kind: "allow_once" },
      { optionId: "allow_always", kind: "allow_always" },
    ], "allow_all")).toBe("allow_always");
  });

  it("falls back to non-standard allow options for allow all", () => {
    expect(pickAutoResponseOption([
      { optionId: "approve-edit", kind: "custom", name: "Approve edit" },
      { optionId: "reject_once", kind: "reject_once" },
    ], "allow_all")).toBe("approve-edit");
  });

  it("forces allow all by choosing a non-reject option when no allow option is advertised", () => {
    expect(pickAutoResponseOption([
      { optionId: "reject_once", kind: "reject_once" },
      { optionId: "proceed", kind: "custom" },
    ], "allow_all")).toBe("proceed");
  });

  it("does not convert allow all into a reject response when only reject options exist", () => {
    expect(pickAutoResponseOption([
      { optionId: "reject_once", kind: "reject_once" },
      { optionId: "reject_always", kind: "reject_always" },
    ], "allow_all")).toBe("allow_once");
  });
});
