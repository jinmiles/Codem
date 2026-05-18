/**
 * Codem - Codex Usage Monitor
 * GNOME Shell Extension (TypeScript source, compiled to ES2018)
 *
 * Reads ~/.codex/auth.json and polls the Codex usage API every 60 s.
 * Displays 5-hour and weekly usage as a top-bar pill with a detailed popup.
 */

'use strict';

// ---------------------------------------------------------------------------
// GNOME Shell global declarations (GJS runtime — not ES imports)
// ---------------------------------------------------------------------------
declare const imports: any;
declare const TextDecoder: any;
declare function log(msg: string): void;

// ---------------------------------------------------------------------------
// GJS module bindings
// ---------------------------------------------------------------------------
const { GObject, GLib, St, Clutter, Gio, Soup } = imports.gi;
const Main      = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WindowData {
    used_percent: number;
    limit_window_seconds: number;
    reset_after_seconds: number;
    reset_at: number;
}

interface RateLimit {
    allowed: boolean;
    primary_window: WindowData;
    secondary_window: WindowData;
}

interface UsageResponse {
    email: string;
    plan_type: string;
    rate_limit: RateLimit;
}

interface ColorState {
    threshold: number;
    bg: string;
    fg: string;
    label: string;
}

interface SectionWidgets {
    item: any;
    pctLabel: any;
    barFill: any;
    countdownLabel: any;
    resetAtLabel: any;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AUTH_PATH    = GLib.get_home_dir() + '/.codex/auth.json';
const USAGE_URL    = 'https://chatgpt.com/backend-api/wham/usage';
const POLL_SECONDS = 60;
const TICK_SECONDS = 1;
const BAR_WIDTH_PX = 266;  // must match .codem-bar-outer width in CSS

const COLOR_STATES: ColorState[] = [
    { threshold: 60,  bg: '#3fb950', fg: '#3fb950', label: 'ok'       },  // emerald
    { threshold: 80,  bg: '#818cf8', fg: '#818cf8', label: 'warning'  },  // soft indigo
    { threshold: 95,  bg: '#fb923c', fg: '#fb923c', label: 'critical' },  // orange
    { threshold: 101, bg: '#f87171', fg: '#f87171', label: 'depleted' },  // rose
];

// Dark tinted pill backgrounds matching each state
const PILL_BG: Record<string, string> = {
    ok:       '#0d2b1f',
    warning:  '#1a1848',
    critical: '#2d1505',
    depleted: '#2d0f0f',
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function getColorState(pct: number): ColorState {
    for (const s of COLOR_STATES) {
        if (pct < s.threshold) return s;
    }
    return COLOR_STATES[COLOR_STATES.length - 1];
}

function formatCountdown(seconds: number): string {
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

function formatResetTime(unixTs: number): string {
    const reset   = new Date(unixTs * 1000);
    const now     = new Date();
    const timeStr = reset.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const days    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dateStr = `${months[reset.getMonth()]} ${reset.getDate()}`;

    // Compare calendar dates (midnight-aligned)
    const resetDay    = new Date(reset.getFullYear(), reset.getMonth(), reset.getDate()).getTime();
    const todayDay    = new Date(now.getFullYear(),   now.getMonth(),   now.getDate()).getTime();
    const tomorrowDay = todayDay + 86400000;

    if (resetDay === todayDay)    return `Today, ${dateStr}  ${timeStr}`;
    if (resetDay === tomorrowDay) return `Tomorrow, ${dateStr}  ${timeStr}`;
    return `${days[reset.getDay()]}, ${dateStr}  ${timeStr}`;
}

// ---------------------------------------------------------------------------
// Indicator
// ---------------------------------------------------------------------------
const CodemIndicator = GObject.registerClass(
class CodemIndicator extends PanelMenu.Button {

    // class-level field declarations for TypeScript
    _data: UsageResponse | null       = null;
    _pollTimer: number | null         = null;
    _tickTimer: number | null         = null;
    _session: any                     = null;
    _primaryLeft: number              = 0;
    _secondaryLeft: number            = 0;
    _primarySection: SectionWidgets   = null as any;
    _secondarySection: SectionWidgets = null as any;
    _headerSub: any                   = null;
    _headerTimestamp: any             = null;
    _labelPrimary: any                = null;
    _labelSecondary: any              = null;
    _pill: any                        = null;
    _pillIcon: any                    = null;
    _pillSep: any                     = null;

    _init() {
        super._init(0.0, 'Codem', false);

        this._buildPill();
        this._buildPopup();
        this._setupSession();
        this._fetchUsage();
        this._startPolling();
        this._startTick();
    }

    // -----------------------------------------------------------------------
    // Top-bar pill
    // -----------------------------------------------------------------------
    _buildPill() {
        this._pill = new St.BoxLayout({ style_class: 'codem-pill', vertical: false, reactive: true });
        this.add_child(this._pill);

        // Symbolic icon — represents a usage monitor / activity
        this._pillIcon = new St.Icon({
            icon_name: 'utilities-system-monitor-symbolic',
            style_class: 'codem-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._pillIcon);

        // 5h percentage
        this._labelPrimary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelPrimary);

        // Separator
        this._pillSep = new St.Label({
            text: '·',
            style_class: 'codem-sep',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._pillSep);

        // Weekly percentage
        this._labelSecondary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelSecondary);
    }

    // -----------------------------------------------------------------------
    // Popup menu
    // -----------------------------------------------------------------------
    _buildPopup() {
        this.menu.removeAll();

        // Dark background + remove white system-theme border
        this.menu.box.set_style(
            'background-color:#0d1117; padding:4px 0; border-radius:8px;'
        );
        // Tag our boxpointer so CSS can target only this popup's border
        this.menu.actor.add_style_class_name('codem-popup-container');

        // ── Top row: last-updated timestamp (left) + refresh icon (right) ──
        const topItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        const topRow  = new St.BoxLayout({ vertical: false, style_class: 'codem-top-row' });

        this._headerTimestamp = new St.Label({
            text: 'Updated: —',
            style_class: 'codem-timestamp',
            y_align: Clutter.ActorAlign.CENTER,
        });
        topRow.add_child(this._headerTimestamp);
        topRow.add_child(new St.Widget({ x_expand: true }));

        const refreshBtn = new St.Button({ style_class: 'codem-refresh-btn' });
        const refreshIcon = new St.Icon({
            icon_name: 'view-refresh-symbolic',
            style_class: 'codem-refresh-icon',
        });
        refreshBtn.set_child(refreshIcon);
        refreshBtn.connect('clicked', () => { this._setLoading(); this._fetchUsage(); });
        topRow.add_child(refreshBtn);

        topItem.add_child(topRow);
        this.menu.addMenuItem(topItem);

        // ── Usage sections (no separators) ──
        this._primarySection   = this._makeSectionItem('5H LIMIT');
        this.menu.addMenuItem(this._primarySection.item);

        this._secondarySection = this._makeSectionItem('7-DAY LIMIT');
        this.menu.addMenuItem(this._secondarySection.item);

        // ── Account info at bottom ──
        const accountItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this._headerSub = new St.Label({
            text: 'Loading...',
            style_class: 'codem-account-info',
        });
        accountItem.add_child(this._headerSub);
        this.menu.addMenuItem(accountItem);
    }

    _makeSectionItem(label: string): SectionWidgets {
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        const box  = new St.BoxLayout({ vertical: true, style_class: 'codem-section-box' });

        // Title row: label expands, pct stays right
        const titleRow = new St.BoxLayout({ vertical: false });
        const titleLbl = new St.Label({
            text: label,
            style_class: 'codem-section-title',
            x_expand: true,
        });
        const pctLabel = new St.Label({
            text: '---%',
            style_class: 'codem-section-pct',
            x_expand: false,
        });
        titleRow.add_child(titleLbl);
        titleRow.add_child(pctLabel);
        box.add_child(titleRow);

        // Progress bar: fixed-width outer track + inner fill
        const barOuter = new St.Widget({ style_class: 'codem-bar-outer' });
        const barFill  = new St.Widget({ style_class: 'codem-bar-fill' });
        barOuter.add_child(barFill);
        box.add_child(barOuter);

        // Info row: countdown + reset time
        const infoRow        = new St.BoxLayout({ vertical: false });
        const countdownLabel = new St.Label({ text: 'Resets in —', style_class: 'codem-countdown', x_expand: true });
        const resetAtLabel   = new St.Label({ text: '—',           style_class: 'codem-reset-at'   });
        infoRow.add_child(countdownLabel);
        infoRow.add_child(resetAtLabel);
        box.add_child(infoRow);

        item.add_child(box);
        return { item, pctLabel, barFill, countdownLabel, resetAtLabel };
    }

    // -----------------------------------------------------------------------
    // HTTP
    // -----------------------------------------------------------------------
    _setupSession() {
        this._session = new Soup.Session();
        this._session.user_agent = 'Codem/1.0 GNOME-Shell-Extension';
    }

    _setLoading() {
        this._labelPrimary.set_text('—');
        this._labelSecondary.set_text('—');
    }

    _fetchUsage() {
        let authData: any;
        try { authData = this._readAuth(); }
        catch (e: any) { this._setError(`auth: ${e.message}`); return; }

        const token = authData && authData.tokens && authData.tokens.access_token;
        if (!token) { this._setError('access_token not found'); return; }

        const message = Soup.Message.new('GET', USAGE_URL);
        message.request_headers.replace('Authorization', `Bearer ${token}`);
        message.request_headers.replace('Content-Type',  'application/json');
        message.request_headers.replace('User-Agent',    'Codem/1.0');

        this._session.queue_message(message, (_sess: any, msg: any) => {
            try {
                if (msg.status_code !== 200) { this._setError(`HTTP ${msg.status_code}`); return; }
                const data: UsageResponse = JSON.parse(msg.response_body.data);
                this._data = data;
                this._onDataReceived(data);
            } catch (e: any) {
                this._setError(`parse: ${e.message}`);
            }
        });
    }

    _readAuth(): any {
        const file = Gio.File.new_for_path(AUTH_PATH);
        const [ok, contents] = file.load_contents(null);
        if (!ok) throw new Error('cannot read file');
        const text = (typeof ByteArray !== 'undefined')
            ? ByteArray.toString(contents)
            : new TextDecoder().decode(contents);
        return JSON.parse(text);
    }

    // -----------------------------------------------------------------------
    // UI update
    // -----------------------------------------------------------------------
    _onDataReceived(data: UsageResponse) {
        const rl = data.rate_limit || ({} as RateLimit);
        const pw = rl.primary_window;
        const sw = rl.secondary_window;
        if (!pw || !sw) { this._setError('unexpected response'); return; }

        this._primaryLeft   = pw.reset_after_seconds;
        this._secondaryLeft = sw.reset_after_seconds;
        this._updatePill(pw, sw);
        this._updatePopup(data, pw, sw);
    }

    _updatePill(pw: WindowData, sw: WindowData) {
        const pct   = Math.max(pw.used_percent, sw.used_percent);
        const state = getColorState(pct);
        const pillBg = PILL_BG[state.label] || '#0d1117';

        this._labelPrimary.set_text(`${pw.used_percent}%`);
        this._labelSecondary.set_text(`${sw.used_percent}%`);

        this._pill.set_style(
            `background-color:${pillBg};border-radius:100px;padding:2px 10px 2px 7px;`
        );
        this._pillIcon.set_style(`color:${state.fg};`);
        this._labelPrimary.set_style(`color:${state.fg};font-weight:bold;font-size:11px;`);
        this._labelSecondary.set_style(`color:${state.fg};font-weight:bold;font-size:11px;opacity:0.7;`);
        this._pillSep.set_style(`color:${state.fg};opacity:0.3;margin:0 4px;font-size:9px;`);
    }

    _updatePopup(data: UsageResponse, pw: WindowData, sw: WindowData) {
        const plan    = data.plan_type || 'unknown';
        const email   = data.email     || 'unknown';
        const allowed = data.rate_limit && data.rate_limit.allowed;

        // Timestamp at top
        const now = new Date();
        this._headerTimestamp.set_text(
            `Updated ${now.toLocaleTimeString('en-US', { hour12: false })}`
        );

        this._updateSection(this._primarySection,   pw);
        this._updateSection(this._secondarySection, sw);

        // Account info at bottom
        this._headerSub.set_text(
            `${email}  ·  ${plan.toUpperCase()}  ·  ${allowed ? 'Active' : 'Rate Limited'}`
        );
    }

    _updateSection(section: SectionWidgets, win: WindowData) {
        const pct    = win.used_percent;
        const state  = getColorState(pct);
        const fillPx = Math.max(2, Math.round((pct / 100) * BAR_WIDTH_PX));

        section.pctLabel.set_text(`${pct}%`);
        section.pctLabel.set_style(`color:${state.bg};font-weight:bold;font-size:14px;`);

        section.barFill.set_width(fillPx);
        section.barFill.set_style(`background-color:${state.bg};border-radius:2px;height:4px;`);

        section.countdownLabel.set_text(`Resets in ${formatCountdown(win.reset_after_seconds)}`);
        section.resetAtLabel.set_text(`at ${formatResetTime(win.reset_at)}`);
    }

    _setError(msg: string) {
        this._labelPrimary.set_text('ERR');
        this._labelSecondary.set_text('—');
        this._pill.set_style('background-color:#160505;border-radius:100px;padding:2px 10px 2px 7px;');
        this._pillIcon.set_style('color:#f87171;');
        this._labelPrimary.set_style('color:#f87171;font-weight:bold;font-size:11px;');
        this._labelSecondary.set_style('color:#f87171;opacity:0.5;font-size:11px;');
        if (this._headerSub) this._headerSub.set_text(`Error: ${msg}`);
        if (this._headerTimestamp) this._headerTimestamp.set_text('Updated: —');
        log(`[Codem] Error: ${msg}`);
    }

    // -----------------------------------------------------------------------
    // Timers
    // -----------------------------------------------------------------------
    _startPolling() {
        this._pollTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._fetchUsage();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _startTick() {
        this._tickTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
            if (this._primaryLeft   > 0) this._primaryLeft--;
            if (this._secondaryLeft > 0) this._secondaryLeft--;
            if (this.menu.isOpen && this._data) {
                this._primarySection.countdownLabel.set_text(
                    `Resets in ${formatCountdown(this._primaryLeft)}`
                );
                this._secondarySection.countdownLabel.set_text(
                    `Resets in ${formatCountdown(this._secondaryLeft)}`
                );
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimers() {
        if (this._pollTimer)  { GLib.source_remove(this._pollTimer);  this._pollTimer  = null; }
        if (this._tickTimer)  { GLib.source_remove(this._tickTimer);  this._tickTimer  = null; }
    }

    destroy() {
        this._stopTimers();
        if (this._session) { this._session.abort(); this._session = null; }
        super.destroy();
    }
});

// ---------------------------------------------------------------------------
// Entry points (GNOME 3.36 legacy style)
// ---------------------------------------------------------------------------
let _indicator: any = null;

function init() {}

function enable() {
    _indicator = new CodemIndicator();
    Main.panel.addToStatusArea('codem', _indicator, 1, 'right');
}

function disable() {
    if (_indicator) { _indicator.destroy(); _indicator = null; }
}
