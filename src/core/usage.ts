namespace CodemCore {
    export function extractAccessToken(authData: AuthData): string | null {
        return (authData && authData.tokens && authData.tokens.access_token) || null;
    }

    export function isUsageResponse(value: any): value is UsageResponse {
        const rateLimit = value && value.rate_limit;
        return !!(
            rateLimit &&
            rateLimit.primary_window &&
            rateLimit.secondary_window &&
            typeof rateLimit.primary_window.used_percent === 'number' &&
            typeof rateLimit.secondary_window.used_percent === 'number'
        );
    }

    export function normalizeClaudeUsage(value: ClaudeUsageResponse, nowSeconds: number, planType?: string): UsageResponse | null {
        const fiveHour = value && value.five_hour;
        const sevenDay = value && value.seven_day;

        if (!isClaudeUsageWindow(fiveHour) || !isClaudeUsageWindow(sevenDay)) return null;

        const primary = claudeUsageToWindow(fiveHour, FIVE_HOUR_WINDOW_SECONDS, nowSeconds);
        const secondary = claudeUsageToWindow(sevenDay, WEEKLY_WINDOW_SECONDS, nowSeconds);

        return {
            email: 'Claude',
            plan_type: claudePlanLabel(planType),
            rate_limit: {
                allowed: primary.used_percent < 100 && secondary.used_percent < 100,
                primary_window: primary,
                secondary_window: secondary,
            },
        };
    }

    function isClaudeUsageWindow(value: any): value is ClaudeUsageWindow {
        return !!(value && typeof value.utilization === 'number');
    }

    function claudeUsageToWindow(win: ClaudeUsageWindow, limitSeconds: number, nowSeconds: number): WindowData {
        const resetAt = parseResetAt(win.resets_at, nowSeconds);
        return {
            used_percent: win.utilization || 0,
            limit_window_seconds: limitSeconds,
            reset_after_seconds: Math.max(0, resetAt - nowSeconds),
            reset_at: resetAt,
        };
    }

    // The usage endpoint returns ISO 8601 reset times; convert to unix seconds.
    function parseResetAt(value: string | null | undefined, nowSeconds: number): number {
        if (!value) return nowSeconds;
        const ms = Date.parse(value);
        return Number.isNaN(ms) ? nowSeconds : Math.floor(ms / 1000);
    }

    function claudePlanLabel(planType?: string): string {
        if (!planType) return 'Claude Code';
        return planType.charAt(0).toUpperCase() + planType.slice(1);
    }
}
