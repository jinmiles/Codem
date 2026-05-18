import AppKit
import Foundation

private let usageURL = URL(string: "https://chatgpt.com/backend-api/wham/usage")!
private let pollSeconds: TimeInterval = 60
private let tickSeconds: TimeInterval = 1

private struct AuthData: Decodable {
    struct Tokens: Decodable {
        let accessToken: String?

        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
        }
    }

    let tokens: Tokens?
}

private struct UsageResponse: Decodable {
    struct RateLimit: Decodable {
        let allowed: Bool?
        let primaryWindow: WindowData
        let secondaryWindow: WindowData

        enum CodingKeys: String, CodingKey {
            case allowed
            case primaryWindow = "primary_window"
            case secondaryWindow = "secondary_window"
        }
    }

    struct WindowData: Decodable {
        let usedPercent: Int
        let resetAfterSeconds: Int
        let resetAt: TimeInterval

        enum CodingKeys: String, CodingKey {
            case usedPercent = "used_percent"
            case resetAfterSeconds = "reset_after_seconds"
            case resetAt = "reset_at"
        }
    }

    let email: String?
    let planType: String?
    let rateLimit: RateLimit

    enum CodingKeys: String, CodingKey {
        case email
        case planType = "plan_type"
        case rateLimit = "rate_limit"
    }
}

private enum UsageState {
    case ok
    case warning
    case critical
    case depleted

    init(percent: Int) {
        if percent < 60 {
            self = .ok
        } else if percent < 80 {
            self = .warning
        } else if percent < 95 {
            self = .critical
        } else {
            self = .depleted
        }
    }
}

private final class CodemMacApp: NSObject, NSApplicationDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let menu = NSMenu()
    private let primaryItem = NSMenuItem(title: "5H LIMIT: --", action: nil, keyEquivalent: "")
    private let secondaryItem = NSMenuItem(title: "WEEKLY LIMIT: --", action: nil, keyEquivalent: "")
    private let accountItem = NSMenuItem(title: "Loading...", action: nil, keyEquivalent: "")
    private let updatedItem = NSMenuItem(title: "Updated: --", action: nil, keyEquivalent: "")
    private var pollTimer: Timer?
    private var tickTimer: Timer?
    private var primaryLeft = 0
    private var secondaryLeft = 0
    private var latestUsage: UsageResponse?
    private var inFlightTask: URLSessionDataTask?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureMenu()
        refresh()
        startTimers()
    }

    func applicationWillTerminate(_ notification: Notification) {
        pollTimer?.invalidate()
        tickTimer?.invalidate()
        inFlightTask?.cancel()
    }

    private func configureMenu() {
        statusItem.button?.title = "Codem --"
        menu.addItem(primaryItem)
        menu.addItem(secondaryItem)
        menu.addItem(.separator())
        menu.addItem(accountItem)
        menu.addItem(updatedItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Refresh", action: #selector(refresh), keyEquivalent: "r"))
        menu.addItem(NSMenuItem(title: "Quit Codem", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        statusItem.menu = menu
    }

    private func startTimers() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: pollSeconds, repeats: true) { [weak self] _ in
            self?.refresh()
        }
        tickTimer = Timer.scheduledTimer(withTimeInterval: tickSeconds, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    @objc private func refresh() {
        guard let token = readAccessToken() else {
            showError("access_token not found")
            return
        }

        inFlightTask?.cancel()
        var request = URLRequest(url: usageURL)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Codem/1.0 macOS", forHTTPHeaderField: "User-Agent")

        inFlightTask = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }

            if let error {
                let nsError = error as NSError
                if nsError.code != NSURLErrorCancelled {
                    DispatchQueue.main.async { self.showError(error.localizedDescription) }
                }
                return
            }

            guard
                let http = response as? HTTPURLResponse,
                http.statusCode == 200,
                let data
            else {
                DispatchQueue.main.async { self.showError("request failed") }
                return
            }

            do {
                let usage = try JSONDecoder().decode(UsageResponse.self, from: data)
                DispatchQueue.main.async { self.applyUsage(usage) }
            } catch {
                DispatchQueue.main.async { self.showError("parse: \(error.localizedDescription)") }
            }
        }
        inFlightTask?.resume()
    }

    private func readAccessToken() -> String? {
        let authURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex/auth.json")

        guard
            let data = try? Data(contentsOf: authURL),
            let auth = try? JSONDecoder().decode(AuthData.self, from: data)
        else {
            return nil
        }
        return auth.tokens?.accessToken
    }

    private func applyUsage(_ usage: UsageResponse) {
        latestUsage = usage
        primaryLeft = usage.rateLimit.primaryWindow.resetAfterSeconds
        secondaryLeft = usage.rateLimit.secondaryWindow.resetAfterSeconds
        updateMenu()
    }

    private func tick() {
        guard latestUsage != nil else { return }
        if primaryLeft > 0 { primaryLeft -= 1 }
        if secondaryLeft > 0 { secondaryLeft -= 1 }
        updateMenu()
    }

    private func updateMenu() {
        guard let usage = latestUsage else { return }
        let primary = usage.rateLimit.primaryWindow
        let secondary = usage.rateLimit.secondaryWindow
        let maxPercent = max(primary.usedPercent, secondary.usedPercent)
        let titlePrefix = titlePrefix(for: UsageState(percent: maxPercent))

        statusItem.button?.title = "\(titlePrefix) \(primary.usedPercent)% · \(secondary.usedPercent)%"
        primaryItem.title = "5H LIMIT: \(primary.usedPercent)% · resets in \(formatCountdown(primaryLeft))"
        secondaryItem.title = "WEEKLY LIMIT: \(secondary.usedPercent)% · resets in \(formatCountdown(secondaryLeft))"
        accountItem.title = "\(usage.email ?? "unknown") · \((usage.planType ?? "unknown").uppercased()) · \(usage.rateLimit.allowed == false ? "Rate Limited" : "Active")"
        updatedItem.title = "Updated: \(Self.clockFormatter.string(from: Date()))"
    }

    private func titlePrefix(for state: UsageState) -> String {
        switch state {
        case .ok: return "Codem"
        case .warning: return "Codem!"
        case .critical: return "Codem!!"
        case .depleted: return "Codem!!!"
        }
    }

    private func showError(_ message: String) {
        latestUsage = nil
        statusItem.button?.title = "Codem ERR"
        primaryItem.title = "5H LIMIT: --"
        secondaryItem.title = "WEEKLY LIMIT: --"
        accountItem.title = "Error: \(message)"
        updatedItem.title = "Updated: --"
    }

    private func formatCountdown(_ seconds: Int) -> String {
        if seconds <= 0 { return "resetting soon" }
        let days = seconds / 86400
        let hours = (seconds % 86400) / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        if days > 0 { return "\(days)d \(hours)h \(minutes)m" }
        if hours > 0 { return "\(hours)h \(minutes)m" }
        if minutes > 0 { return "\(minutes)m \(secs)s" }
        return "\(secs)s"
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private static let clockFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()
}

let app = NSApplication.shared
let delegate = CodemMacApp()
app.delegate = delegate
app.run()
