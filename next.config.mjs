/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    'https://*.ngrok-free.app',
    '*.ngrok-free.app',
    '*.loca.lt',
    '*.trycloudflare.com',
  ],
  output: 'standalone',
};

export default nextConfig;

