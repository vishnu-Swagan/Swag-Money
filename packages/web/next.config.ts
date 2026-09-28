import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

initOpenNextCloudflareForDev()

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@swag-money/shared', '@swag-money/api', '@swag-money/crypto'],
}

export default nextConfig
