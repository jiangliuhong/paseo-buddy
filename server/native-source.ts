/** Reviewable AppKit source embedded in the plugin bundle; no runtime source download. */
export const nativeSource = String.raw`
import AppKit
import Darwin
import UserNotifications

struct Agent: Decodable, Equatable {
    let id: String
    let projectName: String
    let workspaceName: String
    let name: String
    let status: String
    let startedAt: String?
    let conversationUrl: String?
    let attentionTimestamp: String?
}
struct Snapshot: Decodable, Equatable {
    let connection: String
    let agents: [Agent]
}
struct Appearance: Decodable {
    let opacity: Double
    let scale: Double
    let showIcon: Bool?
    let showText: Bool?
    let customText: String?
    let listMinHeight: Double?
    let listMaxHeight: Double?
    var minimumListHeight: Double { listMinHeight ?? 140 }
    var maximumListHeight: Double { listMaxHeight ?? 360 }
    var iconVisible: Bool { showIcon ?? true }
    var textVisible: Bool { showText ?? true }
    var textValue: String { (customText ?? "Buddy").trimmingCharacters(in: .whitespacesAndNewlines) }
    var isValid: Bool {
        opacity.isFinite && scale.isFinite && (0.3...1).contains(opacity) && (0.75...1.5).contains(scale)
            && minimumListHeight.isFinite && maximumListHeight.isFinite
            && (100...600).contains(minimumListHeight) && (100...600).contains(maximumListHeight)
            && minimumListHeight.rounded() == minimumListHeight && maximumListHeight.rounded() == maximumListHeight
            && minimumListHeight <= maximumListHeight
            && textValue.utf16.count <= 32 && textValue.rangeOfCharacter(from: .controlCharacters.union(.newlines)) == nil
    }
}

func fittedListHeight(contentHeight: CGFloat, minimum: CGFloat, maximum: CGFloat, padding: CGFloat) -> CGFloat {
    min(maximum, max(minimum, ceil(max(0, contentHeight) + padding)))
}

struct PillContentLayout {
    let width: CGFloat
    let iconX: CGFloat?
    let textX: CGFloat?
    let textWidth: CGFloat
    let runningX: CGFloat?
    let runningWidth: CGFloat
    let unreadX: CGFloat?
    let unreadWidth: CGFloat
    let toggleDividerX: CGFloat?
    let controlX: CGFloat
    let controlWidth: CGFloat
    let chevronX: CGFloat
}

// Positions contain only visible content; hidden labels/badges reserve no slots or gaps.
func pillContentLayout(showIcon: Bool, showText: Bool, textWidth: CGFloat, running: String, unread: String) -> PillContentLayout {
    var x: CGFloat = 12
    var hasContent = false
    func append(_ width: CGFloat, gap: CGFloat) -> CGFloat {
        if hasContent { x += gap }
        let start = x; x += width; hasContent = true; return start
    }
    let labelWidth = showText ? min(140, max(0, textWidth)) : 0
    let iconX = showIcon ? append(16, gap: 0) : nil
    let textX = labelWidth > 0 ? append(labelWidth, gap: 6) : nil
    func badgeWidth(_ value: String) -> CGFloat {
        value.isEmpty ? 0 : value.count >= 3 ? 26 : value.count == 2 ? 22 : 18
    }
    let controlX = hasContent ? x + 12 : 0
    let runningWidth = badgeWidth(running)
    let unreadWidth = badgeWidth(unread)
    let badgeGap: CGFloat = runningWidth > 0 && unreadWidth > 0 ? 3 : 0
    let controlWidth = max(44, runningWidth + badgeGap + unreadWidth + 8)
    let width = controlX + controlWidth
    let unreadX: CGFloat? = unread.isEmpty ? nil : width - 4 - unreadWidth
    let runningX: CGFloat? = running.isEmpty ? nil : width - 4 - unreadWidth - badgeGap - runningWidth
    return PillContentLayout(width: width, iconX: iconX, textX: textX, textWidth: labelWidth, runningX: runningX, runningWidth: runningWidth,
                             unreadX: unreadX, unreadWidth: unreadWidth, toggleDividerX: hasContent ? controlX : nil,
                             controlX: controlX, controlWidth: controlWidth, chevronX: controlX + (controlWidth - 14) / 2)
}
struct CompletionNotice: Decodable {
    let id: String
    let agentName: String
    let outcome: String
    var isValid: Bool {
        id.count == 64 && id.allSatisfy { "0123456789abcdef".contains($0) }
            && agentName.count <= 200 && ["completed", "failed"].contains(outcome)
    }
}
struct NotificationMessage: Decodable { let notification: CompletionNotice }
struct MarkReadCommand: Encodable {
    let type = "mark_read"
    let requestId: String
    let agentId: String
    let attentionTimestamp: String?
}
struct ReadActionResult: Decodable { let requestId: String; let agentId: String; let success: Bool; let error: String? }
struct ActionResultMessage: Decodable { let actionResult: ReadActionResult }
struct PendingRead { let agentId: String; let attentionTimestamp: String?; let startedAt: Date }

// Match the installed official agent-deep-link parser; only explicit button presses open it.
func conversationURL(_ value: String?, agentId: String) -> URL? {
    guard let value = value, value.utf8.count <= 8192,
          let parts = URLComponents(string: value), parts.scheme == "paseo", parts.host == "h",
          parts.user == nil, parts.password == nil, parts.port == nil, parts.query == nil, parts.fragment == nil else { return nil }
    let segments = parts.percentEncodedPath.split(separator: "/").map(String.init)
    guard segments.count == 3, segments[1] == "agent",
          let server = segments[0].removingPercentEncoding, !server.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          segments[2].removingPercentEncoding == agentId else { return nil }
    return parts.url
}

class AgentActionButton: NSButton {
    var agentId = ""
    var actionKind = "open"
    var scale: CGFloat = 1
    var hovered = false
    var tracking: NSTrackingArea?
    var focusKey: String { "\(actionKind):\(agentId)" }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking = tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(area); tracking = area
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }
    override func resetCursorRects() { if isEnabled { addCursorRect(bounds, cursor: .pointingHand) } }
    override func draw(_ dirtyRect: NSRect) {
        if hovered && isEnabled {
            NSColor.controlAccentColor.withAlphaComponent(0.12).setFill()
            NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 6 * scale, yRadius: 6 * scale).fill()
        }
        super.draw(dirtyRect)
    }
}
final class ConversationButton: AgentActionButton {
    var destination: URL?
    @objc func openConversation() { if let destination = destination { NSWorkspace.shared.open(destination) } }
}
final class MarkReadButton: AgentActionButton {
    var pressed: (() -> Void)?
    @objc func markRead() { pressed?() }
}

func clampedPillAnchor(_ anchor: NSPoint, pillSize: NSSize, screen: NSRect) -> NSPoint {
    NSPoint(x: max(screen.minX, min(anchor.x, screen.maxX - pillSize.width)),
            y: max(screen.minY, min(anchor.y, screen.maxY - pillSize.height)))
}

struct OverlayLayout {
    let panel: NSRect
    let pill: NSRect
    let list: NSRect
}

// Use the full display, including the Dock area. The list chooses a separate side of the pill.
func overlayLayout(anchor: NSPoint, pillSize: NSSize, listSize: NSSize, gap: CGFloat, screen: NSRect, expanded: Bool) -> OverlayLayout {
    let anchor = clampedPillAnchor(anchor, pillSize: pillSize, screen: screen)
    let pill = NSRect(origin: anchor, size: pillSize)
    guard expanded else { return OverlayLayout(panel: pill, pill: NSRect(origin: .zero, size: pillSize), list: .zero) }
    let above = max(0, screen.maxY - pill.maxY - gap)
    let below = max(0, pill.minY - screen.minY - gap)
    let useAbove = above >= listSize.height || (below < listSize.height && above >= below)
    let size = NSSize(width: min(listSize.width, screen.width), height: min(listSize.height, useAbove ? above : below))
    let list = NSRect(x: max(screen.minX, min(pill.maxX - size.width, screen.maxX - size.width)),
                      y: useAbove ? pill.maxY + gap : pill.minY - gap - size.height, width: size.width, height: size.height)
    let panel = pill.union(list)
    return OverlayLayout(panel: panel, pill: pill.offsetBy(dx: -panel.minX, dy: -panel.minY), list: list.offsetBy(dx: -panel.minX, dy: -panel.minY))
}

final class ListSurface: NSVisualEffectView {
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); updateBorder() }
    func updateBorder() { layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.28).cgColor }
}

final class AgentCardView: NSView {
    var scale: CGFloat = 1
    override func draw(_ dirtyRect: NSRect) {
        let shape = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 12 * scale, yRadius: 12 * scale)
        NSColor.controlBackgroundColor.withAlphaComponent(0.65).setFill(); shape.fill()
        NSColor.separatorColor.withAlphaComponent(0.12).setStroke(); shape.lineWidth = 0.5; shape.stroke()
    }
}

final class BuddyPanel: NSPanel {
    var dismissed: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
    override func cancelOperation(_ sender: Any?) { dismissed?() }
}
final class PillView: NSView {
    var pressed: (() -> Void)?
    var dismissed: (() -> Void)?
    var moved: ((NSPoint) -> Void)?
    var counts = "—"
    var countColor = NSColor.secondaryLabelColor
    var unread = ""
    var scale: CGFloat = 1
    var expanded = false
    var showIcon = true
    var showText = true
    var customText = "Buddy"
    var contentLayout: PillContentLayout {
        let width = ceil((customText as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 12, weight: .semibold)]).width)
        return pillContentLayout(showIcon: showIcon, showText: showText, textWidth: width, running: counts, unread: unread)
    }
    var preferredSize: NSSize { NSSize(width: contentLayout.width * scale, height: 44 * scale) }
    var controlHovered = false
    var tracking: NSTrackingArea?
    var down = NSPoint.zero
    var origin = NSPoint.zero
    var dragged = false
    override var acceptsFirstResponder: Bool { true }
    override func becomeFirstResponder() -> Bool { needsDisplay = true; return true }
    override func resignFirstResponder() -> Bool { needsDisplay = true; return true }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking = tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(area); tracking = area
    }
    override func mouseEntered(with event: NSEvent) { mouseMoved(with: event) }
    override func mouseExited(with event: NSEvent) { controlHovered = false; needsDisplay = true }
    override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let next = bounds.contains(point) && point.x >= contentLayout.controlX * scale
        if controlHovered != next { controlHovered = next; needsDisplay = true }
    }
    override func draw(_ dirtyRect: NSRect) {
        let content = contentLayout
        let shape = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 22 * scale, yRadius: 22 * scale)
        NSColor.textBackgroundColor.withAlphaComponent(0.98).setFill(); shape.fill()
        if controlHovered || (window?.isKeyWindow == true && window?.firstResponder === self) {
            NSColor.labelColor.withAlphaComponent(0.055).setFill()
            NSBezierPath(roundedRect: NSRect(x: (content.controlX + 5) * scale, y: 6 * scale, width: (content.controlWidth - 10) * scale, height: 32 * scale), xRadius: 16 * scale, yRadius: 16 * scale).fill()
        }
        NSColor.separatorColor.withAlphaComponent(0.1).setStroke(); shape.lineWidth = 0.5; shape.stroke()
        func symbol(_ name: String, x: CGFloat, y: CGFloat, size: CGFloat, color: NSColor) {
            guard let base = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: size * scale, weight: .semibold)),
                  let icon = base.withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [color])) else { return }
            let rect = NSRect(x: x * scale, y: y * scale, width: size * scale, height: size * scale)
            icon.draw(in: rect)
        }
        if let x = content.iconX { symbol("terminal", x: x, y: 14, size: 16, color: .labelColor) }
        if let x = content.textX {
            let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byTruncatingTail
            (customText as NSString).draw(in: NSRect(x: x * scale, y: 14 * scale, width: content.textWidth * scale, height: 16 * scale),
                withAttributes: [.font: NSFont.systemFont(ofSize: 12 * scale, weight: .semibold), .foregroundColor: NSColor.labelColor, .paragraphStyle: paragraph])
        }
        if let x = content.toggleDividerX {
            NSColor.separatorColor.withAlphaComponent(0.35).setStroke()
            let line = NSBezierPath(); line.lineWidth = 0.75 * scale
            line.move(to: NSPoint(x: x * scale, y: 12 * scale)); line.line(to: NSPoint(x: x * scale, y: 32 * scale)); line.stroke()
        }
        NSColor.labelColor.setStroke()
        let chevron = NSBezierPath(); chevron.lineWidth = 1.8 * scale; chevron.lineCapStyle = .round; chevron.lineJoinStyle = .round
        let outerY: CGFloat = expanded ? 25.5 : 18.5
        let middleY: CGFloat = expanded ? 18.5 : 25.5
        chevron.move(to: NSPoint(x: content.chevronX * scale, y: outerY * scale))
        chevron.line(to: NSPoint(x: (content.chevronX + 7) * scale, y: middleY * scale))
        chevron.line(to: NSPoint(x: (content.chevronX + 14) * scale, y: outerY * scale)); chevron.stroke()
        func badge(_ value: String, x: CGFloat, width: CGFloat, color: NSColor) {
            let badge = NSBezierPath(roundedRect: NSRect(x: x * scale, y: 26.5 * scale, width: width * scale, height: 17 * scale), xRadius: 8.5 * scale, yRadius: 8.5 * scale)
            color.setFill(); badge.fill()
            NSColor.textBackgroundColor.setStroke(); badge.lineWidth = 1.25 * scale; badge.stroke()
            let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.monospacedDigitSystemFont(ofSize: 9 * scale, weight: .semibold), .foregroundColor: NSColor.white]
            let size = (value as NSString).size(withAttributes: attributes)
            (value as NSString).draw(at: NSPoint(x: (x + width / 2) * scale - size.width / 2, y: 29 * scale), withAttributes: attributes)
        }
        if let x = content.runningX { badge(counts, x: x, width: content.runningWidth, color: countColor) }
        if let x = content.unreadX { badge(unread, x: x, width: content.unreadWidth, color: .systemGreen) }
    }
    override func mouseDown(with event: NSEvent) {
        down = NSEvent.mouseLocation
        origin = NSPoint(x: (window?.frame.minX ?? 0) + frame.minX, y: (window?.frame.minY ?? 0) + frame.minY)
        dragged = false
    }
    override func mouseDragged(with event: NSEvent) {
        let now = NSEvent.mouseLocation
        if hypot(now.x - down.x, now.y - down.y) > 4 { dragged = true }
        guard dragged else { return }
        moved?(NSPoint(x: origin.x + now.x - down.x, y: origin.y + now.y - down.y))
    }
    override func mouseUp(with event: NSEvent) { if !dragged { pressed?() } }
    override func keyDown(with event: NSEvent) {
        if event.modifierFlags.contains(.shift) && event.charactersIgnoringModifiers?.unicodeScalars.first?.value == UInt32(NSF10FunctionKey) {
            _ = accessibilityPerformShowMenu()
        }
        else if event.keyCode == 36 || event.keyCode == 49 { pressed?() }
        else if event.keyCode == 53 { dismissed?() }
        else { super.keyDown(with: event) }
    }
    override func rightMouseDown(with event: NSEvent) {
        NSMenu.popUpContextMenu(contextMenu(), with: event, for: self)
    }
    func contextMenu() -> NSMenu {
        let menu = NSMenu()
        menu.addItem(withTitle: "Quit Paseo Buddy", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        return menu
    }
    override func accessibilityPerformShowMenu() -> Bool {
        contextMenu().popUp(positioning: nil, at: NSPoint(x: bounds.midX, y: bounds.midY), in: self)
        return true
    }
    override func accessibilityPerformPress() -> Bool { pressed?(); return true }
}

final class ListDocument: NSView { override var isFlipped: Bool { true } }

final class Buddy: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    var panel: BuddyPanel!
    let pill = PillView()
    let scroll = NSScrollView()
    let listSurface = ListSurface()
    var anchor = NSPoint.zero
    var expanded = false
    var scale: CGFloat = 1
    var listMinHeight: CGFloat = 140
    var listMaxHeight: CGFloat = 360
    var listContentHeight: CGFloat = 0
    var snapshot = Snapshot(connection: "connecting", agents: [])
    let preferences = UserDefaults(suiteName: ProcessInfo.processInfo.environment["PASEO_BUDDY_PREFERENCES_SUITE"] ?? "io.github.jiangliuhong.paseobuddy.native.preferences")!
    var elapsedFields: [(NSTextField, String?, String)] = []
    var inputBuffer = Data()
    var lockFD: Int32 = -1
    var timer: Timer?
    var screenObserver: NSObjectProtocol?
    let environment = ProcessInfo.processInfo.environment
    var decoder = JSONDecoder()
    let dates = ISO8601DateFormatter()
    lazy var notificationCenter = UNUserNotificationCenter.current()
    var seenNotices = Set<String>()
    var noticeOrder: [String] = []
    var readRequests: [String: PendingRead] = [:]
    var actionError: String?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let lockPath = environment["PASEO_BUDDY_LOCK_PATH"],
              let parent = environment["PASEO_BUDDY_PARENT_PID"], Int32(parent) != nil else { NSApp.terminate(nil); return }
        lockFD = open(lockPath, O_RDWR | O_CREAT | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        var lockInfo = stat()
        guard lockFD >= 0, fstat(lockFD, &lockInfo) == 0, (lockInfo.st_mode & S_IFMT) == S_IFREG, lockInfo.st_uid == getuid() else { NSApp.terminate(nil); return }
        guard flock(lockFD, LOCK_EX | LOCK_NB) == 0 else {
            FileHandle.standardOutput.write(Data("ALREADY_RUNNING\n".utf8)); NSApp.terminate(nil); return
        }
        panel = BuddyPanel(contentRect: NSRect(x: 0, y: 0, width: 176, height: 44), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "Paseo Buddy"
        panel.acceptsMouseMovedEvents = true
        panel.isFloatingPanel = true; panel.becomesKeyOnlyIfNeeded = true
        panel.level = .popUpMenu; panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.hidesOnDeactivate = false; panel.isReleasedWhenClosed = false
        let root = NSView(frame: panel.frame)
        panel.contentView = root
        pill.focusRingType = .none
        pill.setAccessibilityElement(true); pill.setAccessibilityRole(.button)
        pill.setAccessibilityLabel("Paseo Buddy agent list")
        noticeOrder = Array((preferences.stringArray(forKey: "notifiedTurns") ?? []).suffix(1024))
        seenNotices = Set(noticeOrder)
        notificationCenter.delegate = self
        pill.pressed = { [weak self] in self?.toggle() }
        pill.dismissed = { [weak self] in
            guard let self = self, self.expanded else { return }
            self.expanded = false; self.layout(); self.render()
            if self.panel.isKeyWindow { self.panel.makeFirstResponder(self.pill) }
        }
        panel.dismissed = pill.dismissed
        pill.moved = { [weak self] target in
            guard let self = self else { return }
            let screen = NSScreen.screens.first(where: { $0.frame.contains(NSEvent.mouseLocation) }) ?? NSScreen.main
            guard let screen = screen else { return }
            self.anchor = clampedPillAnchor(target, pillSize: self.pill.frame.size, screen: screen.frame)
            self.layout()
        }
        listSurface.material = .popover; listSurface.blendingMode = .behindWindow; listSurface.state = .active
        listSurface.wantsLayer = true; listSurface.layer?.cornerRadius = 20
        listSurface.layer?.masksToBounds = true; listSurface.layer?.borderWidth = 0.75
        listSurface.updateBorder()
        root.addSubview(listSurface)
        scroll.hasVerticalScroller = true; scroll.drawsBackground = false; scroll.scrollerStyle = .overlay
        listSurface.addSubview(scroll)
        root.addSubview(pill)
        if preferences.object(forKey: "x") != nil && preferences.object(forKey: "y") != nil {
            anchor = NSPoint(x: preferences.double(forKey: "x"), y: preferences.double(forKey: "y"))
        } else if let frame = NSScreen.main?.visibleFrame {
            anchor = NSPoint(x: frame.maxX - 206, y: frame.minY + 30)
        }
        readAppearance(); layout(); render()
        panel.orderFrontRegardless()
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            self?.layout(); self?.render()
        }
        FileHandle.standardOutput.write(Data("READY\n".utf8))
        FileHandle.standardInput.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            DispatchQueue.main.async {
                guard let self = self else { return }
                if chunk.isEmpty { NSApp.terminate(nil); return }
                self.inputBuffer.append(chunk)
                if self.inputBuffer.count > 2 * 1024 * 1024 { NSApp.terminate(nil); return }
                while let newline = self.inputBuffer.firstIndex(of: 10) {
                    let line = self.inputBuffer.prefix(upTo: newline)
                    self.inputBuffer.removeSubrange(...newline)
                    if let state = try? self.decoder.decode(Snapshot.self, from: line), state.agents.count <= 5000 {
                        if self.snapshot != state {
                            self.snapshot = state
                            self.readRequests = self.readRequests.filter { _, pending in
                                state.connection == "connected" && state.agents.contains { $0.id == pending.agentId && $0.status == "completed_unread" && $0.attentionTimestamp == pending.attentionTimestamp }
                            }
                            self.render()
                        }
                    } else if let message = try? self.decoder.decode(NotificationMessage.self, from: line) {
                        self.deliver(message.notification)
                    } else if let message = try? self.decoder.decode(ActionResultMessage.self, from: line),
                              let pending = self.readRequests[message.actionResult.requestId], pending.agentId == message.actionResult.agentId {
                        self.readRequests.removeValue(forKey: message.actionResult.requestId)
                        self.actionError = message.actionResult.success ? nil : (message.actionResult.error ?? "Could not mark as read. Please try again.")
                        self.render()
                    }
                }
            }
        }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if let parent = Int32(self.environment["PASEO_BUDDY_PARENT_PID"] ?? ""), kill(parent, 0) != 0 { NSApp.terminate(nil); return }
            self.readAppearance()
            for (field, date, status) in self.elapsedFields { field.stringValue = "\(status) · \(self.elapsed(date))" }
            let expired = self.readRequests.filter { Date().timeIntervalSince($0.value.startedAt) > 25 }
            if !expired.isEmpty {
                for id in expired.keys { self.readRequests.removeValue(forKey: id) }
                self.actionError = "Mark as read timed out. Please try again."; self.render()
            }
        }
    }
    func applicationWillTerminate(_ notification: Notification) {
        FileHandle.standardInput.readabilityHandler = nil
        timer?.invalidate(); savePosition()
        if let screenObserver = screenObserver { NotificationCenter.default.removeObserver(screenObserver) }
        if lockFD >= 0 { close(lockFD) }
    }
    func deliver(_ notice: CompletionNotice) {
        guard notice.isValid, !seenNotices.contains(notice.id) else { return }
        seenNotices.insert(notice.id); noticeOrder.append(notice.id)
        if noticeOrder.count > 1024 { seenNotices.remove(noticeOrder.removeFirst()) }
        preferences.set(noticeOrder, forKey: "notifiedTurns")
        // No authorization prompt or backlog replay on a background event.
        notificationCenter.getNotificationSettings { [weak self] settings in
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
            let content = UNMutableNotificationContent()
            content.title = notice.outcome == "completed" ? "Paseo turn completed" : "Paseo turn failed"
            content.body = notice.agentName
            content.sound = .default
            self?.notificationCenter.add(UNNotificationRequest(identifier: notice.id, content: content, trigger: nil)) { _ in }
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
    func savePosition() {
        guard panel != nil else { return }
        preferences.set(anchor.x, forKey: "x"); preferences.set(anchor.y, forKey: "y")
    }
    func markRead(_ agent: Agent) {
        guard snapshot.connection == "connected", agent.status == "completed_unread",
              !readRequests.values.contains(where: { $0.agentId == agent.id }),
              snapshot.agents.contains(where: { $0.id == agent.id && $0.status == "completed_unread" && $0.attentionTimestamp == agent.attentionTimestamp }) else { return }
        let id = UUID().uuidString
        let command = MarkReadCommand(requestId: id, agentId: agent.id, attentionTimestamp: agent.attentionTimestamp)
        guard var data = try? JSONEncoder().encode(command), data.count <= 2048 else { return }
        data.append(10)
        readRequests[id] = PendingRead(agentId: agent.id, attentionTimestamp: agent.attentionTimestamp, startedAt: Date())
        actionError = nil
        FileHandle.standardOutput.write(data)
        render()
    }
    func readAppearance() {
        guard let file = environment["PASEO_BUDDY_DISPLAY_FILE"],
              let data = try? Data(contentsOf: URL(fileURLWithPath: file)), data.count <= 1024,
              let values = try? decoder.decode(Appearance.self, from: data), values.isValid else { return }
        panel.alphaValue = values.opacity
        let next = CGFloat(values.scale)
        let changed = listMinHeight != CGFloat(values.minimumListHeight) || listMaxHeight != CGFloat(values.maximumListHeight) || scale != next || pill.showIcon != values.iconVisible || pill.showText != values.textVisible || pill.customText != values.textValue
        listMinHeight = CGFloat(values.minimumListHeight); listMaxHeight = CGFloat(values.maximumListHeight)
        scale = next; pill.showIcon = values.iconVisible; pill.showText = values.textVisible; pill.customText = values.textValue
        if changed { layout(); render() }
    }
    func toggle() { expanded.toggle(); layout(); render() }
    func layout() {
        guard let panel = panel else { return }
        pill.scale = scale
        let pillSize = pill.preferredSize
        let screen = NSScreen.screens.first(where: { $0.frame.contains(anchor) }) ?? NSScreen.main
        let frame = screen?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        anchor = clampedPillAnchor(anchor, pillSize: pillSize, screen: frame)
        let geometry = overlayLayout(anchor: anchor, pillSize: pillSize, listSize: NSSize(width: 348 * scale, height: fittedListHeight(contentHeight: listContentHeight, minimum: listMinHeight * scale, maximum: listMaxHeight * scale, padding: 20 * scale)), gap: 8 * scale, screen: frame, expanded: expanded)
        panel.setFrame(geometry.panel, display: true)
        pill.scale = scale; pill.expanded = expanded; pill.frame = geometry.pill
        listSurface.frame = geometry.list; listSurface.layer?.cornerRadius = 20 * scale
        listSurface.isHidden = !expanded
        scroll.frame = expanded ? NSRect(origin: .zero, size: geometry.list.size).insetBy(dx: 8 * scale, dy: 10 * scale) : .zero
        savePosition()
    }
    func elapsed(_ value: String?) -> String {
        guard let value = value else { return "—" }
        dates.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var start = dates.date(from: value)
        if start == nil { dates.formatOptions = [.withInternetDateTime]; start = dates.date(from: value) }
        guard let start = start else { return "—" }
        let interval = Date().timeIntervalSince(start)
        guard interval.isFinite, abs(interval) < 1e12 else { return "—" }
        let seconds = max(0, Int(interval))
        return "\(seconds / 60)m \(seconds % 60)s"
    }
    func render() {
        let running = snapshot.agents.filter { $0.status == "running" }.count
        let unread = snapshot.agents.filter { $0.status == "completed_unread" }.count
        let waiting = snapshot.agents.filter { $0.status == "waiting_permission" }.count
        let connected = snapshot.connection == "connected"
        let oldPillSize = pill.preferredSize
        pill.counts = connected ? (running > 0 ? (running > 99 ? "99+" : String(running)) : "") : "—"
        pill.countColor = running > 0 && connected ? .systemRed : .secondaryLabelColor
        pill.unread = connected && unread > 0 ? (unread > 99 ? "99+" : String(unread)) : ""
        pill.setAccessibilityValue(connected ? "\(running) running, \(unread) unread, \(waiting) waiting permission" : snapshot.connection)
        if pill.preferredSize != oldPillSize { layout() }
        pill.needsDisplay = true
        guard expanded else { elapsedFields.removeAll(); return }
        let focusedAction = (panel.firstResponder as? AgentActionButton)?.focusKey
        var restoreFocus: AgentActionButton?
        let offset = scroll.contentView.bounds.origin
        elapsedFields.removeAll()
        let contentWidth = max(1, scroll.contentSize.width - 12 * scale)
        let textWidth = max(1, contentWidth - 24 * scale)
        let rows = NSStackView(); rows.orientation = .vertical; rows.alignment = .leading; rows.spacing = 8 * scale
        func text(_ value: String, width: CGFloat, size: CGFloat = 12, weight: NSFont.Weight = .regular, color: NSColor = .labelColor, lines: Int = 0) -> NSTextField {
            let field = NSTextField(wrappingLabelWithString: value)
            field.font = NSFont.systemFont(ofSize: size * scale, weight: weight)
            field.textColor = color; field.toolTip = value; field.maximumNumberOfLines = lines
            field.preferredMaxLayoutWidth = width
            field.widthAnchor.constraint(equalToConstant: width).isActive = true
            return field
        }
        rows.addArrangedSubview(text("Agents", width: contentWidth, size: 16, weight: .semibold))
        rows.addArrangedSubview(text(connected ? "\(running) running  ·  \(unread) unread  ·  \(waiting) waiting" : "Paseo \(snapshot.connection)", width: contentWidth, size: 10, color: .secondaryLabelColor))
        if let actionError = actionError { rows.addArrangedSubview(text(actionError, width: contentWidth, size: 10, color: .systemRed)) }
        if connected && snapshot.agents.isEmpty {
            rows.addArrangedSubview(text("All caught up", width: contentWidth, size: 13, weight: .medium))
            rows.addArrangedSubview(text("No running agents or unread completions.", width: contentWidth, size: 11, color: .secondaryLabelColor))
        }
        if connected {
            for (status, title, color) in [("running", "Running", NSColor.systemRed), ("completed_unread", "Completed unread", NSColor.systemGreen), ("waiting_permission", "Waiting permission", NSColor.systemOrange)] {
                let agents = snapshot.agents.filter { $0.status == status }
                if agents.isEmpty { continue }
                rows.addArrangedSubview(text("●  \(title)  ·  \(agents.count)", width: contentWidth, size: 10, weight: .semibold, color: color))
                for agent in agents {
                    let card = AgentCardView(); card.scale = scale
                    let contents = NSStackView(); contents.orientation = .vertical; contents.alignment = .leading; contents.spacing = 6 * scale
                    contents.translatesAutoresizingMaskIntoConstraints = false
                    card.addSubview(contents)
                    contents.addArrangedSubview(text("\(agent.projectName)  ·  \(agent.workspaceName)", width: textWidth, size: 10, weight: .medium, color: .secondaryLabelColor, lines: 1))
                    contents.addArrangedSubview(text(agent.name, width: textWidth, size: 12, weight: .semibold, lines: 2))
                    let footer = NSStackView(); footer.orientation = .horizontal; footer.alignment = .centerY; footer.spacing = 8 * scale
                    let destination = conversationURL(agent.conversationUrl, agentId: agent.id)
                    let canMarkRead = agent.status == "completed_unread"
                    let buttonSpace: CGFloat = (destination == nil ? 0 : 102) + (canMarkRead ? 88 : 0)
                    let duration = text("\(title) · \(elapsed(agent.startedAt))", width: max(1, textWidth - buttonSpace * scale), size: 10, color: .secondaryLabelColor, lines: 1)
                    elapsedFields.append((duration, agent.startedAt, title))
                    footer.addArrangedSubview(duration)
                    if let destination = destination {
                        let button = ConversationButton(title: "Open in Paseo", target: nil, action: nil)
                        button.target = button; button.action = #selector(ConversationButton.openConversation)
                        button.destination = destination; button.isBordered = false; button.contentTintColor = .controlAccentColor
                        button.agentId = agent.id; button.scale = scale
                        if button.focusKey == focusedAction { restoreFocus = button }
                        button.font = NSFont.systemFont(ofSize: 10 * scale, weight: .medium)
                        button.setAccessibilityLabel("Open \(agent.name) in Paseo")
                        button.widthAnchor.constraint(equalToConstant: 94 * scale).isActive = true
                        footer.addArrangedSubview(button)
                    }
                    if canMarkRead {
                        let pending = readRequests.values.contains { $0.agentId == agent.id }
                        let button = MarkReadButton(title: pending ? "Marking…" : "Mark as read", target: nil, action: nil)
                        button.target = button; button.action = #selector(MarkReadButton.markRead)
                        button.agentId = agent.id; button.actionKind = "read"; button.scale = scale
                        button.isBordered = false; button.contentTintColor = .controlAccentColor; button.isEnabled = !pending
                        button.font = NSFont.systemFont(ofSize: 10 * scale, weight: .medium)
                        button.setAccessibilityLabel("Mark \(agent.name) as read")
                        button.widthAnchor.constraint(equalToConstant: 80 * scale).isActive = true
                        button.pressed = { [weak self] in self?.markRead(agent) }
                        if button.focusKey == focusedAction { restoreFocus = button }
                        footer.addArrangedSubview(button)
                    }
                    contents.addArrangedSubview(footer)
                    NSLayoutConstraint.activate([card.widthAnchor.constraint(equalToConstant: contentWidth),
                        contents.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12 * scale),
                        contents.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -12 * scale),
                        contents.topAnchor.constraint(equalTo: card.topAnchor, constant: 10 * scale),
                        contents.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -10 * scale)])
                    rows.addArrangedSubview(card)
                }
            }
        }
        rows.translatesAutoresizingMaskIntoConstraints = false
        let document = ListDocument(); document.addSubview(rows)
        NSLayoutConstraint.activate([rows.leadingAnchor.constraint(equalTo: document.leadingAnchor, constant: 6 * scale), rows.topAnchor.constraint(equalTo: document.topAnchor, constant: 6 * scale), rows.trailingAnchor.constraint(equalTo: document.trailingAnchor, constant: -6 * scale), rows.bottomAnchor.constraint(equalTo: document.bottomAnchor, constant: -6 * scale)])
        document.frame = NSRect(origin: .zero, size: NSSize(width: scroll.contentSize.width, height: rows.fittingSize.height + 12 * scale))
        listContentHeight = document.frame.height
        scroll.documentView = document
        layout()
        scroll.contentView.scroll(to: NSPoint(x: 0, y: max(0, min(offset.y, max(0, document.frame.height - scroll.contentView.bounds.height)))))
        scroll.reflectScrolledClipView(scroll.contentView)
        panel.recalculateKeyViewLoop()
        if panel.isKeyWindow && focusedAction != nil {
            if let restoreFocus = restoreFocus, restoreFocus.isEnabled { panel.makeFirstResponder(restoreFocus) }
            else { panel.makeFirstResponder(pill) }
        }
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let buddy = Buddy()
app.delegate = buddy
app.run()
`;
