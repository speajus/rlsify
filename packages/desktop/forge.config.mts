import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
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

