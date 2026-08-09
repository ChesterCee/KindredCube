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
  app.use(json({ limit: "25mb", verify: preserveRawBody }));
  app.use(urlencoded({ limit: "25mb", extended: true, verify: preserveRawBody }));
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
  if (process.env.NODE_ENV === "production" && !configuredOrigins.length) {
    throw new Error("ALLOWED_ORIGINS must contain the production web origins");
  }
  const origins = process.env.NODE_ENV === "production"
    ? configuredOrigins
    : [
        ...configuredOrigins,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
      ];
  app.enableCors({
    origin: origins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
  });
  await app.listen(Number(process.env.PORT || 3001), "0.0.0.0");
}

bootstrap();
