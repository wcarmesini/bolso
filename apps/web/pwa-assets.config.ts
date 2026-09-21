import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Mesmo azul do fundo do logo, para os ícones com fundo sólido (iOS e Android) ficarem contínuos
const iconBackground = '#374DF5'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      // Margem extra: o Android pode recortar o ícone em círculo
      padding: 0.1,
      resizeOptions: { background: iconBackground },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0,
      resizeOptions: { background: iconBackground },
    },
  },
  images: ['public/logo.svg'],
})
