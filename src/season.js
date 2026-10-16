// Seasonal versions of the lobby logo. Each season swaps the hat on the W, the O in OPS and the
// twinkling decorations; colours come from `.lo-logo[data-season=...]` in styles.css.
// Preview any season with ?season=halloween|christmas|easter (or ?season=none for the default).

/** Easter Sunday for a year (Anonymous Gregorian algorithm). */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getSeason(date = new Date()) {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 9) return 'halloween';
  if (month === 11 && day <= 26) return 'christmas';
  const today = new Date(date.getFullYear(), month, day);
  const daysFromEaster = Math.round((today - easterSunday(date.getFullYear())) / DAY_MS);
  if (daysFromEaster >= -7 && daysFromEaster <= 1) return 'easter';
  return null;
}

const ART = {
  halloween: {
    hat: `<svg class="lo-logo-hat" viewBox="0 0 100 90"><path d="M8 78 Q50 66 92 78 L84 86 Q50 76 16 86 Z" fill="#22120a" stroke="#0d0503" stroke-width="5" stroke-linejoin="round"/><path d="M26 74 L48 22 Q58 4 74 10 Q60 14 58 30 L72 72 Z" fill="#3a2010" stroke="#0d0503" stroke-width="5" stroke-linejoin="round"/><path d="M28 66 L70 64 L72 72 L26 74 Z" fill="#ff7a1a" stroke="#0d0503" stroke-width="4" stroke-linejoin="round"/></svg>`,
    o: `<svg class="lo-logo-o" viewBox="0 0 100 100"><path d="M48 18 Q46 6 54 4" fill="none" stroke="#3d6b22" stroke-width="7" stroke-linecap="round"/><ellipse cx="50" cy="58" rx="46" ry="38" fill="#ff7a1a" stroke="#2a1206" stroke-width="5"/><path d="M50 22 Q34 58 50 95 M50 22 Q66 58 50 95 M50 22 Q18 58 24 92 M50 22 Q82 58 76 92" fill="none" stroke="#d65a08" stroke-width="3"/><path d="M28 50 L38 40 L44 52 Z M72 50 L62 40 L56 52 Z" fill="#ffe08a"/><path d="M30 68 Q50 84 70 68 L64 70 L58 66 L50 72 L42 66 L36 70 Z" fill="#ffe08a"/></svg>`,
    decor: '<svg viewBox="0 0 60 30"><path d="M30 12 Q26 4 22 10 Q14 2 2 8 Q10 12 8 20 Q16 14 22 22 Q26 16 30 22 Q34 16 38 22 Q44 14 52 20 Q50 12 58 8 Q46 2 38 10 Q34 4 30 12 Z" fill="#1a0d24" stroke="#ff7a1a" stroke-width="1"/></svg>',
  },
  christmas: {
    hat: `<svg class="lo-logo-hat" viewBox="0 0 100 90"><path d="M26 72 L46 24 Q60 0 82 18 Q66 16 60 30 L72 70 Z" fill="#d62839" stroke="#3a0a10" stroke-width="5" stroke-linejoin="round"/><circle cx="84" cy="20" r="9" fill="#ffffff" stroke="#3a0a10" stroke-width="4"/><rect x="12" y="66" width="76" height="18" rx="9" fill="#ffffff" stroke="#3a0a10" stroke-width="5"/></svg>`,
    o: `<svg class="lo-logo-o" viewBox="0 0 100 100"><defs><radialGradient id="bauble" cx="38%" cy="36%" r="70%"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".45" stop-color="#e63946"/><stop offset="1" stop-color="#7a0c18"/></radialGradient></defs><path d="M50 4 Q58 4 58 12" fill="none" stroke="#c9a227" stroke-width="4"/><rect x="40" y="10" width="20" height="12" rx="3" fill="#ffc340" stroke="#3a0a10" stroke-width="3"/><circle cx="50" cy="60" r="38" fill="url(#bauble)" stroke="#0f3d1f" stroke-width="5"/><path d="M14 56 Q50 70 86 56" fill="none" stroke="#ffd166" stroke-width="5"/><ellipse cx="36" cy="44" rx="9" ry="6" fill="#ffffff" opacity=".7" transform="rotate(-30 36 44)"/></svg>`,
    decor: '<svg viewBox="0 0 20 20"><g stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"><path d="M10 1 V19 M2.2 5.5 L17.8 14.5 M2.2 14.5 L17.8 5.5"/><path d="M10 4 L8 2 M10 4 L12 2 M10 16 L8 18 M10 16 L12 18"/></g></svg>',
  },
  easter: {
    hat: `<svg class="lo-logo-hat" viewBox="0 0 100 90"><ellipse cx="40" cy="22" rx="7" ry="20" fill="#ffffff" stroke="#5b3a8c" stroke-width="4" transform="rotate(-18 40 22)"/><ellipse cx="40" cy="22" rx="3" ry="13" fill="#ffb3d9" transform="rotate(-18 40 22)"/><ellipse cx="62" cy="20" rx="7" ry="20" fill="#ffffff" stroke="#5b3a8c" stroke-width="4" transform="rotate(14 62 20)"/><ellipse cx="62" cy="20" rx="3" ry="13" fill="#ffb3d9" transform="rotate(14 62 20)"/><path d="M8 78 Q50 66 92 78 L84 86 Q50 76 16 86 Z" fill="#b89cff" stroke="#5b3a8c" stroke-width="5" stroke-linejoin="round"/><path d="M28 74 L42 38 Q50 30 58 38 L72 72 Z" fill="#c9b3ff" stroke="#5b3a8c" stroke-width="5" stroke-linejoin="round"/><path d="M30 66 L70 64 L72 72 L28 74 Z" fill="#ff9ecf" stroke="#5b3a8c" stroke-width="4" stroke-linejoin="round"/></svg>`,
    o: `<svg class="lo-logo-o lo-logo-egg" viewBox="0 0 80 100"><path d="M40 4 C64 4 76 44 76 64 C76 86 60 96 40 96 C20 96 4 86 4 64 C4 44 16 4 40 4 Z" fill="#9fe3ff" stroke="#5b3a8c" stroke-width="5"/><path d="M6 52 L16 44 L26 52 L36 44 L46 52 L56 44 L66 52 L76 44" fill="none" stroke="#ff7ac0" stroke-width="5" stroke-linejoin="round"/><path d="M7 70 Q40 80 73 70" fill="none" stroke="#ffe066" stroke-width="5"/><circle cx="26" cy="28" r="4" fill="#ffe066"/><circle cx="50" cy="24" r="4" fill="#ff7ac0"/><circle cx="40" cy="86" r="4" fill="#b89cff"/></svg>`,
    decor: '<svg viewBox="0 0 20 20"><g fill="#ff9ecf"><circle cx="10" cy="4.5" r="4"/><circle cx="15.5" cy="10" r="4"/><circle cx="10" cy="15.5" r="4"/><circle cx="4.5" cy="10" r="4"/></g><circle cx="10" cy="10" r="3.2" fill="#ffe066"/></svg>',
  },
};

/** Swaps the lobby logo's hat, O and decorations for the current season (or the ?season= override). */
export function applySeasonalLogo(date = new Date()) {
  const logo = document.querySelector('.lo-logo');
  if (!logo) return null;
  const override = new URLSearchParams(location.search).get('season');
  const season = override === 'none' ? null : (ART[override] ? override : getSeason(date));
  if (!season) return null;

  const art = ART[season];
  logo.dataset.season = season;
  logo.querySelector('.lo-logo-hat')?.insertAdjacentHTML('afterend', art.hat);
  logo.querySelector('.lo-logo-hat')?.remove();
  logo.querySelector('.lo-logo-orb')?.insertAdjacentHTML('afterend', art.o);
  logo.querySelector('.lo-logo-orb')?.remove();
  logo.querySelectorAll('.lo-logo-star').forEach((star) => {
    star.insertAdjacentHTML('afterend', art.decor);
    const replacement = star.nextElementSibling;
    replacement.setAttribute('class', star.getAttribute('class'));
    replacement.setAttribute('style', star.getAttribute('style') || '');
    star.remove();
  });
  return season;
}
