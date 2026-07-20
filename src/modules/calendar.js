/* =================================================================
   Añadir al calendario — genera y descarga un archivo .ics estándar
   (compatible con Google Calendar, Apple Calendar, Outlook…).
   ================================================================= */

// Formato UTC para .ics: YYYYMMDDTHHMMSSZ
// 24/10/2026 12:30 hora España (CEST, UTC+2) → 10:30 UTC.
// La ubicación lleva la dirección COMPLETA: hay varias iglesias "San
// Antonio de Padua" (Alagón, etc.) y solo con el nombre el mapa del
// calendario puede llevar a otra. Sin GEO: la dirección postal basta y
// no arriesgamos unas coordenadas equivocadas.
const EVENT = {
  title: 'Boda de María & Alberto',
  description: 'Ceremonia en la Iglesia de San Antonio de Padua (Paseo de Cuéllar, 10, Zaragoza) y celebración en la Finca Tierrabella.',
  location: 'Iglesia de San Antonio de Padua, Paseo de Cuéllar, 10, 50006 Zaragoza',
  startUTC: '20261024T103000Z',
  endUTC: '20261024T180000Z',
};

/** Escapa texto para .ics (RFC 5545): coma, punto y coma, barra y saltos. */
function icsText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function buildIcs() {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maria & Alberto//Boda 2026//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:boda-maria-alberto-2026@invitacion',
    'DTSTART:' + EVENT.startUTC,
    'DTEND:' + EVENT.endUTC,
    'SUMMARY:' + icsText(EVENT.title),
    'DESCRIPTION:' + icsText(EVENT.description),
    'LOCATION:' + icsText(EVENT.location),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function initCalendar() {
  const btn = document.getElementById('add-calendar');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'boda-maria-alberto.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
