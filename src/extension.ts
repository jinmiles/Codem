/**
 * Codem - Codex Usage Monitor
 * GNOME Shell Extension (TypeScript source, compiled to ES2018)
 *
 * Polls the Codex usage API (token from ~/.codex/auth.json) every 60 s and the
 * Claude Code OAuth usage API (token from ~/.claude/.credentials.json) on a
 * slower cadence, since that endpoint rate-limits aggressively when polled.
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

type WindowData = CodemCore.WindowData;
type UsageResponse = CodemCore.UsageResponse;

interface SectionWidgets {
    item: any;
    pctLabel: any;
    barOuter: any;
    barFill: any;
    countdownLabel: any;
    resetAtLabel: any;
    pct: number;
}

// Per-provider widgets and live state. Codex and Claude share the same shape;
// behavioral differences are kept explicit at each call site (Codex tracks an
// HTTP `error` state, Claude tracks file `available` state).
interface Provider {
    // Pill widgets
    brand: any;
    primary: any;
    secondary: any;
    sep: any;
    // Popup widgets
    primarySection: SectionWidgets;
    secondarySection: SectionWidgets;
    account: any;
    // State
    data: UsageResponse | null;
    available: boolean;
    error: boolean;
    primaryLeft: number;
    secondaryLeft: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AUTH_PATH          = GLib.get_home_dir() + '/.codex/auth.json';
const CLAUDE_CREDS_PATH  = GLib.get_home_dir() + '/.claude/.credentials.json';
const POLL_SECONDS       = 60;
// Claude's /api/oauth/usage endpoint rate-limits hard when polled, so it is
// fetched much less often than Codex.
const CLAUDE_POLL_SECONDS = 300;
const TICK_SECONDS       = 1;
const MUTED_COLOR        = '#6e7681';
const ERROR_COLOR        = '#f87171';
const PILL_PADDING_STYLE = 'border-radius:100px;padding:1px 8px 1px 6px;';

function makeProvider(): Provider {
    return {
        brand: null, primary: null, secondary: null, sep: null,
        primarySection: null as any, secondarySection: null as any, account: null,
        data: null, available: false, error: false,
        primaryLeft: 0, secondaryLeft: 0,
    };
}

// ---------------------------------------------------------------------------
// Indicator
// ---------------------------------------------------------------------------
const CodemIndicator = GObject.registerClass(
class CodemIndicator extends PanelMenu.Button {

    // class-level field declarations for TypeScript
    _codex: Provider           = null as any;
    _claude: Provider          = null as any;
    _providers: Provider[]     = [];
    _pollTimer: number | null       = null;
    _claudePollTimer: number | null = null;
    _tickTimer: number | null       = null;
    _session: any              = null;
    _headerTimestamp: any      = null;
    _pill: any                 = null;
    _pillIcon: any             = null;
    _providerSep: any          = null;
    _destroyed: boolean        = false;

    _init() {
        super._init(0.0, 'Codem', false);

        this._codex = makeProvider();
        this._claude = makeProvider();
        this._providers = [this._codex, this._claude];

        this._buildPill();
        this._buildPopup();
        this._setupSession();
        this._refreshUsage(false);
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

        this._buildPillGroup(this._codex, 'Codex');

        this._providerSep = new St.Label({
            text: '•',
            style_class: 'codem-provider-sep',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._providerSep);

        this._buildPillGroup(this._claude, 'Claude');
    }

    // Brand + 5h% + separator + weekly% for one provider, appended in order.
    _buildPillGroup(p: Provider, brandText: string) {
        p.brand = new St.Label({
            text: brandText,
            style_class: 'codem-brand',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(p.brand);

        p.primary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(p.primary);

        p.sep = new St.Label({
            text: '·',
            style_class: 'codem-sep',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(p.sep);

        p.secondary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(p.secondary);
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
        refreshBtn.connect('clicked', () => { this._refreshUsage(true); });
        topRow.add_child(refreshBtn);

        topItem.add_child(topRow);
        this.menu.addMenuItem(topItem);

        // ── Usage sections (no separators) ──
        this._buildProviderSections(this._codex,  'CODEX 5H LIMIT',  'CODEX WEEKLY LIMIT');
        this._buildProviderSections(this._claude, 'CLAUDE 5H LIMIT', 'CLAUDE WEEKLY LIMIT');

        // ── Account info at bottom ──
        this._buildProviderAccount(this._codex,  'Codex: loading...');
        this._buildProviderAccount(this._claude, 'Claude: loading...');
    }

    _buildProviderSections(p: Provider, primaryTitle: string, secondaryTitle: string) {
        p.primarySection = this._makeSectionItem(primaryTitle);
        this.menu.addMenuItem(p.primarySection.item);

        p.secondarySection = this._makeSectionItem(secondaryTitle);
        this.menu.addMenuItem(p.secondarySection.item);
    }

    _buildProviderAccount(p: Provider, initialText: string) {
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        p.account = new St.Label({ text: initialText, style_class: 'codem-account-info' });
        item.add_child(p.account);
        this.menu.addMenuItem(item);
    }

    _refreshUsage(showLoading: boolean) {
        if (showLoading) this._setCodexLoading();
        this._fetchClaudeUsage();
        this._fetchUsage();
    }

    _setUpdatedNow() {
        const now = new Date();
        this._headerTimestamp.set_text(
            `Updated ${now.toLocaleTimeString('en-US', { hour12: false })}`
        );
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

        // Progress bar: full-width outer track + colored fill sized via set_width()
        const barOuter = new St.Widget({ style_class: 'codem-bar-outer', x_expand: true });
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

        const widgets: SectionWidgets = { item, pctLabel, barOuter, barFill, countdownLabel, resetAtLabel, pct: 0 };
        // Keep the fill in sync with the track's real allocated width so it fills
        // exactly to the end at 100%, regardless of theme padding or popup width.
        // The track's width is 0 until the popup is first laid out.
        barOuter.connect('notify::width', () => this._applyBarFill(widgets));
        return widgets;
    }

    _applyBarFill(section: SectionWidgets) {
        const trackWidth = section.barOuter.get_width();
        const fillPx = trackWidth > 0
            ? Math.max(2, Math.round((section.pct / 100) * trackWidth))
            : 2;
        section.barFill.set_width(fillPx);
    }

    // -----------------------------------------------------------------------
    // HTTP
    // -----------------------------------------------------------------------
    _setupSession() {
        this._session = new Soup.Session();
        this._session.user_agent = 'Codem/1.0 GNOME-Shell-Extension';
    }

    _setCodexLoading() {
        this._codex.error = false;
        this._codex.primary.set_text('—');
        this._codex.secondary.set_text('—');
        this._updatePillStyles();
    }

    _fetchUsage() {
        if (this._destroyed) return;

        let authData: CodemCore.AuthData;
        try { authData = this._readAuth(); }
        catch (e: any) { this._setCodexError(`auth: ${e.message}`); return; }

        const token = CodemCore.extractAccessToken(authData);
        if (!token) { this._setCodexError('access_token not found'); return; }

        const message = Soup.Message.new('GET', CodemCore.USAGE_URL);
        message.request_headers.replace('Authorization', `Bearer ${token}`);
        message.request_headers.replace('Content-Type',  'application/json');
        message.request_headers.replace('User-Agent',    'Codem/1.0');

        this._session.queue_message(message, (_sess: any, msg: any) => {
            if (this._destroyed) return;

            try {
                if (msg.status_code !== 200) { this._setCodexError(`HTTP ${msg.status_code}`); return; }
                const data = JSON.parse(msg.response_body.data);
                if (!CodemCore.isUsageResponse(data)) {
                    this._setCodexError('unexpected response');
                    return;
                }
                this._codex.data = data;
                this._codex.error = false;
                this._onCodexDataReceived(data);
            } catch (e: any) {
                this._setCodexError(`parse: ${e.message}`);
            }
        });
    }

    _readAuth(): CodemCore.AuthData {
        return this._readJsonFile(AUTH_PATH);
    }

    _readJsonFile(path: string): any {
        const file = Gio.File.new_for_path(path);
        const [ok, contents] = file.load_contents(null);
        if (!ok) throw new Error('cannot read file');
        const text = (typeof ByteArray !== 'undefined')
            ? ByteArray.toString(contents)
            : new TextDecoder().decode(contents);
        return JSON.parse(text);
    }

    _fetchClaudeUsage() {
        if (this._destroyed) return;

        const file = Gio.File.new_for_path(CLAUDE_CREDS_PATH);
        if (!file.query_exists(null)) {
            this._setClaudeUnavailable('Claude: not logged in');
            return;
        }

        let oauth: any;
        try {
            const creds = this._readJsonFile(CLAUDE_CREDS_PATH);
            oauth = creds && creds.claudeAiOauth;
        } catch (e: any) {
            this._setClaudeUnavailable(`Claude: ${e.message}`);
            return;
        }

        const token = oauth && oauth.accessToken;
        if (!token) { this._setClaudeUnavailable('Claude: no access token'); return; }
        if (oauth.expiresAt && Date.now() > oauth.expiresAt) {
            if (!this._claude.data) this._setClaudeUnavailable('Claude: token expired (open Claude Code)');
            return;
        }

        const message = Soup.Message.new('GET', CodemCore.CLAUDE_USAGE_URL);
        message.request_headers.replace('Authorization',     `Bearer ${token}`);
        message.request_headers.replace('anthropic-beta',    'oauth-2025-04-20');
        message.request_headers.replace('anthropic-version', '2023-06-01');
        message.request_headers.replace('User-Agent',        'Codem/1.0');

        this._session.queue_message(message, (_sess: any, msg: any) => {
            if (this._destroyed) return;

            try {
                // The usage endpoint rate-limits hard; on a transient error keep
                // the last value if we have one instead of blanking the display.
                if (msg.status_code !== 200) {
                    if (!this._claude.data) this._setClaudeUnavailable(`Claude: HTTP ${msg.status_code}`);
                    else log(`[Codem] Claude usage HTTP ${msg.status_code} (keeping last value)`);
                    return;
                }
                const raw = JSON.parse(msg.response_body.data);
                const nowSeconds = Math.floor(Date.now() / 1000);
                const data = CodemCore.normalizeClaudeUsage(raw, nowSeconds, oauth.subscriptionType);
                if (!data) {
                    if (!this._claude.data) this._setClaudeUnavailable('Claude: unexpected response');
                    return;
                }
                this._claude.data = data;
                this._claude.available = true;
                this._onClaudeDataReceived(data);
            } catch (e: any) {
                if (!this._claude.data) this._setClaudeUnavailable(`Claude: ${e.message}`);
            }
        });
    }

    // -----------------------------------------------------------------------
    // UI update
    // -----------------------------------------------------------------------
    _onCodexDataReceived(data: UsageResponse) {
        const rl = data.rate_limit || ({} as CodemCore.RateLimit);
        const pw = rl.primary_window;
        const sw = rl.secondary_window;
        if (!pw || !sw) { this._setCodexError('unexpected response'); return; }

        const plan    = data.plan_type || 'unknown';
        const email   = data.email     || 'unknown';
        const allowed = data.rate_limit && data.rate_limit.allowed;
        this._codex.account.set_text(
            `Codex: ${email}  ·  ${plan.toUpperCase()}  ·  ${allowed ? 'Active' : 'Rate Limited'}`
        );

        this._applyProviderWindows(this._codex, pw, sw);
    }

    _onClaudeDataReceived(data: UsageResponse) {
        const rl = data.rate_limit || ({} as CodemCore.RateLimit);
        const pw = rl.primary_window;
        const sw = rl.secondary_window;
        if (!pw || !sw) { this._setClaudeUnavailable('Claude: unexpected response'); return; }

        const plan = data.plan_type || 'Claude Code';
        const allowed = data.rate_limit && data.rate_limit.allowed;
        this._claude.account.set_text(
            `Claude: ${plan}  ·  ${allowed ? 'Active' : 'Rate Limited'}`
        );

        this._applyProviderWindows(this._claude, pw, sw);
    }

    // Shared on-data path: refresh countdown anchors, pill, popup sections, and
    // the last-updated timestamp.
    _applyProviderWindows(p: Provider, pw: WindowData, sw: WindowData) {
        p.primaryLeft   = pw.reset_after_seconds;
        p.secondaryLeft = sw.reset_after_seconds;
        this._updatePill();
        this._updateSection(p.primarySection,   pw);
        this._updateSection(p.secondarySection, sw);
        this._setUpdatedNow();
    }

    _updatePill() {
        this._refreshPillLabels(this._codex,  !!this._codex.data);
        this._refreshPillLabels(this._claude, !!this._claude.data && this._claude.available);
        this._updatePillStyles();
    }

    _refreshPillLabels(p: Provider, show: boolean) {
        if (!show || !p.data) return;
        const rl = p.data.rate_limit;
        p.primary.set_text(this._formatPct(rl.primary_window.used_percent));
        p.secondary.set_text(this._formatPct(rl.secondary_window.used_percent));
    }

    _updatePillStyles() {
        const pct = this._maxKnownUsagePercent();
        const state = CodemCore.getColorState(pct);
        const pillBg = CodemCore.PILL_BG[state.label] || '#0d1117';

        this._pill.set_style(
            `background-color:${pillBg};${PILL_PADDING_STYLE}`
        );
        this._pillIcon.set_style(`color:${state.fg};`);
        this._providerSep.set_style(`color:${state.fg};opacity:0.35;margin:0 5px;font-size:10px;`);

        this._styleProviderPill(this._codex,  this._codex.data, this._codex.error);
        this._styleProviderPill(this._claude, this._claude.available ? this._claude.data : null, false);
    }

    _styleProviderPill(p: Provider, data: UsageResponse | null, error: boolean) {
        const color = error ? ERROR_COLOR : data ? CodemCore.getColorState(this._providerUsagePercent(data)).fg : MUTED_COLOR;
        const labelOpacity = data || error ? 1 : 0.65;

        p.brand.set_style(`color:${color};font-weight:bold;font-size:11px;`);
        p.primary.set_style(`color:${color};font-weight:bold;font-size:11px;opacity:${labelOpacity};`);
        p.secondary.set_style(`color:${color};font-weight:bold;font-size:11px;opacity:${data ? 0.7 : 0.5};`);
        p.sep.set_style(`color:${color};opacity:0.35;margin:0 2px;font-size:9px;`);
    }

    _providerUsagePercent(data: UsageResponse): number {
        const rl = data.rate_limit;
        return Math.max(rl.primary_window.used_percent, rl.secondary_window.used_percent);
    }

    _maxKnownUsagePercent(): number {
        let pct = this._codex.error ? 100 : 0;
        if (this._codex.data) pct = Math.max(pct, this._providerUsagePercent(this._codex.data));
        if (this._claude.data && this._claude.available) pct = Math.max(pct, this._providerUsagePercent(this._claude.data));
        return pct;
    }

    _formatPct(pct: number): string {
        return `${Math.round(pct)}%`;
    }

    _updateSection(section: SectionWidgets, win: WindowData) {
        const pct    = win.used_percent;
        const state  = CodemCore.getColorState(pct);

        section.pctLabel.set_text(this._formatPct(pct));
        section.pctLabel.set_style(`color:${state.bg};font-weight:bold;font-size:14px;`);

        section.pct = pct;
        this._applyBarFill(section);
        section.barFill.set_style(`background-color:${state.bg};border-radius:2px;height:4px;`);

        section.countdownLabel.set_text(`Resets in ${CodemCore.formatCountdown(win.reset_after_seconds)}`);
        section.resetAtLabel.set_text(`at ${CodemCore.formatResetTime(win.reset_at)}`);
    }

    _setSectionUnavailable(section: SectionWidgets, message: string) {
        section.pctLabel.set_text('---%');
        section.pctLabel.set_style(`color:${MUTED_COLOR};font-weight:bold;font-size:14px;`);
        section.pct = 0;
        section.barFill.set_width(2);
        section.barFill.set_style(`background-color:${MUTED_COLOR};border-radius:2px;height:4px;`);
        section.countdownLabel.set_text(message);
        section.resetAtLabel.set_text('—');
    }

    _setClaudeUnavailable(msg: string) {
        this._claude.available = false;
        this._claude.primary.set_text('—');
        this._claude.secondary.set_text('—');
        this._setSectionUnavailable(this._claude.primarySection, 'Waiting for status line');
        this._setSectionUnavailable(this._claude.secondarySection, 'Waiting for status line');
        if (this._claude.account) this._claude.account.set_text(msg);
        this._updatePillStyles();
    }

    _setCodexError(msg: string) {
        if (this._destroyed) return;

        this._codex.error = true;
        this._codex.primary.set_text('ERR');
        this._codex.secondary.set_text('—');
        this._setSectionUnavailable(this._codex.primarySection, 'Codex error');
        this._setSectionUnavailable(this._codex.secondarySection, 'Codex error');
        if (this._codex.account) this._codex.account.set_text(`Codex error: ${msg}`);
        if (this._headerTimestamp) this._headerTimestamp.set_text('Updated: —');
        this._updatePillStyles();
        log(`[Codem] Error: ${msg}`);
    }

    // -----------------------------------------------------------------------
    // Timers
    // -----------------------------------------------------------------------
    _startPolling() {
        this._pollTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            if (this._destroyed) return GLib.SOURCE_REMOVE;
            this._fetchUsage();
            return GLib.SOURCE_CONTINUE;
        });
        this._claudePollTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, CLAUDE_POLL_SECONDS, () => {
            if (this._destroyed) return GLib.SOURCE_REMOVE;
            this._fetchClaudeUsage();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _startTick() {
        this._tickTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
            if (this._destroyed) return GLib.SOURCE_REMOVE;
            for (const p of this._providers) {
                if (p.primaryLeft   > 0) p.primaryLeft--;
                if (p.secondaryLeft > 0) p.secondaryLeft--;
            }
            if (this.menu.isOpen) {
                if (this._codex.data && !this._codex.error) this._refreshProviderCountdowns(this._codex);
                if (this._claude.data && this._claude.available) this._refreshProviderCountdowns(this._claude);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _refreshProviderCountdowns(p: Provider) {
        p.primarySection.countdownLabel.set_text(
            `Resets in ${CodemCore.formatCountdown(p.primaryLeft)}`
        );
        p.secondarySection.countdownLabel.set_text(
            `Resets in ${CodemCore.formatCountdown(p.secondaryLeft)}`
        );
    }

    _stopTimers() {
        if (this._pollTimer)       { GLib.source_remove(this._pollTimer);       this._pollTimer       = null; }
        if (this._claudePollTimer) { GLib.source_remove(this._claudePollTimer); this._claudePollTimer = null; }
        if (this._tickTimer)       { GLib.source_remove(this._tickTimer);       this._tickTimer       = null; }
    }

    destroy() {
        this._destroyed = true;
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
