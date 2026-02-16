import AppKit
import Foundation

// MARK: - Data Types

struct Session: Decodable {
    let session_id: String
    let cwd: String
    let tty: String?
    let status: String
    let created_at: String
    let updated_at: String
    let lastMessage: String?
    let taskTitle: String?
}

struct StoreData: Decodable {
    let sessions: [String: Session]
    let updated_at: String
}

// MARK: - TTY Check

func isTtyAlive(_ tty: String?) -> Bool {
    guard let tty = tty else { return true }
    var statBuf = stat()
    return stat(tty, &statBuf) == 0
}

// MARK: - Menu Bar App

class MenuBarController: NSObject {
    private var statusItem: NSStatusItem!
    private var fileDescriptor: Int32 = -1
    private var dirDescriptor: Int32 = -1
    private var fileSource: DispatchSourceFileSystemObject?
    private var dirSource: DispatchSourceFileSystemObject?
    private var pollTimer: Timer?
    private let sessionsPath: String
    private let ccmPath: String

    override init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        sessionsPath = "\(home)/.claude-monitor/sessions.json"

        // Find ccm binary: check if running from npm package, otherwise use npx
        let npmBinCcm = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
        if !npmBinCcm.isEmpty && FileManager.default.fileExists(atPath: npmBinCcm) {
            ccmPath = npmBinCcm
        } else {
            ccmPath = "ccm"
        }

        super.init()
    }

    func setup() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "CCM"
        statusItem.button?.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)

        buildMenu(sessions: [])
        startWatching()
        refreshFromFile()

        // Poll every 60s as fallback
        pollTimer = Timer.scheduledTimer(withTimeInterval: 60.0, repeats: true) { [weak self] _ in
            self?.refreshFromFile()
        }
    }

    // MARK: - File Watching

    private func startWatching() {
        let dir = (sessionsPath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

        if !FileManager.default.fileExists(atPath: sessionsPath) {
            FileManager.default.createFile(atPath: sessionsPath, contents: "{}".data(using: .utf8))
        }

        // Watch the file itself for in-place content changes
        watchFile()

        // Watch the directory for file creation/deletion (handles file recreation)
        let dirFd = open(dir, O_EVTONLY)
        guard dirFd >= 0 else { return }
        dirDescriptor = dirFd

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: dirFd,
            eventMask: .write,
            queue: .main
        )
        source.setEventHandler { [weak self] in
            // File may have been recreated; re-open file watcher
            self?.watchFile()
            self?.refreshFromFile()
        }
        source.setCancelHandler {
            close(dirFd)
        }
        source.resume()
        dirSource = source
    }

    private func watchFile() {
        // Cancel previous file watcher if any
        fileSource?.cancel()
        fileSource = nil
        if fileDescriptor >= 0 {
            close(fileDescriptor)
            fileDescriptor = -1
        }

        let fd = open(sessionsPath, O_EVTONLY)
        guard fd >= 0 else { return }
        fileDescriptor = fd

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .delete, .rename],
            queue: .main
        )
        source.setEventHandler { [weak self] in
            guard let self = self else { return }
            let flags = source.data
            self.refreshFromFile()

            // If file was deleted or renamed, re-open watcher
            if flags.contains(.delete) || flags.contains(.rename) {
                self.watchFile()
            }
        }
        source.setCancelHandler {
            close(fd)
        }
        source.resume()
        fileSource = source
    }

    private func refreshFromFile() {
        let sessions = loadSessions()
        updateTitle(sessions: sessions)
        buildMenu(sessions: sessions)
    }

    // MARK: - Session Loading

    private func loadSessions() -> [Session] {
        guard let data = FileManager.default.contents(atPath: sessionsPath) else {
            return []
        }
        guard let store = try? JSONDecoder().decode(StoreData.self, from: data) else {
            return []
        }
        return store.sessions.values
            .filter { isTtyAlive($0.tty) }
            .sorted { $0.created_at < $1.created_at }
    }

    // MARK: - Title Update

    private func updateTitle(sessions: [Session]) {
        guard !sessions.isEmpty else {
            statusItem.button?.title = "CCM"
            return
        }

        var running = 0
        var waiting = 0
        var stopped = 0

        for s in sessions {
            switch s.status {
            case "running": running += 1
            case "waiting_input": waiting += 1
            case "stopped": stopped += 1
            default: break
            }
        }

        var parts: [String] = []
        if running > 0 { parts.append("● \(running)") }
        if waiting > 0 { parts.append("◐ \(waiting)") }
        if stopped > 0 { parts.append("✓ \(stopped)") }

        statusItem.button?.title = parts.isEmpty ? "CCM" : parts.joined(separator: "  ")
    }

    // MARK: - Menu Building

    private func buildMenu(sessions: [Session]) {
        let menu = NSMenu()

        // Open Dashboard action
        let dashboardItem = NSMenuItem(
            title: "Open Dashboard...",
            action: #selector(openDashboard),
            keyEquivalent: "d"
        )
        dashboardItem.target = self
        menu.addItem(dashboardItem)
        menu.addItem(NSMenuItem.separator())

        if sessions.isEmpty {
            let item = NSMenuItem(title: "No active sessions", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        } else {
            for session in sessions {
                let symbol: String
                switch session.status {
                case "running": symbol = "●"
                case "waiting_input": symbol = "◐"
                case "stopped": symbol = "✓"
                default: symbol = "?"
                }

                let shortCwd = shortenPath(session.cwd)
                let title: String
                if let taskTitle = session.taskTitle, !taskTitle.isEmpty {
                    let truncated = taskTitle.count > 40
                        ? String(taskTitle.prefix(39)) + "…"
                        : taskTitle
                    title = "\(symbol) \(truncated) → \(shortCwd)"
                } else {
                    title = "\(symbol) \(shortCwd)"
                }
                let item = NSMenuItem(
                    title: title,
                    action: #selector(sessionClicked(_:)),
                    keyEquivalent: ""
                )
                item.target = self
                item.representedObject = session.tty
                menu.addItem(item)
            }
        }

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    private func shortenPath(_ path: String) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        if path.hasPrefix(home) {
            return "~" + path.dropFirst(home.count)
        }
        return path
    }

    // MARK: - Actions

    @objc private func openDashboard() {
        let hasITerm = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.googlecode.iterm2") != nil

        if hasITerm {
            let script = """
            tell application "iTerm2"
                activate
                set newWindow to (create window with default profile command "\(ccmPath) watch")
            end tell
            """
            let appleScript = NSAppleScript(source: script)
            appleScript?.executeAndReturnError(nil)
        } else {
            let script = """
            tell application "Terminal"
                activate
                do script "\(ccmPath) watch"
            end tell
            """
            let appleScript = NSAppleScript(source: script)
            appleScript?.executeAndReturnError(nil)
        }
    }

    @objc private func sessionClicked(_ sender: NSMenuItem) {
        guard let tty = sender.representedObject as? String else { return }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [ccmPath, "focus", tty]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
    }

    @objc private func quitApp() {
        // Clean up
        fileSource?.cancel()
        dirSource?.cancel()
        pollTimer?.invalidate()
        NSApplication.shared.terminate(nil)
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    let controller = MenuBarController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        controller.setup()
    }
}

// MARK: - Main

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let delegate = AppDelegate()
app.delegate = delegate

app.run()
