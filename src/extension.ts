/**
 * Codem - Codex Usage Monitor
 * GNOME Shell Extension (TypeScript source, compiled to ES2018)
 *
 * Reads ~/.codex/auth.json, polls the Codex usage API every 60 s, and reads
 * Claude Code rate-limit data from ~/.claude/codem-usage.json.
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
    barFill: any;
    countdownLabel: any;
    resetAtLabel: any;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AUTH_PATH          = GLib.get_home_dir() + '/.codex/auth.json';
const CLAUDE_USAGE_PATH  = GLib.get_home_dir() + '/.claude/codem-usage.json';
const POLL_SECONDS       = 60;
const TICK_SECONDS       = 1;
const BAR_WIDTH_PX       = 266;  // must match .codem-bar-outer width in CSS
const MUTED_COLOR        = '#6e7681';
const ERROR_COLOR        = '#f87171';
const PILL_PADDING_STYLE = 'border-radius:100px;padding:1px 8px 1px 6px;';

// ---------------------------------------------------------------------------
// Indicator
// ---------------------------------------------------------------------------
const CodemIndicator = GObject.registerClass(
class CodemIndicator extends PanelMenu.Button {

    // class-level field declarations for TypeScript
    _codexData: UsageResponse | null        = null;
    _claudeData: UsageResponse | null       = null;
    _codexError: boolean                    = false;
    _claudeAvailable: boolean               = false;
    _pollTimer: number | null               = null;
    _tickTimer: number | null               = null;
    _session: any                           = null;
    _codexPrimaryLeft: number               = 0;
    _codexSecondaryLeft: number             = 0;
    _claudePrimaryLeft: number              = 0;
    _claudeSecondaryLeft: number            = 0;
    _codexPrimarySection: SectionWidgets    = null as any;
    _codexSecondarySection: SectionWidgets  = null as any;
    _claudePrimarySection: SectionWidgets   = null as any;
    _claudeSecondarySection: SectionWidgets = null as any;
    _codexAccountSub: any                   = null;
    _claudeAccountSub: any                  = null;
    _headerTimestamp: any                   = null;
    _labelCodexBrand: any                   = null;
    _labelCodexPrimary: any                 = null;
    _labelCodexSecondary: any               = null;
    _labelClaudeBrand: any                  = null;
    _labelClaudePrimary: any                = null;
    _labelClaudeSecondary: any              = null;
    _pill: any                              = null;
    _pillIcon: any                          = null;
    _codexPillSep: any                      = null;
    _claudePillSep: any                     = null;
    _providerSep: any                       = null;
    _destroyed: boolean                     = false;

    _init() {
        super._init(0.0, 'Codem', false);

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

        this._labelCodexBrand = new St.Label({
            text: 'Codex',
            style_class: 'codem-brand',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelCodexBrand);

        // 5h percentage
        this._labelCodexPrimary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelCodexPrimary);

        // Separator
        this._codexPillSep = new St.Label({
            text: '·',
            style_class: 'codem-sep',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._codexPillSep);

        // Weekly percentage
        this._labelCodexSecondary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelCodexSecondary);

        this._providerSep = new St.Label({
            text: '•',
            style_class: 'codem-provider-sep',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._providerSep);

        this._labelClaudeBrand = new St.Label({
            text: 'Claude',
            style_class: 'codem-brand',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelClaudeBrand);

        this._labelClaudePrimary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelClaudePrimary);

        this._claudePillSep = new St.Label({
            text: '·',
            style_class: 'codem-sep',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._claudePillSep);

        this._labelClaudeSecondary = new St.Label({
            text: '—',
            style_class: 'codem-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pill.add_child(this._labelClaudeSecondary);
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
        this._codexPrimarySection = this._makeSectionItem('CODEX 5H LIMIT');
        this.menu.addMenuItem(this._codexPrimarySection.item);

        this._codexSecondarySection = this._makeSectionItem('CODEX WEEKLY LIMIT');
        this.menu.addMenuItem(this._codexSecondarySection.item);

        this._claudePrimarySection = this._makeSectionItem('CLAUDE 5H LIMIT');
        this.menu.addMenuItem(this._claudePrimarySection.item);

        this._claudeSecondarySection = this._makeSectionItem('CLAUDE WEEKLY LIMIT');
        this.menu.addMenuItem(this._claudeSecondarySection.item);

        // ── Account info at bottom ──
        const accountItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this._codexAccountSub = new St.Label({
            text: 'Codex: loading...',
            style_class: 'codem-account-info',
        });
        accountItem.add_child(this._codexAccountSub);
        this.menu.addMenuItem(accountItem);

        const claudeAccountItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this._claudeAccountSub = new St.Label({
            text: `Claude: waiting for ${CLAUDE_USAGE_PATH}`,
            style_class: 'codem-account-info',
        });
        claudeAccountItem.add_child(this._claudeAccountSub);
        this.menu.addMenuItem(claudeAccountItem);
    }

    _refreshUsage(showLoading: boolean) {
        if (showLoading) this._setCodexLoading();
        this._readClaudeUsage();
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

    _setCodexLoading() {
        this._codexError = false;
        this._labelCodexPrimary.set_text('—');
        this._labelCodexSecondary.set_text('—');
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
                this._codexData = data;
                this._codexError = false;
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

    _readClaudeUsage() {
        if (this._destroyed) return;

        const file = Gio.File.new_for_path(CLAUDE_USAGE_PATH);
        if (!file.query_exists(null)) {
            this._setClaudeUnavailable(`Claude: waiting for ${CLAUDE_USAGE_PATH}`);
            return;
        }

        try {
            const rawData = this._readJsonFile(CLAUDE_USAGE_PATH) as CodemCore.ClaudeStatusData;
            const nowSeconds = Math.floor(Date.now() / 1000);
            const data = CodemCore.normalizeClaudeStatus(rawData, nowSeconds);
            if (!data) {
                this._setClaudeUnavailable('Claude: no rate_limits yet');
                return;
            }
            this._claudeData = data;
            this._claudeAvailable = true;
            this._onClaudeDataReceived(data);
        } catch (e: any) {
            this._setClaudeUnavailable(`Claude: ${e.message}`);
        }
    }

    // -----------------------------------------------------------------------
    // UI update
    // -----------------------------------------------------------------------
    _onCodexDataReceived(data: UsageResponse) {
        const rl = data.rate_limit || ({} as CodemCore.RateLimit);
        const pw = rl.primary_window;
        const sw = rl.secondary_window;
        if (!pw || !sw) { this._setCodexError('unexpected response'); return; }

        this._codexPrimaryLeft   = pw.reset_after_seconds;
        this._codexSecondaryLeft = sw.reset_after_seconds;
        this._updatePill();
        this._updateCodexPopup(data, pw, sw);
        this._setUpdatedNow();
    }

    _onClaudeDataReceived(data: UsageResponse) {
        const rl = data.rate_limit || ({} as CodemCore.RateLimit);
        const pw = rl.primary_window;
        const sw = rl.secondary_window;
        if (!pw || !sw) { this._setClaudeUnavailable('Claude: unexpected response'); return; }

        this._claudePrimaryLeft   = pw.reset_after_seconds;
        this._claudeSecondaryLeft = sw.reset_after_seconds;
        this._updatePill();
        this._updateClaudePopup(data, pw, sw);
        this._setUpdatedNow();
    }

    _updatePill() {
        if (this._codexData) {
            const rl = this._codexData.rate_limit;
            this._labelCodexPrimary.set_text(this._formatPct(rl.primary_window.used_percent));
            this._labelCodexSecondary.set_text(this._formatPct(rl.secondary_window.used_percent));
        }

        if (this._claudeData && this._claudeAvailable) {
            const rl = this._claudeData.rate_limit;
            this._labelClaudePrimary.set_text(this._formatPct(rl.primary_window.used_percent));
            this._labelClaudeSecondary.set_text(this._formatPct(rl.secondary_window.used_percent));
        }

        this._updatePillStyles();
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

        this._styleProviderPill(
            this._labelCodexBrand,
            this._labelCodexPrimary,
            this._labelCodexSecondary,
            this._codexPillSep,
            this._codexData,
            this._codexError
        );
        this._styleProviderPill(
            this._labelClaudeBrand,
            this._labelClaudePrimary,
            this._labelClaudeSecondary,
            this._claudePillSep,
            this._claudeAvailable ? this._claudeData : null,
            false
        );
    }

    _styleProviderPill(brand: any, primary: any, secondary: any, sep: any, data: UsageResponse | null, error: boolean) {
        const color = error ? ERROR_COLOR : data ? CodemCore.getColorState(this._providerUsagePercent(data)).fg : MUTED_COLOR;
        const labelOpacity = data || error ? 1 : 0.65;

        brand.set_style(`color:${color};font-weight:bold;font-size:11px;`);
        primary.set_style(`color:${color};font-weight:bold;font-size:11px;opacity:${labelOpacity};`);
        secondary.set_style(`color:${color};font-weight:bold;font-size:11px;opacity:${data ? 0.7 : 0.5};`);
        sep.set_style(`color:${color};opacity:0.35;margin:0 2px;font-size:9px;`);
    }

    _providerUsagePercent(data: UsageResponse): number {
        const rl = data.rate_limit;
        return Math.max(rl.primary_window.used_percent, rl.secondary_window.used_percent);
    }

    _maxKnownUsagePercent(): number {
        let pct = this._codexError ? 100 : 0;
        if (this._codexData) pct = Math.max(pct, this._providerUsagePercent(this._codexData));
        if (this._claudeData && this._claudeAvailable) pct = Math.max(pct, this._providerUsagePercent(this._claudeData));
        return pct;
    }

    _formatPct(pct: number): string {
        return `${Math.round(pct)}%`;
    }

    _updateCodexPopup(data: UsageResponse, pw: WindowData, sw: WindowData) {
        const plan    = data.plan_type || 'unknown';
        const email   = data.email     || 'unknown';
        const allowed = data.rate_limit && data.rate_limit.allowed;

        this._updateSection(this._codexPrimarySection,   pw);
        this._updateSection(this._codexSecondarySection, sw);

        this._codexAccountSub.set_text(
            `Codex: ${email}  ·  ${plan.toUpperCase()}  ·  ${allowed ? 'Active' : 'Rate Limited'}`
        );
    }

    _updateClaudePopup(data: UsageResponse, pw: WindowData, sw: WindowData) {
        const plan = data.plan_type || 'Claude Code';
        const allowed = data.rate_limit && data.rate_limit.allowed;

        this._updateSection(this._claudePrimarySection,   pw);
        this._updateSection(this._claudeSecondarySection, sw);

        this._claudeAccountSub.set_text(
            `Claude: ${plan}  ·  ${allowed ? 'Active' : 'Rate Limited'}`
        );
    }

    _updateSection(section: SectionWidgets, win: WindowData) {
        const pct    = win.used_percent;
        const state  = CodemCore.getColorState(pct);
        const fillPx = Math.max(2, Math.round((pct / 100) * BAR_WIDTH_PX));

        section.pctLabel.set_text(this._formatPct(pct));
        section.pctLabel.set_style(`color:${state.bg};font-weight:bold;font-size:14px;`);

        section.barFill.set_width(fillPx);
        section.barFill.set_style(`background-color:${state.bg};border-radius:2px;height:4px;`);

        section.countdownLabel.set_text(`Resets in ${CodemCore.formatCountdown(win.reset_after_seconds)}`);
        section.resetAtLabel.set_text(`at ${CodemCore.formatResetTime(win.reset_at)}`);
    }

    _setSectionUnavailable(section: SectionWidgets, message: string) {
        section.pctLabel.set_text('---%');
        section.pctLabel.set_style(`color:${MUTED_COLOR};font-weight:bold;font-size:14px;`);
        section.barFill.set_width(2);
        section.barFill.set_style(`background-color:${MUTED_COLOR};border-radius:2px;height:4px;`);
        section.countdownLabel.set_text(message);
        section.resetAtLabel.set_text('—');
    }

    _setClaudeUnavailable(msg: string) {
        this._claudeAvailable = false;
        this._labelClaudePrimary.set_text('—');
        this._labelClaudeSecondary.set_text('—');
        this._setSectionUnavailable(this._claudePrimarySection, 'Waiting for status line');
        this._setSectionUnavailable(this._claudeSecondarySection, 'Waiting for status line');
        if (this._claudeAccountSub) this._claudeAccountSub.set_text(msg);
        this._updatePillStyles();
    }

    _setCodexError(msg: string) {
        if (this._destroyed) return;

        this._codexError = true;
        this._labelCodexPrimary.set_text('ERR');
        this._labelCodexSecondary.set_text('—');
        this._setSectionUnavailable(this._codexPrimarySection, 'Codex error');
        this._setSectionUnavailable(this._codexSecondarySection, 'Codex error');
        if (this._codexAccountSub) this._codexAccountSub.set_text(`Codex error: ${msg}`);
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
            this._refreshUsage(false);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _startTick() {
        this._tickTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
            if (this._destroyed) return GLib.SOURCE_REMOVE;
            if (this._codexPrimaryLeft   > 0) this._codexPrimaryLeft--;
            if (this._codexSecondaryLeft > 0) this._codexSecondaryLeft--;
            if (this._claudePrimaryLeft   > 0) this._claudePrimaryLeft--;
            if (this._claudeSecondaryLeft > 0) this._claudeSecondaryLeft--;
            if (this.menu.isOpen) {
                if (this._codexData && !this._codexError) {
                    this._codexPrimarySection.countdownLabel.set_text(
                        `Resets in ${CodemCore.formatCountdown(this._codexPrimaryLeft)}`
                    );
                    this._codexSecondarySection.countdownLabel.set_text(
                        `Resets in ${CodemCore.formatCountdown(this._codexSecondaryLeft)}`
                    );
                }
                if (this._claudeData && this._claudeAvailable) {
                    this._claudePrimarySection.countdownLabel.set_text(
                        `Resets in ${CodemCore.formatCountdown(this._claudePrimaryLeft)}`
                    );
                    this._claudeSecondarySection.countdownLabel.set_text(
                        `Resets in ${CodemCore.formatCountdown(this._claudeSecondaryLeft)}`
                    );
                }
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimers() {
        if (this._pollTimer)  { GLib.source_remove(this._pollTimer);  this._pollTimer  = null; }
        if (this._tickTimer)  { GLib.source_remove(this._tickTimer);  this._tickTimer  = null; }
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
