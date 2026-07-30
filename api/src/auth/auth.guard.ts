import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { TokenService } from "./token.service";

export type AuthenticatedRequest = Request & {
  user: { id: string; sessionId: string };
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Authentication is required.");
    }
    const claims = await this.tokens.verifyAccessToken(authorization.slice(7));
    request.user = { id: claims.sub, sessionId: claims.sid };
    return true;
  }
}
