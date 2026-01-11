import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        '922b1465-19cc-4a06-8409-2f63c03ac2d0-00-3mrljbh8zid2i.spock.replit.dev:5000',
        '922b1465-19cc-4a06-8409-2f63c03ac2d0-00-3mrljbh8zid2i.spock.replit.dev',
        'vitrya-crmzip--joaovitryaimove.replit.app',
      ],
    },
  },
}

export default nextConfig
