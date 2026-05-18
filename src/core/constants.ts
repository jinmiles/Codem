namespace CodemCore {
    export const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

    export const COLOR_STATES: ColorState[] = [
        { threshold: 60,  bg: '#3fb950', fg: '#3fb950', label: 'ok'       },
        { threshold: 80,  bg: '#818cf8', fg: '#818cf8', label: 'warning'  },
        { threshold: 95,  bg: '#fb923c', fg: '#fb923c', label: 'critical' },
        { threshold: 101, bg: '#f87171', fg: '#f87171', label: 'depleted' },
    ];

    export const PILL_BG: Record<string, string> = {
        ok:       '#0d2b1f',
        warning:  '#1a1848',
        critical: '#2d1505',
        depleted: '#2d0f0f',
    };
}
