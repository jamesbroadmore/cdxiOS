/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    esmExternals: true,
  },
}

export default nextConfig
