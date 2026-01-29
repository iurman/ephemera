// src/app/api/health/route.ts
// Comprehensive health check endpoint for debugging deployments

import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: {
    node: string;
    nextjs: string;
  };
  environment: {
    NODE_ENV: string;
    hostname: string;
    platform: string;
    arch: string;
  };
  memory: {
    heapUsed: string;
    heapTotal: string;
    external: string;
    rss: string;
  };
  database: {
    status: "connected" | "disconnected" | "error";
    latency?: number;
    version?: string;
    error?: string;
  };
  network: {
    port: number;
    host: string;
  };
  checks: {
    name: string;
    status: "pass" | "fail";
    message?: string;
    duration?: number;
  }[];
}

const startTime = Date.now();

async function checkDatabase(): Promise<HealthStatus["database"]> {
  const start = Date.now();
  try {
    const result = await db.execute(sql`SELECT version() as version`);
    const latency = Date.now() - start;
    const version = (result.rows[0] as { version: string })?.version || "unknown";
    return {
      status: "connected",
      latency,
      version: version.split(" ").slice(0, 2).join(" "),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

export async function GET() {
  const checks: HealthStatus["checks"] = [];

  // Database check
  const dbStart = Date.now();
  const dbStatus = await checkDatabase();
  checks.push({
    name: "database",
    status: dbStatus.status === "connected" ? "pass" : "fail",
    message: dbStatus.error || `Connected (${dbStatus.latency}ms)`,
    duration: Date.now() - dbStart,
  });

  // Memory check
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  checks.push({
    name: "memory",
    status: heapUsedPercent < 90 ? "pass" : "fail",
    message: `Heap ${heapUsedPercent.toFixed(1)}% used`,
  });

  // Determine overall status
  const failedChecks = checks.filter((c) => c.status === "fail");
  let overallStatus: HealthStatus["status"] = "healthy";
  if (failedChecks.length > 0) {
    overallStatus = failedChecks.some((c) => c.name === "database")
      ? "unhealthy"
      : "degraded";
  }

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: {
      node: process.version,
      nextjs: "15.x", // Could read from package.json if needed
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV || "unknown",
      hostname: process.env.HOSTNAME || "unknown",
      platform: process.platform,
      arch: process.arch,
    },
    memory: {
      heapUsed: formatBytes(memUsage.heapUsed),
      heapTotal: formatBytes(memUsage.heapTotal),
      external: formatBytes(memUsage.external),
      rss: formatBytes(memUsage.rss),
    },
    database: dbStatus,
    network: {
      port: parseInt(process.env.PORT || "3000", 10),
      host: process.env.HOSTNAME || "0.0.0.0",
    },
    checks,
  };

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache, no-store, must-revalidate",
    },
  });
}
