import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_ROOT = path.dirname(fileURLToPath(import.meta.url));

const config: ForgeConfig = {
  hooks: {
    generateAssets: async () => {
      const assetsDir = path.join(DESKTOP_ROOT, 'assets');
      const icnsPath = path.join(assetsDir, 'icon.icns');
      const icoPath = path.join(assetsDir, 'icon.ico');

      // Most makers expect these paths to exist; generate them on-demand.
      if (fs.existsSync(icnsPath) && fs.existsSync(icoPath)) {
        return;
      }

      fs.mkdirSync(assetsDir, { recursive: true });
      const scriptPath = path.join(DESKTOP_ROOT, 'scripts', 'generate-icons.mjs');
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Missing icon generator script: ${scriptPath}`);
      }

      const res = spawnSync(process.execPath, [scriptPath], {
        cwd: DESKTOP_ROOT,
        stdio: 'inherit',
      });
      if (res.status !== 0) {
        throw new Error(`Icon generation failed (exit ${res.status ?? 'unknown'})`);
      }
    },
  },
  packagerConfig: {
    name: 'RLSify',
    executableName: 'rlsify',
    icon: './assets/icon',
    appBundleId: 'com.speajus.rlsify',
    appCategoryType: 'public.app-category.developer-tools',
    asar: true,
    prune: false,

  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'RLSify',
      setupIcon: './assets/icon.ico',
    }),
    new MakerZIP({}, ['darwin', 'linux']),
    new MakerDMG({
      name: 'RLSify',
      icon: './assets/icon.icns',
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
  ],
};

export default config;

