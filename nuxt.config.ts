export default defineNuxtConfig({
  ssr: false,
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  compatibilityDate: '2026-07-22',
  runtimeConfig: {
    public: {
      partyKitHost: '127.0.0.1:1999',
    },
  },
})
