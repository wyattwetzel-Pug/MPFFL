import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Server actions cap request bodies at 1MB by default, which silently
     * rejects a portrait before any of our own validation runs — the failure
     * looks like a server crash rather than "that file is too big." 4.5MB is
     * the platform ceiling; anything larger needs a direct-to-Blob upload.
     */
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  images: {
    /*
     * Player portraits come from Vercel Blob. Both hosts are listed while the
     * old project still exists — its images work until they're copied over,
     * and a broken face is a worse first impression than a slow one.
     */
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
