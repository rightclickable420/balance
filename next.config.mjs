import path from "path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const baseIsolationHeaders = [
      {
        key: "Cross-Origin-Opener-Policy",
        value: "same-origin",
      },
      {
        key: "Cross-Origin-Embedder-Policy",
        value: "require-corp",
      },
    ]

    const gzdoomHeaders = [
      ...baseIsolationHeaders,
      {
        key: "Content-Security-Policy",
        value:
          "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; object-src 'none'; base-uri 'self'; worker-src 'self' blob:;",
      },
    ]

    return [
      {
        source: "/:path*",
        headers: baseIsolationHeaders,
      },
      {
        source: "/gzdoom-shell.html",
        headers: gzdoomHeaders,
      },
      {
        source: "/gzdoom-runner/:path*",
        headers: gzdoomHeaders,
      },
    ]
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "rpc-websockets$": path.resolve(process.cwd(), "webpack-compat/rpc-websockets-root.js"),
      "rpc-websockets/dist/lib/client$": path.resolve(process.cwd(), "webpack-compat/rpc-websockets-client.js"),
      "rpc-websockets/dist/lib/client/websocket": path.resolve(
        process.cwd(),
        "webpack-compat/rpc-websockets-websocket.js",
      ),
      "rpc-websockets/dist/lib/client/websocket.browser": path.resolve(
        process.cwd(),
        "webpack-compat/rpc-websockets-websocket.js",
      ),
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
      }
    }

    return config
  },
}

export default nextConfig
