import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const preserveRawBody = (request: unknown, _response: unknown, buffer: Buffer) => {
    (request as { rawBody?: Buffer }).rawBody = buffer;
  };
  app.use(json({ limit: "80mb", verify: preserveRawBody }));
  app.use(urlencoded({ limit: "80mb", extended: true, verify: preserveRawBody }));
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use(helmet());
  app.use("/v1", (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "no-store, no-transform");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Vary", "Authorization, Cookie");
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const productionOrigins = [
    ...configuredOrigins,
    "https://kindredcube.com",
    "https://www.kindredcube.com",
  ].filter((value, index, list) => list.indexOf(value) === index);
  const origins = process.env.NODE_ENV === "production"
    ? productionOrigins
    : [
        ...configuredOrigins,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
      ];
  const isAllowedKindredCubeOrigin = (origin: string) =>
    origins.includes(origin) ||
    /^https:\/\/([a-z0-9-]+\.)?kindredcube\.com$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || isAllowedKindredCubeOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-MFA"],
    credentials: false,
  });
  await app.listen(Number(process.env.PORT || 3001), "0.0.0.0");
}

bootstrap();
