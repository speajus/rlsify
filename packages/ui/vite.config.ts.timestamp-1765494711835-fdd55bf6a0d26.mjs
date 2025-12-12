// vite.config.ts
import path from "node:path";
import { svelte } from "file:///app/node_modules/.pnpm/@sveltejs+vite-plugin-svelte@3.1.2_svelte@5.44.0_vite@5.4.21_@types+node@20.19.25_lightningcss@1.30.2_/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import { defineConfig } from "file:///app/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.25_lightningcss@1.30.2/node_modules/vite/dist/node/index.js";
var vite_config_default = defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib")
    }
  },
  server: {
    port: 5174,
    proxy: {
      // Proxy Connect/gRPC requests to the backend service
      // Connect-ES uses paths like /rlsify.v1.SchemaService/GetSchema
      "/rlsify.v1": {
        target: process.env.VITE_API_BACKEND || "http://localhost:50051",
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: "dist"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvYXBwL3BhY2thZ2VzL3VpXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvYXBwL3BhY2thZ2VzL3VpL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9hcHAvcGFja2FnZXMvdWkvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuXG5pbXBvcnQgeyBzdmVsdGUgfSBmcm9tICdAc3ZlbHRlanMvdml0ZS1wbHVnaW4tc3ZlbHRlJztcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbc3ZlbHRlKCldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICRsaWI6IHBhdGgucmVzb2x2ZSgnLi9zcmMvbGliJyksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3NCxcbiAgICBwcm94eToge1xuICAgICAgLy8gUHJveHkgQ29ubmVjdC9nUlBDIHJlcXVlc3RzIHRvIHRoZSBiYWNrZW5kIHNlcnZpY2VcbiAgICAgIC8vIENvbm5lY3QtRVMgdXNlcyBwYXRocyBsaWtlIC9ybHNpZnkudjEuU2NoZW1hU2VydmljZS9HZXRTY2hlbWFcbiAgICAgICcvcmxzaWZ5LnYxJzoge1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlZJVEVfQVBJX0JBQ0tFTkQgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6NTAwNTEnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHNlY3VyZTogZmFsc2UsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiAnZGlzdCcsXG4gIH0sXG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFrTyxPQUFPLFVBQVU7QUFFblAsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBRTdCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxPQUFPLENBQUM7QUFBQSxFQUNsQixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxNQUFNLEtBQUssUUFBUSxXQUFXO0FBQUEsSUFDaEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUE7QUFBQTtBQUFBLE1BR0wsY0FBYztBQUFBLFFBQ1osUUFBUSxRQUFRLElBQUksb0JBQW9CO0FBQUEsUUFDeEMsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLE1BQ1Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLEVBQ1Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
