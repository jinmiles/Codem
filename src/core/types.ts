'use strict';

namespace CodemCore {
    export interface WindowData {
        used_percent: number;
        limit_window_seconds: number;
        reset_after_seconds: number;
        reset_at: number;
    }

    export interface RateLimit {
        allowed: boolean;
        primary_window: WindowData;
        secondary_window: WindowData;
    }

    export interface UsageResponse {
        email: string;
        plan_type: string;
        rate_limit: RateLimit;
    }

    export interface AuthData {
        tokens?: {
            access_token?: string;
        };
    }

    // Shape returned by https://api.anthropic.com/api/oauth/usage
    export interface ClaudeUsageWindow {
        utilization?: number;     // 0-100 percentage
        resets_at?: string | null; // ISO 8601 timestamp
    }

    export interface ClaudeUsageResponse {
        five_hour?: ClaudeUsageWindow;
        seven_day?: ClaudeUsageWindow;
    }

    export interface ColorState {
        threshold: number;
        bg: string;
        fg: string;
        label: string;
    }
}
