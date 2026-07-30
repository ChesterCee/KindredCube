import { BadGatewayException, Controller, Get, Query, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { AccessTokenGuard } from "./auth/auth.guard";

class PlaceSearchQuery {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  q!: string;
}

type PlaceSuggestion = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  provider: "google" | "openstreetmap";
};

@Controller("v1/maps")
@UseGuards(AccessTokenGuard)
export class MapsController {
  @Get("places")
  async searchPlaces(@Query() query: PlaceSearchQuery) {
    const text = query.q.trim();
    if (text.length < 3) return { results: [] };
    const results = process.env.GOOGLE_MAPS_API_KEY
      ? await searchGooglePlaces(text)
      : await searchOpenStreetMap(text);
    return { results };
  }
}

async function searchGooglePlaces(query: string): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new ServiceUnavailableException("Maps are not configured yet.");
  const params = new URLSearchParams({
    address: query,
    key: apiKey,
  });
  const payload = await fetchJson<{ results?: Array<{
    place_id?: string;
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: Array<{ long_name?: string; types?: string[] }>;
  }>; status?: string }>(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  if (payload.status && !["OK", "ZERO_RESULTS"].includes(payload.status)) {
    throw new BadGatewayException("Map address search was unavailable.");
  }
  return (payload.results || []).flatMap((place) => {
    const latitude = place.geometry?.location?.lat;
    const longitude = place.geometry?.location?.lng;
    const address = place.formatted_address?.trim();
    if (typeof latitude !== "number" || typeof longitude !== "number" || !address) return [];
    const name = place.address_components?.find((component) =>
      component.types?.some((type) => ["establishment", "point_of_interest", "premise", "route"].includes(type)),
    )?.long_name || address.split(",")[0] || address;
    return [{
      id: place.place_id || `${latitude},${longitude}`,
      name,
      address,
      latitude,
      longitude,
      provider: "google" as const,
    }];
  }).slice(0, 6);
}

async function searchOpenStreetMap(query: string): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
  });
  const payload = await fetchJson<Array<{
    place_id?: number;
    display_name?: string;
    name?: string;
    lat?: string;
    lon?: string;
  }>>(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      "User-Agent": "KindredCube/1.0 (no-reply@kindredcube.com)",
      "Accept-Language": "en",
    },
  });
  return payload.flatMap((place) => {
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    const address = place.display_name?.trim();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !address) return [];
    return [{
      id: String(place.place_id || `${latitude},${longitude}`),
      name: place.name?.trim() || address.split(",")[0] || address,
      address,
      latitude,
      longitude,
      provider: "openstreetmap" as const,
    }];
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new BadGatewayException("Map address search could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new BadGatewayException("Map address search was unavailable.");
  return response.json() as Promise<T>;
}
