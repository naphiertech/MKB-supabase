import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mkbcorp.ridertrack',
  appName: 'MKBRiderTrack',
  webDir: 'dist',
  server: {
    url: 'https://mkb-system.vercel.app',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['mkb-system.vercel.app', '*.supabase.co'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#b85a00',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#b85a00',
    },
  },
};

export default config;
