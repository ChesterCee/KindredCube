import { BadGatewayException, Controller, Get, Query, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { AccessTokenGuard } from "./auth/auth.guard";

class GifSearchQuery {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  q!: string;
}

type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyResult = {
  id: string;
  title?: string;
  images?: {
    fixed_width?: GiphyImage;
    fixed_width_small?: GiphyImage;
    downsized_medium?: GiphyImage;
  };
};

@Controller("v1/gifs")
@UseGuards(AccessTokenGuard)
export class GifsController {
  @Get("search")
  async search(@Query() query: GifSearchQuery) {
    const apiKey = process.env.VITE_GIPHY_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException("GIPHY is not configured yet.");
    const params = new URLSearchParams({
      api_key: apiKey,
      q: query.q,
      limit: "18",
      rating: "pg-13",
      lang: "en",
    });
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      response = await fetch(`https://api.giphy.com/v1/gifs/search?${params.toString()}`, { signal: controller.signal });
    } catch {
      throw new BadGatewayException("GIPHY could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new BadGatewayException("GIPHY search was unavailable.");
    const payload = await response.json() as { data?: GiphyResult[] };
    return {
      results: (payload.data || []).flatMap((gif) => {
        const full = gif.images?.downsized_medium || gif.images?.fixed_width;
        const preview = gif.images?.fixed_width_small || gif.images?.fixed_width;
        if (!full?.url || !preview?.url) return [];
        return [{
          id: gif.id,
          title: gif.title || "GIF",
          url: full.url,
          previewUrl: preview.url,
          width: Number(full.width || 320),
          height: Number(full.height || 240),
        }];
      }),
    };
  }
}
