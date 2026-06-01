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

    export function normalizeClaudeStatus(value: ClaudeStatusData, nowSeconds: number): UsageResponse | null {
        const rateLimits = value && value.rate_limits;
        const fiveHour = rateLimits && rateLimits.five_hour;
        const sevenDay = rateLimits && rateLimits.seven_day;

        if (!isClaudeStatusWindow(fiveHour) || !isClaudeStatusWindow(sevenDay)) return null;

        const primary = claudeWindowToUsageWindow(fiveHour, FIVE_HOUR_WINDOW_SECONDS, nowSeconds);
        const secondary = claudeWindowToUsageWindow(sevenDay, WEEKLY_WINDOW_SECONDS, nowSeconds);

        return {
            email: 'Claude',
            plan_type: (value.model && value.model.display_name) || 'Claude Code',
            rate_limit: {
                allowed: primary.used_percent < 100 && secondary.used_percent < 100,
                primary_window: primary,
                secondary_window: secondary,
            },
        };
    }

    function isClaudeStatusWindow(value: any): value is ClaudeStatusWindow {
        return !!(
            value &&
            typeof value.used_percentage === 'number' &&
            typeof value.resets_at === 'number'
        );
    }

    function claudeWindowToUsageWindow(win: ClaudeStatusWindow, limitSeconds: number, nowSeconds: number): WindowData {
        const resetAt = win.resets_at || nowSeconds;
        return {
            used_percent: win.used_percentage || 0,
            limit_window_seconds: limitSeconds,
            reset_after_seconds: Math.max(0, resetAt - nowSeconds),
            reset_at: resetAt,
        };
    }
}
