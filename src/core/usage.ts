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
}
