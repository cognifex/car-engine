import { OfferType } from "./types.js";
import { logger } from "./logger.js";

/**
 * Legacy stubbed data utilities. External auto.dev/Apify fetching was removed.
 * Keep signatures to avoid breaking callers but return empty data.
 */

export const readOffersDB = async (): Promise<ReturnType<typeof OfferType.parse>[]> => {
  return [];
};

export const fetchVehicleListings = async (_params: {
  brand?: string;
  model?: string;
  maxItems?: number;
  zip?: string;
  distance?: number;
  maxPrice?: number;
  countryHint?: string;
}): Promise<ReturnType<typeof OfferType.parse>[]> => {
  logger.warn("fetchVehicleListings disabled; returning empty list");
  return [];
};

export const fetchVehiclePhotos = async (_params: { brand?: string; model?: string; vin?: string; limit?: number }): Promise<string[]> => {
  logger.warn("fetchVehiclePhotos disabled; returning empty list");
  return [];
};

export const fetchApifyMobileListings = async (_params: {
  brand?: string;
  model?: string;
  maxItems?: number;
  maxPrice?: number;
}): Promise<ReturnType<typeof OfferType.parse>[]> => {
  logger.warn("Apify listings disabled; returning empty list");
  return [];
};
