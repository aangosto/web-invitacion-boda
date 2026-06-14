import { defineConfig } from 'vite'

// Configuración mínima: proyecto vanilla, base relativa para poder
// desplegarlo en cualquier subcarpeta (útil al compartir el enlace).
export default defineConfig({
  base: './',
  build: {
    target: 'es2018',
    assetsInlineLimit: 4096,
  },
})
