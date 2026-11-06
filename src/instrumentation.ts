/**
 * Runs once when the server starts. In production, refuse to boot with a missing or unsafe configuration
 * rather than failing later in the middle of a payment or a draw.
 */
export async function register() {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SKIP_ENV_CHECK === "true") return;
  const problems: string[] = [];
  const need = (k: string) => {
    if (!process.env[k]) problems.push(`${k} is not set`);
  };
  need("DATABASE_URL");
  need("APP_URL");
  need("CRON_SECRET");
  if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY ?? "")) problems.push("ENCRYPTION_KEY must be 64 hex characters");
  if (process.env.APP_URL && !process.env.APP_URL.startsWith("https://") && process.env.ALLOW_TEST_PAYMENTS !== "true")
    problems.push("APP_URL must use https:// in production");
  if (process.env.PAYMENT_PROVIDER === "stripe") {
    need("STRIPE_SECRET_KEY");
    need("STRIPE_WEBHOOK_SECRET");
  } else if (process.env.ALLOW_TEST_PAYMENTS !== "true") {
    console.warn("[config] No payment provider configured: checkout is disabled until PAYMENT_PROVIDER=stripe is set.");
  }
  if (process.env.ALLOW_TEST_PAYMENTS === "true") console.warn("[config] ALLOW_TEST_PAYMENTS=true — the SIMULATED gateway is active. Never use this on the live site.");
  if (problems.length) throw new Error(`Refusing to start — fix the environment:\n - ${problems.join("\n - ")}`);
}
