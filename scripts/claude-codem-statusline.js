#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const outputPath = path.join(os.homedir(), '.claude', 'codem-usage.json');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
    let data;
    try {
        data = JSON.parse(input);
    } catch (_err) {
        process.exit(0);
    }

    const rateLimits = data && data.rate_limits;
    if (!rateLimits) process.exit(0);

    const output = {
        updated_at: Math.floor(Date.now() / 1000),
        model: data.model && data.model.display_name ? { display_name: data.model.display_name } : undefined,
        rate_limits: {
            five_hour: rateLimits.five_hour,
            seven_day: rateLimits.seven_day,
        },
    };

    try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(output), { mode: 0o600 });
    } catch (_err) {
        process.exit(0);
    }
});
