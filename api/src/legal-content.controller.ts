import { Controller, Get, Inject, Param } from "@nestjs/common";
import { DatabaseService } from "./database.service";

const LEGAL_SLUGS = new Set(["privacy", "terms", "community-guidelines"]);

@Controller("v1/legal-content")
export class LegalContentController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async pages() {
    const result = await this.database.query(
      `SELECT slug, title, summary, body, image_urls AS "imageUrls", updated_at AS "updatedAt"
         FROM legal_content_pages
        ORDER BY CASE slug
          WHEN 'privacy' THEN 1
          WHEN 'terms' THEN 2
          WHEN 'community-guidelines' THEN 3
          ELSE 9
        END`,
    );
    return { pages: result.rows };
  }

  @Get(":slug")
  async page(@Param("slug") slug: string) {
    if (!LEGAL_SLUGS.has(slug)) return { page: null };
    const result = await this.database.query(
      `SELECT slug, title, summary, body, image_urls AS "imageUrls", updated_at AS "updatedAt"
         FROM legal_content_pages
        WHERE slug = $1
        LIMIT 1`,
      [slug],
    );
    return { page: result.rows[0] || null };
  }
}
