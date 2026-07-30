import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";

@Controller("v1/help-content")
@UseGuards(AccessTokenGuard)
export class HelpContentController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async pages() {
    const result = await this.database.query(
      `SELECT slug, category, title, summary, body, image_urls AS "imageUrls", updated_at AS "updatedAt"
         FROM help_content_pages
        ORDER BY category, title`,
    );
    return { pages: result.rows };
  }
}
