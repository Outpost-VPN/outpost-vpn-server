import { resolve4 } from "node:dns/promises";
import { z } from "zod";
import { config } from "../config";
import type { AuthService } from "../auth/webauthn";
import { ServiceError } from "./connections";
import { callAgent } from "./operations";
import { locales } from "../../shared/i18n";

const domainSchema = z.string().trim().toLowerCase().max(253).refine(validDomain, "Укажите корректный домен");

type SetupConfig = Pick<typeof config, "setup" | "publicIp" | "adminPath">;
type Resolver = (domain: string) => Promise<string[]>;
type Runner = typeof callAgent;

export class SetupService {
  private finalizing = false;

  constructor(
    private auth: AuthService,
    private settings: SetupConfig = config,
    private resolver: Resolver = resolve4,
    private runner: Runner = callAgent,
  ) {}

  state() {
    if (!this.settings.setup || !validIPv4(this.settings.publicIp)) return { status: "configured" as const };
    return { status: "available" as const, publicIp: this.settings.publicIp };
  }

  async finalize(input: unknown) {
    this.requireSetup();
    if (this.finalizing) throw new ServiceError(409, "Первоначальная настройка уже выполняется");
    const body = z.object({
      domain: domainSchema,
      language: z.enum(locales).default("en"),
    }).parse(input);
    this.finalizing = true;
    try {
      let addresses: string[];
      try {
        addresses = await this.resolver(body.domain);
      } catch {
        throw new ServiceError(409, "DNS-запись пока не найдена — проверьте адрес и попробуйте ещё раз");
      }
      if (!addresses.includes(this.settings.publicIp)) {
        throw new ServiceError(409, `Домен пока не указывает на этот сервер (${this.settings.publicIp})`);
      }

      const claim = this.auth.issueClaim();
      try {
        await this.runner({
          action: "setup.finalize",
          payload: { domain: body.domain, publicIp: this.settings.publicIp },
        });
      } catch (error) {
        console.error(`[SETUP] Не удалось применить домен ${body.domain}:`, error);
        throw new ServiceError(502, "DNS-запись подтверждена, но сервер не смог завершить настройку домена — попробуйте ещё раз");
      }
      return {
        domain: body.domain,
        origin: `https://${body.domain}`,
        onboardingUrl: `https://${body.domain}${this.settings.adminPath}/onboarding?claim=${encodeURIComponent(claim.token)}&lang=${encodeURIComponent(body.language)}`,
      };
    } finally {
      this.finalizing = false;
    }
  }

  private requireSetup() {
    if (!this.settings.setup || !validIPv4(this.settings.publicIp)) {
      throw new ServiceError(409, "Первоначальная настройка домена уже завершена");
    }
  }
}

function validDomain(value: string) {
  if (!value.includes(".") || value.endsWith(".") || validIPv4(value)) return false;
  const labels = value.split(".");
  return /[a-z]/.test(labels.at(-1)!) && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function validIPv4(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
