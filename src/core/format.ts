namespace CodemCore {
    export function getColorState(pct: number): ColorState {
        for (const state of COLOR_STATES) {
            if (pct < state.threshold) return state;
        }
        return COLOR_STATES[COLOR_STATES.length - 1];
    }

    export function formatCountdown(seconds: number): string {
        if (seconds <= 0) return 'resetting soon';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    export function formatResetTime(unixTs: number): string {
        const reset = new Date(unixTs * 1000);
        const now = new Date();
        const timeStr = reset.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dateStr = `${months[reset.getMonth()]} ${reset.getDate()}`;

        const resetDay = new Date(reset.getFullYear(), reset.getMonth(), reset.getDate()).getTime();
        const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const tomorrowDay = todayDay + 86400000;

        if (resetDay === todayDay) return `Today, ${dateStr}  ${timeStr}`;
        if (resetDay === tomorrowDay) return `Tomorrow, ${dateStr}  ${timeStr}`;
        return `${days[reset.getDay()]}, ${dateStr}  ${timeStr}`;
    }
}
