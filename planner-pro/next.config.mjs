/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_OUTPUT === 'export' ? { output: 'export' } : {}),
  images: { unoptimized: true }
};

export default nextConfig;
