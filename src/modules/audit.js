/* =================================================================
   AUDITORÍA — registro de eventos en la colección "auditoria".

   Cada evento guarda el máximo contexto obtenible desde el navegador
   (user-agent, dispositivo, SO, idioma, pantalla, zona horaria,
   referrer…). SIN IP: no se captura ni aquí ni en el servidor.

   Tipos usados: 'visita' (carga de página pública), 'envio_formulario'
   (RSVP enviado, con referencia al doc), 'juego' (partida terminada).

   El registro es "fire-and-forget": nunca bloquea ni rompe la web si
   Firestore falla. Las reglas permiten CREAR sin sesión pero la LECTURA
   exige autenticación (solo el panel /resultados puede consultarla).
   ================================================================= */

import { db, isConfigured } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/** Infiere tipo de dispositivo, SO y navegador a partir del user-agent.
    Es orientativo (los UA mienten), pero suficiente para el panel. */
function deviceInfo() {
  const ua = navigator.userAgent || '';

  const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone|iPod/i.test(ua);
  const device = isTablet ? 'tablet' : isMobile ? 'movil' : 'escritorio';

  let os = 'otro';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = (ua.match(/Android [\d.]+/) || ['Android'])[0];
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = 'otro';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return { device, os, browser };
}

/** Contexto completo del navegador en el momento del evento. */
function context() {
  const info = deviceInfo();
  const ctx = {
    ...info,
    page: location.pathname,
    userAgent: String(navigator.userAgent || '').slice(0, 400),
    language: navigator.language || '',
    languages: (navigator.languages || []).slice(0, 5).join(', '),
    screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    pixelRatio: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })(),
    referrer: String(document.referrer || '').slice(0, 300),
    touch: (navigator.maxTouchPoints || 0) > 0,
    platform: String(navigator.platform || ''),
    cores: navigator.hardwareConcurrency || 0,
  };
  // Solo si el navegador los expone (Chrome/Android, sobre todo)
  if (navigator.deviceMemory) ctx.memory = `${navigator.deviceMemory} GB`;
  if (navigator.connection?.effectiveType) ctx.connection = navigator.connection.effectiveType;
  return ctx;
}

/**
 * Registra un evento de auditoría. Nunca lanza ni bloquea.
 * @param {string} tipo  'visita' | 'envio_formulario' | 'juego' | …
 * @param {Object} [extra]  datos propios del evento (p. ej. rsvpId)
 */
export function logAudit(tipo, extra = {}) {
  if (!isConfigured) return;
  try {
    addDoc(collection(db, 'auditoria'), {
      tipo,
      ...context(),
      ...extra,
      createdAt: serverTimestamp(),
    }).catch((err) => console.warn('[auditoria] no registrado:', err?.code || err));
  } catch (err) {
    console.warn('[auditoria] no registrado:', err);
  }
}
