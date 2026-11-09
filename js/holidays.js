/* =============================================================
   holidays.js — French public holidays (taken from CONGER PAYER)
   The 11 official holidays of any year: fixed dates + Easter-based
   ones (Easter Sunday by the Meeus/Butcher algorithm).
   ============================================================= */

const Holidays = (() => {
    "use strict";

    /* Easter Sunday (Meeus/Butcher algorithm) */
    function easter(year) {
        const a = year % 19,
              b = Math.floor(year / 100), c = year % 100,
              d = Math.floor(b / 4), e = b % 4,
              f = Math.floor((b + 8) / 25),
              g = Math.floor((b - f + 1) / 3),
              h = (19 * a + b - d - g + 15) % 30,
              i = Math.floor(c / 4), k = c % 4,
              l = (32 + 2 * e + 2 * i - h - k) % 7,
              m = Math.floor((a + 11 * h + 22 * l) / 451),
              month = Math.floor((h + l - 7 * m + 114) / 31),
              day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(Date.UTC(year, month - 1, day));
    }

    function plusDays(date, n) {
        const r = new Date(date);
        r.setUTCDate(r.getUTCDate() + n);
        return r;
    }

    /* Holidays of a year (UTC dates) */
    function list(year) {
        const e = easter(year);
        return [
            new Date(Date.UTC(year, 0, 1)),   // New Year's Day
            plusDays(e, 1),                   // Easter Monday
            new Date(Date.UTC(year, 4, 1)),   // Labour Day
            new Date(Date.UTC(year, 4, 8)),   // Victory in Europe Day
            plusDays(e, 39),                  // Ascension Day
            plusDays(e, 50),                  // Whit Monday
            new Date(Date.UTC(year, 6, 14)),  // Bastille Day
            new Date(Date.UTC(year, 7, 15)),  // Assumption
            new Date(Date.UTC(year, 10, 1)),  // All Saints' Day
            new Date(Date.UTC(year, 10, 11)), // Armistice Day
            new Date(Date.UTC(year, 11, 25))  // Christmas
        ];
    }

    /* True if the (UTC) date is a French public holiday */
    function isHoliday(date) {
        return list(date.getUTCFullYear()).some(f =>
            f.getUTCMonth() === date.getUTCMonth() && f.getUTCDate() === date.getUTCDate());
    }

    return { list, isHoliday };
})();
