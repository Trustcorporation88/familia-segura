import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'online.gpsprivado.familiasegura',
  appName: 'Família Segura',
  webDir: 'dist',
  android: {
    // Exigido pelo plugin de localização em segundo plano: sem isso as
    // atualizações param depois de ~5 minutos com a tela bloqueada.
    useLegacyBridge: true,
  },
}

export default config
