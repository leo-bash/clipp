import { describe, expect, it } from "vitest";
import { ModelRouter } from "./index.js";

describe("model routing", () => {
  it("falls back to deterministic models at the paid API kill switch or budget floor", () => {
    const router = new ModelRouter({ preferredModel: "large", lowCostModel: "small", paidApisDisabled: true });
    expect(router.route("analysis", 100).model).toBe("deterministic");
    expect(new ModelRouter({ preferredModel: "large", lowCostModel: "small" }).route("analysis", 0.5).model).toBe("small");
  });
});
