import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// PNG icons are generated from public/logo.svg at build time, so no binaries live in the
// repository. Maskable and Apple icons get extra padding (the OS crops them), filled with
// the same sky blue as the logo, so the padding is invisible.
const background = '#3468a0';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background } },
  },
  images: ['public/logo.svg'],
});
