import type { ChannelType, RightsStatus } from "@shortfactory/shared";
import { RightsBlockedError, RightsReviewRequiredError } from "@shortfactory/shared";

export type RightsDecision = "ALLOW" | "MANUAL_REVIEW" | "BLOCK";

export interface RightsAsset {
  rightsStatus: RightsStatus;
  sourceUrl?: string;
  attributionText?: string;
}

export interface RightsChannel {
  type: ChannelType;
  autoPublish: boolean;
  manualReviewRequired: boolean;
}

export interface RightsEvaluation {
  decision: RightsDecision;
  autoPublish: boolean;
  reason: string;
}

export interface RightsGateOptions {
  creativeCommonsApproved?: boolean;
  requireAttribution?: boolean;
}

export class RightsGate {
  public constructor(private readonly options: RightsGateOptions = {}) {}

  public evaluate(asset: RightsAsset, channel: RightsChannel): RightsEvaluation {
    if (asset.rightsStatus === "BLOCKED") return { decision: "BLOCK", autoPublish: false, reason: "rights status is BLOCKED" };
    if (asset.rightsStatus === "UNKNOWN") return { decision: "MANUAL_REVIEW", autoPublish: false, reason: "rights status is UNKNOWN" };
    if (asset.rightsStatus === "COMMENTARY_REVIEW") return { decision: "MANUAL_REVIEW", autoPublish: false, reason: "commentary rights require manual review" };
    if (asset.rightsStatus === "CREATIVE_COMMONS" && (!this.options.creativeCommonsApproved || (this.options.requireAttribution && !asset.attributionText))) return { decision: "MANUAL_REVIEW", autoPublish: false, reason: "Creative Commons license needs configured approval and attribution" };
    const autoPublish = channel.autoPublish && !channel.manualReviewRequired;
    return { decision: "ALLOW", autoPublish, reason: "rights status is allowed by policy" };
  }

  public assertCanRender(asset: RightsAsset): void {
    if (this.evaluate(asset, { type: "CUSTOM", autoPublish: false, manualReviewRequired: true }).decision === "BLOCK") throw new RightsBlockedError();
  }

  public assertCanAutoPublish(asset: RightsAsset, channel: RightsChannel): void {
    const result = this.evaluate(asset, channel);
    if (result.decision === "BLOCK") throw new RightsBlockedError();
    if (!result.autoPublish) throw new RightsReviewRequiredError(result.reason);
  }
}
