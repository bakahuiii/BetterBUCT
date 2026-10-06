import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.bakahuiii.theia.mobile',
  appName: 'BetterBUCT',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    loggingBehavior: 'none',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
