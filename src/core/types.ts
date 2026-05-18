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

    export interface ColorState {
        threshold: number;
        bg: string;
        fg: string;
        label: string;
    }
}
