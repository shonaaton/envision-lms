/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { serverComponentsExternalPackages: ["mongoose"] },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};
export default nextConfig;
