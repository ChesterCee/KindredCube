import { Body, Controller, Get, Inject, Post, Query, Redirect, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { PaymentsService, PurchaseType, WalletItem } from "./payments.service";

class CheckoutDto {
  @IsIn(["wallet", "kindred_pass", "premium"])
  purchaseType!: PurchaseType;

  @IsOptional()
  @IsNumber()
  walletAmount?: number;
}

class WalletSpendDto {
  @IsIn(["super_like", "photo_comment", "liked_you_reveal", "ready_to_meet_chat"])
  item!: WalletItem;

  @IsString()
  @MinLength(12)
  idempotencyKey!: string;
}

class ConfirmCheckoutDto {
  @IsString()
  @MinLength(8)
  sessionId!: string;
}

@Controller("v1/payments")
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Get("return")
  @Redirect()
  paymentReturn(@Query("session_id") sessionId?: string) {
    const target = process.env.APP_PAYMENT_DEEP_LINK || "kindredcube://payment-complete";
    return { url: `${target}?session_id=${encodeURIComponent(sessionId || "")}` };
  }

  @Get("cancel")
  @Redirect()
  paymentCancel() {
    return { url: process.env.APP_PAYMENT_DEEP_LINK || "kindredcube://payment-complete?canceled=true" };
  }

  @Post("checkout")
  @UseGuards(AccessTokenGuard)
  checkout(@Req() request: AuthenticatedRequest, @Body() input: CheckoutDto) {
    return this.payments.createCheckout(request.user.id, input.purchaseType, input.walletAmount);
  }

  @Get("summary")
  @UseGuards(AccessTokenGuard)
  summary(@Req() request: AuthenticatedRequest) {
    return this.payments.summary(request.user.id);
  }

  @Post("confirm")
  @UseGuards(AccessTokenGuard)
  confirm(@Req() request: AuthenticatedRequest, @Body() input: ConfirmCheckoutDto) {
    return this.payments.confirmCheckout(request.user.id, input.sessionId);
  }

  @Post("wallet/spend")
  @UseGuards(AccessTokenGuard)
  spend(@Req() request: AuthenticatedRequest, @Body() input: WalletSpendDto) {
    return this.payments.spend(request.user.id, input.item, input.idempotencyKey);
  }
}
