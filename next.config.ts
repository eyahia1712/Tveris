import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for the container image; `next start` locally does
  // not use it, and warns when it is always on.
  ...(process.env.TVERIS_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Native/Node-only readers stay on the server, unbundled.
  serverExternalPackages: ["exceljs", "mammoth", "unpdf", "pg", "googleapis"],
  // The sample inbox ships inside the server bundle for the live demo.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
};

export default nextConfig;
