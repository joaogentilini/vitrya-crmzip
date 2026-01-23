/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    '922b1465-19cc-4a06-8409-2f63c03ac2d0-00-3mrljbh8zid2i.spock.replit.dev',
    'localhost',
    '127.0.0.1',
    '*.app.github.dev',
    'app.github.dev',
    'miniature-umbrella-5gjwjxq64579hv569-3000.app.github.dev',
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        '922b1465-19cc-4a06-8409-2f63c03ac2d0-00-3mrljbh8zid2i.spock.replit.dev:5000',
        '922b1465-19cc-4a06-8409-2f63c03ac2d0-00-3mrljbh8zid2i.spock.replit.dev',
        'vitrya-crmzip--joaovitryaimove.replit.app',
        'localhost:3000',
        '127.0.0.1:3000',
        '*.app.github.dev',
        'app.github.dev',
        'miniature-umbrella-5gjwjxq64579hv569-3000.app.github.dev',
      ],
    },
  },
}

module.exports = nextConfig
