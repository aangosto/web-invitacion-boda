Web de invitación de boda — María & Alberto · 24·10·2026
Documento de contexto para Claude Code. Léelo entero antes de escribir código. Objetivo: una web de invitación de una sola página, original, con animaciones encadenadas, pensada para abrirse en el MÓVIL (la mayoría de invitados entrarán desde WhatsApp).


1. Resumen del proyecto
Invitación digital para compartir con ~90 invitados vía enlace. No es una web genérica de plantilla: la pieza central es una secuencia de apertura cinematográfica (el sobre real se abre) hecha encadenando dos vídeos generados con IA y una transición de código entre ambos. Tras la apertura, se hace scroll por las secciones de información, un formulario de confirmación (RSVP) y un minijuego "Team novio / Team novia".

Stack sugerido: HTML + CSS + JavaScript vanilla, o Vite + React si se prefiere componentes. Sin frameworks pesados. Prioridad absoluta: rendimiento en móvil y que las animaciones vayan fluidas.


2. La secuencia de apertura (lo más importante)
Es una pieza continua de 3 partes que deben encadenar sin saltos visibles:

Vídeo 1 (lazo.mp4) — el sobre de frente con el lazo burdeos; el lazo se desata y se desliza fuera por la izquierda; termina con el sobre limpio de frente, centrado.
Transición de código (volteo) — al acabar el Vídeo 1, el sobre gira sobre su eje vertical (rotateY 3D) y muestra la cara trasera con el sello en relieve "A & M". Esta parte NO es vídeo, es CSS, porque da control total y evita artefactos.
Vídeo 2 (apertura.mp4) — empieza con el sobre por detrás (sello A&M); la solapa se abre y emerge la acuarela de los novios; termina con la acuarela a pantalla completa.

Continuidad (crítico):

El último frame del Vídeo 1 ≈ estado inicial del volteo (sobre limpio de frente).
El último frame del volteo (trasera con sello) ≈ primer frame del Vídeo 2.
Para que no se note el corte vídeo→código→vídeo: precargar ambos vídeos, congelar el último frame del Vídeo 1 mientras arranca el volteo, y arrancar el Vídeo 2 exactamente cuando el volteo termina.

Detalles de implementación de los vídeos:

Reproducir con <video> en autoplay muted playsinline (el playsinline es imprescindible en iOS o se abre en pantalla completa).
Sin controles, sin sonido.
Los vídeos son 16:9 (1920×1080). En móvil vertical habrá que decidir: encajar centrado con fondo, o un ligero zoom/crop. Ver punto de "ajuste de margen" abajo.
Ajuste de margen del Vídeo 2: la acuarela emerge dejando algo más de hueco de papel arriba del deseado. Corregirlo por CSS con un ligero zoom/reencuadre del clip (object-fit: cover + object-position) en lugar de regenerar el vídeo.
Botón discreto "Saltar intro" siempre visible durante la secuencia.
Respetar prefers-reduced-motion: si está activo, saltar directamente al contenido mostrando la acuarela fija.


3. Identidad visual
Derivada de la invitación física real (papel de algodón, cinta de gasa, acuarela).
Paleta
--paper #f5f1e9 — blanco roto, fondo base
--burgundy #6e2435 — burdeos de la cinta (color de acento principal)
--burgundy-deep #561a28 — burdeos oscuro (hover, sombras)
--sage #9aa68c — verde salvia del tag
--sage-deep #6f7d62 — salvia oscuro, texto destacado / caligrafía
--ink #3a4036 — texto principal
--ink-soft #5c6354 — texto secundario
Tipografías (Google Fonts)
Display / nombres: una caligráfica fina y elegante — Parisienne o La Belle Aurore (la de "María y Alberto" en la invitación es manuscrita fina). Usar con MUCHA restricción, solo en titulares.
Cuerpo / serif: Cormorant Garamond (elegante, casa con la invitación física que usa una serif tipo Playfair). Alternativa: Playfair Display para titulares serif.
Utilidad / etiquetas: una sans neutra para fechas, botones, formularios — p.ej. Jost o el system stack.
Texturas / detalles
Fondo con textura sutil de papel (ruido SVG en multiply a baja opacidad).
Bordes deckle (rasgados) como detalle decorativo si se quiere, sin abusar.
Filete fino con un pequeño motivo floral (✿) como separador de secciones.


4. Estructura de la página (orden de scroll)
Apertura (la secuencia de 3 partes; ocupa el primer viewport completo).
Hero — tras la apertura, queda la acuarela; sobre ella o debajo: "María & Alberto", "24 · 10 · 2026", y un indicador de scroll.
Cuenta atrás — countdown en tiempo real hasta el 24·10·2026 12:30. (Tendencia 2026, queda muy bien.)
Nuestra historia — el texto de la invitación: "Cada paso que hemos dado juntos nos ha llevado a este momento tan esperado..."
La ceremonia — 24 de octubre 2026, 12:30 h · Iglesia San Antonio de Padua, Zaragoza.
La celebración — a continuación, Finca Tierrabella.
Mapa — ubicación(es) con enlace a Google Maps y opción "añadir al calendario".
Los padres — Manuel Ruiz Urdiales & Lola Naranjo Cirauqui · Ángel Angosto Fleta & Mª Carmen Sabroso González.
RSVP / Confirmación — formulario (ver punto 5).
Minijuego Team novio / Team novia — (ver punto 6).
Cierre — "¡Os esperamos!" + fecha.


5. Formulario de confirmación (RSVP)
Campos: nombre, ¿asistes? (sí/no), nº de acompañantes, alergias/intolerancias, canción que no puede faltar (opcional).
En móvil, botones grandes tipo "pill" para sí/no en vez de radios pequeños.
Backend: dejar la lógica de envío desacoplada (un módulo submitRsvp()), de momento puede apuntar a un Google Form / Formspree / Sheet. No hardcodear secretos.
Mensaje de confirmación cálido al enviar, en la voz de la pareja.


6. Minijuego "Team novio / Team novia"
Pequeño cuestionario de "¿cuánto conoces a María y Alberto?" o "¿de qué equipo eres?".
El invitado responde unas preguntas y al final se le asigna (o elige) Team Novio o Team Novia.
Mostrar un contador/medidor en vivo del reparto de votos (barra burdeos vs salvia) — es el gancho social.
Guardar el voto (mismo backend desacoplado que el RSVP).
Tono divertido y ligero, sin romper la elegancia general.


7. Animaciones y transiciones (el "no básico")
Referencias de lo que se lleva en 2026 (sin copiar ninguna):

Reveal al hacer scroll (fade + leve translateY) sección por sección, con IntersectionObserver.
Parallax muy sutil en la acuarela del hero.
Navegación flotante transparente que aparece al empezar a scrollear.
Microinteracciones en botones (el burdeos oscurece, leve scale al pulsar).
Countdown animado.

Disciplina: una sola pieza "wow" (la apertura del sobre). El resto, elegante y contenido. No saturar de efectos — eso es justo lo que hace que una web parezca genérica/IA. Restraint.

Rendimiento: lazy-load de lo que no sea crítico, vídeos precargados con cuidado, animaciones con transform/opacity (no layout), respetar reduced-motion en todo.


8. Requisitos técnicos / calidad
Mobile-first. Probar en viewport ~390px de ancho.
Carga rápida: optimizar imágenes (WebP), comprimir vídeos.
Accesibilidad: foco de teclado visible, alt en imágenes, contraste suficiente.
playsinline en todos los <video>.
Sin librerías de animación pesadas si se puede evitar; CSS + IntersectionObserver llegan para casi todo. Si se usa algo, que sea ligero (p.ej. nada de GSAP salvo necesidad real).
Estructura de archivos limpia, comentada, fácil de iterar.


9. Assets disponibles
lazo.mp4 — Vídeo 1 (sobre + lazo que se desliza).
apertura.mp4 — Vídeo 2 (solapa se abre, emerge la acuarela).
delante.png — sobre cara delantera con lazo (para el volteo).
detras.png — sobre cara trasera con sello A&M (para el volteo).
acuarela.png — la ilustración de los novios (Murcia ↔ Zaragoza), por si se necesita como imagen fija (hero, fallback de reduced-motion).


10. Texto real de la invitación (no inventar)
Los hijos de María y Alberto

Cada paso que hemos dado juntos nos ha llevado a este momento tan esperado. Nos gustaría que nos acompañases en el día de nuestra boda y pudieses formar parte del comienzo de nuestra vida juntos bajo la mirada de Dios.

Manuel Ruiz Urdiales · Lola Naranjo Cirauqui Ángel Angosto Fleta · Mª Carmen Sabroso González

La ceremonia se celebrará el 24 de octubre de 2026 a las 12:30 h en la Iglesia San Antonio de Padua, Zaragoza. La celebración tendrá lugar a continuación en la Finca Tierrabella.

Agradeceríamos confirmación lo antes posible.

