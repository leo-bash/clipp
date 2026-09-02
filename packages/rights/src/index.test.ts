import { describe, expect, it } from "vitest";
import { RightsBlockedError, RightsReviewRequiredError } from "@shortfactory/shared";
import { RightsGate } from "./index.js";

const channel = { type: "STREAMER_COMMENTARY" as const, autoPublish: true, manualReviewRequired: false };

describe("RightsGate", () => {
  it("allows owned assets but keeps auto-publish disabled when review is required", () => {
    const gate = new RightsGate();
    expect(gate.evaluate({ rightsStatus: "OWNED" }, { ...channel, manualReviewRequired: true })).toMatchObject({ decision: "ALLOW", autoPublish: false });
  });

  it("blocks blocked assets and requires review for unknown assets", () => {
    const gate = new RightsGate();
    expect(() => gate.assertCanRender({ rightsStatus: "BLOCKED" })).toThrow(RightsBlockedError);
    expect(() => gate.assertCanAutoPublish({ rightsStatus: "UNKNOWN" }, channel)).toThrow(RightsReviewRequiredError);
    expect(gate.evaluate({ rightsStatus: "UNKNOWN" }, channel).decision).toBe("MANUAL_REVIEW");
  });

  it("requires attribution for configured Creative Commons processing", () => {
    const gate = new RightsGate({ creativeCommonsApproved: true, requireAttribution: true });
    expect(gate.evaluate({ rightsStatus: "CREATIVE_COMMONS" }, channel).decision).toBe("MANUAL_REVIEW");
    expect(gate.evaluate({ rightsStatus: "CREATIVE_COMMONS", attributionText: "Author" }, channel).decision).toBe("ALLOW");
  });
});
