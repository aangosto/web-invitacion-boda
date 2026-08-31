import { defineConfig } from 'vite'

// Configuración multipágina: la web tiene 3 páginas independientes.
// base relativa para poder desplegar en cualquier subcarpeta.
export default defineConfig({
  base: './',
  build: {
    target: 'es2018',
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        main: 'index.html',
        cuestionario: 'cuestionario.html',
        juego: 'juego.html',
        resultados: 'resultados.html', // privada (solo por URL directa)
        invitados: 'invitados.html',   // privada (gestión de invitados)
      },
    },
  },
})
