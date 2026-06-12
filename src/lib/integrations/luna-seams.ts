import "server-only";

/**
 * Read seams to Luna Chat and Luna Marketing for the Customer 360 panel
 * (Phase 2). Contracts defined now, wired when those products expose APIs.
 */

export type LunaChatStatus = {
  installed: boolean;
  conversationsLast30Days: number;
};

export type LunaMarketingEngagement = {
  lastCampaign: string | null;
  opensLast30Days: number;
  clicksLast30Days: number;
};

export async function getLunaChatStatus(clientId: string): Promise<LunaChatStatus | null> {
  void clientId;
  return null; // stub
}

export async function getLunaMarketingEngagement(clientId: string): Promise<LunaMarketingEngagement | null> {
  void clientId;
  return null; // stub
}
