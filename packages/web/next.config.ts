import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@swag-money/shared', '@swag-money/api', '@swag-money/crypto'],
  serverExternalPackages: ['postgres', '@electric-sql/pglite'],
}

export default nextConfig
