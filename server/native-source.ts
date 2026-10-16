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
    let conversationAgentId: String?
    let hostLabel: String?
    let canMarkRead: Bool?
}
struct HostStatus: Decodable, Equatable { let serverId: String; let label: String; let connection: String }
struct Snapshot: Decodable, Equatable {
    let connection: String
    let agents: [Agent]
    var hosts: [HostStatus]? = nil
}
// Bound AppKit view/constraint work independently of the supported directory size.
struct AgentListPage: Equatable {
    static let size = 30
    let index: Int
    let count: Int
    let agents: [Agent]
    init(agents: [Agent], requestedIndex: Int) {
        let ordered = ["running", "completed_unread", "waiting_permission"].flatMap { status in
            agents.filter { $0.status == status }
        }
        count = max(1, (ordered.count + Self.size - 1) / Self.size)
        index = min(max(0, requestedIndex), count - 1)
        self.agents = Array(ordered.dropFirst(index * Self.size).prefix(Self.size))
    }
}
struct ListRenderState: Equatable {
    let snapshot: Snapshot
    let scale: CGFloat
    let page: Int
    let pendingAgents: Set<String>
    let error: String?
    var width: CGFloat = 0
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
    let quickChatX: CGFloat?
}

// Positions contain only visible content; hidden labels/badges reserve no slots or gaps.
func pillContentLayout(showIcon: Bool, showText: Bool, textWidth: CGFloat, running: String, unread: String, showQuickChat: Bool = false) -> PillContentLayout {
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
    let quickChatX: CGFloat? = showQuickChat ? (hasContent ? x + 12 : 0) : nil
    let controlX = showQuickChat ? quickChatX! + 40 : (hasContent ? x + 12 : 0)
    let runningWidth = badgeWidth(running)
    let unreadWidth = badgeWidth(unread)
    let badgeGap: CGFloat = runningWidth > 0 && unreadWidth > 0 ? 3 : 0
    let controlWidth = max(44, runningWidth + badgeGap + unreadWidth + 8)
    let width = controlX + controlWidth
    let unreadX: CGFloat? = unread.isEmpty ? nil : width - 4 - unreadWidth
    let runningX: CGFloat? = running.isEmpty ? nil : width - 4 - unreadWidth - badgeGap - runningWidth
    return PillContentLayout(width: width, iconX: iconX, textX: textX, textWidth: labelWidth, runningX: runningX, runningWidth: runningWidth,
                             unreadX: unreadX, unreadWidth: unreadWidth, toggleDividerX: hasContent ? (quickChatX ?? controlX) : nil,
                             controlX: controlX, controlWidth: controlWidth, chevronX: controlX + (controlWidth - 14) / 2, quickChatX: quickChatX)
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

struct ChatOption: Decodable, Equatable {
    let id: String; let name: String
    let projectId: String?; let providerId: String?; let modelId: String?
    let modeId: String?; let thinkingOptionId: String?
}
struct ChatModel: Decodable, Equatable {
    let id: String; let name: String; let isDefault: Bool
    let thinkingOptions: [ChatOption]; let defaultThinkingOptionId: String?
}
struct ChatOptions: Decodable {
    let projects: [ChatOption]; let workspaces: [ChatOption]; let profiles: [ChatOption]
    let providers: [ChatOption]; let models: [ChatModel]
    var isValid: Bool {
        projects.count <= 500 && workspaces.count <= 500 && profiles.count <= 128 && providers.count <= 64 && models.count <= 256
            && (projects + workspaces + profiles + providers).allSatisfy { !$0.id.isEmpty && $0.id.utf16.count <= 256 && $0.name.utf16.count <= 160 }
            && models.allSatisfy { !$0.id.isEmpty && $0.id.utf16.count <= 256 && $0.name.utf16.count <= 160 && $0.thinkingOptions.count <= 32 }
    }
}
struct ChatSelection: Codable, Equatable {
    let kind: String
    var profileId: String? = nil; var providerId: String? = nil; var modelId: String? = nil
    var isValid: Bool {
        func valid(_ value: String?) -> Bool { value != nil && !(value!.isEmpty) && value!.utf16.count <= 256 }
        return (kind == "profile" && valid(profileId) && providerId == nil && modelId == nil)
            || (kind == "model" && profileId == nil && valid(providerId) && valid(modelId))
    }
}
struct ChatText: Decodable, Equatable {
    let key: String; let role: String; let text: String; let messageId: String?; let truncated: Bool
}
struct ChatSession: Decodable, Equatable {
    let sessionId: String; let projectId: String; let workspaceId: String; let agentId: String
    let workspaceName: String; let agentReady: Bool; let conversationUrl: String?
    let connection: String; let status: String; let delivery: String; let epoch: String?
    let messages: [ChatText]; let partial: Bool; let error: String?
    var isValid: Bool {
        UUID(uuidString: sessionId) != nil && UUID(uuidString: agentId) != nil && projectId.utf16.count <= 256 && workspaceId.utf16.count <= 256
            && workspaceName.utf16.count <= 160 && ["connected", "disconnected"].contains(connection)
            && ["creating", "syncing", "idle", "running", "waiting_permission", "failed"].contains(status)
            && ["none", "sending", "accepted", "unknown"].contains(delivery) && messages.count <= 60
            && messages.allSatisfy { ["user", "assistant"].contains($0.role) && $0.text.utf16.count <= 4096 && $0.key.utf16.count <= 600 }
    }
}
struct ChatReply: Decodable {
    let kind: String; let requestId: String?; let ok: Bool?; let error: String?
    let draftEditable: Bool?
    let options: ChatOptions?; let session: ChatSession?
    var isValid: Bool {
        ["result", "session", "resync_required"].contains(kind)
            && (kind != "result" || (UUID(uuidString: requestId ?? "") != nil && ok != nil))
            && (kind != "session" || session != nil) && (options?.isValid ?? true) && (session?.isValid ?? true)
    }
}
struct ChatEnvelope: Decodable { let quickChat: ChatReply }
struct ChatCommand: Encodable {
    let type: String
    var requestId = UUID().uuidString
    var draftId: String? = nil; var sessionId: String? = nil
    var projectId: String? = nil; var workspaceId: String? = nil
    var providerId: String? = nil; var selection: ChatSelection? = nil
    var messageId: String? = nil; var text: String? = nil
    enum CodingKeys: String, CodingKey { case type, requestId, draftId, sessionId, projectId, workspaceId, providerId, selection, messageId, text }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(type, forKey: .type); try values.encode(requestId, forKey: .requestId)
        try values.encodeIfPresent(draftId, forKey: .draftId); try values.encodeIfPresent(sessionId, forKey: .sessionId)
        try values.encodeIfPresent(projectId, forKey: .projectId); try values.encodeIfPresent(providerId, forKey: .providerId)
        if type == "quick_chat_create" { try values.encode(workspaceId, forKey: .workspaceId) }
        try values.encodeIfPresent(selection, forKey: .selection); try values.encodeIfPresent(messageId, forKey: .messageId)
        try values.encodeIfPresent(text, forKey: .text)
    }
    var data: Data? {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        guard var data = try? encoder.encode(self), data.count <= 96 * 1024 else { return nil }
        data.append(10); return data
    }
}
func chatErrorText(_ error: String?) -> String {
    switch error {
    case "invalid_selection": return "所选配置已变化，请新建草稿后重新选择。"
    case "unsupported": return "此 Paseo daemon 不支持可靠创建，请先更新 Paseo。"
    case "not_found": return "此会话或工作区已不可用，请在 Paseo 中查看。"
    case "busy": return "任务正在运行或等待授权，请稍后重试。"
    case "limit_exceeded": return "已达到本次会话的容量上限，请在 Paseo 中继续。"
    case "request_conflict": return "请求内容已变化，请新建草稿后重新发送。"
    case "outcome_unknown": return "发送结果待确认，请同步状态；不要重复新建任务。"
    default: return "暂时无法连接 Paseo，请稍后重试。"
    }
}
func chatCanSend(session: ChatSession?, pending: Bool, selected: Bool, text: String) -> Bool {
    guard !pending, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 16000 else { return false }
    guard let session = session else { return selected }
    return session.agentReady && session.connection == "connected" && ["idle", "failed"].contains(session.status) && session.delivery != "unknown" && session.error != "not_found"
}

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
final class PageButton: AgentActionButton {
    var pressed: (() -> Void)?
    @objc func changePage() { pressed?() }
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
final class PillChatButton: NSButton {
    var pressed: (() -> Void)?
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    @objc func openChat() { pressed?() }
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 36 || event.keyCode == 49 { pressed?() }
        else if event.modifierFlags.contains(.shift) && event.charactersIgnoringModifiers?.unicodeScalars.first?.value == UInt32(NSF10FunctionKey) { superview?.keyDown(with: event) }
        else { super.keyDown(with: event) }
    }
    override func rightMouseDown(with event: NSEvent) { superview?.rightMouseDown(with: event) }
}
final class PillView: NSView {
    let chatButton = PillChatButton()
    let listButton = PillChatButton()
    var pressed: (() -> Void)?
    var dismissed: (() -> Void)?
    var moved: ((NSPoint) -> Void)?
    var menuTracking: ((Bool) -> Void)?
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
        return pillContentLayout(showIcon: showIcon, showText: showText, textWidth: width, running: counts, unread: unread, showQuickChat: true)
    }
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        chatButton.image = NSImage(systemSymbolName: "plus", accessibilityDescription: "快速对话")
        chatButton.imagePosition = .imageOnly; chatButton.isBordered = false
        chatButton.target = chatButton; chatButton.action = #selector(PillChatButton.openChat)
        chatButton.setAccessibilityLabel("快速对话"); chatButton.toolTip = "快速对话"
        listButton.title = ""; listButton.isBordered = false
        listButton.target = listButton; listButton.action = #selector(PillChatButton.openChat)
        listButton.pressed = { [weak self] in self?.pressed?() }
        listButton.setAccessibilityLabel("Agent 列表"); listButton.toolTip = "Agent 列表"
        for button in [chatButton, listButton] { button.focusRingType = .none; addSubview(button) }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layout() {
        super.layout()
        chatButton.frame = NSRect(x: (contentLayout.quickChatX ?? 0) * scale, y: 4 * scale, width: 40 * scale, height: 36 * scale)
        listButton.frame = NSRect(x: contentLayout.controlX * scale, y: 0, width: contentLayout.controlWidth * scale, height: 44 * scale)
        chatButton.image?.isTemplate = true
    }
    var preferredSize: NSSize { NSSize(width: contentLayout.width * scale, height: 44 * scale) }
    var controlHovered = false
    var tracking: NSTrackingArea?
    var down = NSPoint.zero
    var origin = NSPoint.zero
    var dragged = false
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
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
        if controlHovered || (window?.isKeyWindow == true && (window?.firstResponder === self || window?.firstResponder === listButton)) {
            NSColor.labelColor.withAlphaComponent(0.055).setFill()
            NSBezierPath(roundedRect: NSRect(x: (content.controlX + 5) * scale, y: 6 * scale, width: (content.controlWidth - 10) * scale, height: 32 * scale), xRadius: 16 * scale, yRadius: 16 * scale).fill()
        }
        if window?.isKeyWindow == true && window?.firstResponder === chatButton {
            NSColor.labelColor.withAlphaComponent(0.055).setFill()
            NSBezierPath(roundedRect: chatButton.frame.insetBy(dx: 3 * scale, dy: 2 * scale), xRadius: 14 * scale, yRadius: 14 * scale).fill()
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
        guard let window = window else { return }
        showContextMenu(at: window.convertPoint(toScreen: event.locationInWindow))
    }
    func contextMenu() -> NSMenu {
        let menu = NSMenu()
        menu.addItem(withTitle: "Quit Paseo Buddy", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        return menu
    }
    func showContextMenu(at screenPoint: NSPoint) {
        // Screen coordinates avoid the expanded panel's offset pill frame. Menu tracking
        // must not participate in dragging or let nested state updates move the anchor.
        dragged = true
        menuTracking?(true)
        defer { menuTracking?(false) }
        contextMenu().popUp(positioning: nil, at: screenPoint, in: nil)
    }
    override func accessibilityPerformShowMenu() -> Bool {
        guard let window = window else { return false }
        showContextMenu(at: window.convertPoint(toScreen: convert(NSPoint(x: bounds.midX, y: bounds.midY), to: nil)))
        return true
    }
    override func accessibilityPerformPress() -> Bool { pressed?(); return true }
}

final class ListDocument: NSView { override var isFlipped: Bool { true } }

final class ChatComposer: NSTextView {
    var submitted: (() -> Void)?
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 36 && event.modifierFlags.contains(.command) && !hasMarkedText() { submitted?(); return }
        super.keyDown(with: event)
    }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if string.isEmpty {
            ("有什么想聊的？" as NSString).draw(at: NSPoint(x: textContainerInset.width + 5, y: textContainerInset.height),
                withAttributes: [.font: font ?? NSFont.systemFont(ofSize: 13), .foregroundColor: NSColor.placeholderTextColor])
        }
    }
}

final class ChatChoiceButton: NSButton {
    var choiceKind = ""; var choiceId = ""
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class QuickChatView: NSView, NSTextViewDelegate, NSSearchFieldDelegate {
    override var isFlipped: Bool { true }
    var sendCommand: ((ChatCommand) -> Void)?
    var changedHeight: (() -> Void)?
    var dismissed: (() -> Void)?
    var rememberedChanged: ((String?, String?, ChatSelection?) -> Void)?
    var scale: CGFloat = 1 { didSet { if oldValue != scale { render() } } }
    var draftId = UUID().uuidString
    var options: ChatOptions?
    var projectId: String?
    var workspaceId: String?
    var workspaceChosen = false
    var selection: ChatSelection?
    var session: ChatSession?
    var optionsCommand: ChatCommand?
    var optionsStarted: Date?
    var mutation: ChatCommand?
    var mutationStarted: Date?
    var resumeCommand: ChatCommand?
    var resumeStarted: Date?
    var errorText: String?
    var pickerOpen = false
    var pickerProvider: String?
    var modelProvider: String?
    var loadedProjectId: String?
    var renderedMessages: [ChatText] = []
    var renderedWidth: CGFloat = 0
    var renderedScale: CGFloat = 0
    var renderedPartial = false
    let heading = NSTextField(labelWithString: "新对话")
    let newButton = NSButton(title: "", target: nil, action: nil)
    let closeButton = NSButton(title: "", target: nil, action: nil)
    let retryButton = NSButton(title: "同步", target: nil, action: nil)
    let projectLabel = NSTextField(labelWithString: "Project · 本机")
    let projectPicker = NSPopUpButton(frame: .zero, pullsDown: false)
    let modelLabel = NSTextField(labelWithString: "配置方案")
    let modelButton = NSButton(title: "选择配置方案", target: nil, action: nil)
    let workspaceLabel = NSTextField(labelWithString: "工作区")
    let workspacePicker = NSPopUpButton(frame: .zero, pullsDown: false)
    let detail = NSTextField(labelWithString: "")
    let context = NSTextField(labelWithString: "")
    let targetLabel = NSTextField(labelWithString: "")
    let messagesScroll = NSScrollView()
    let composeSurface = ListDocument()
    let inputScroll = NSScrollView()
    let editor = ChatComposer(frame: .zero)
    let shortcut = NSTextField(labelWithString: "⌘ Enter 发送 · Enter 换行")
    let sendButton = NSButton(title: "", target: nil, action: nil)
    let statusLabel = NSTextField(labelWithString: "正在读取 Paseo 配置…")
    let openButton = NSButton(title: "在 Paseo 中打开 ↗", target: nil, action: nil)
    let backButton = NSButton(title: "返回", target: nil, action: nil)
    let pickerTitle = NSTextField(labelWithString: "选择配置方案")
    let search = NSSearchField()
    let choicesScroll = NSScrollView()

    var preferredHeight: CGFloat {
        if pickerOpen { return 380 * scale }
        return (session?.agentReady == true ? 430 : 332) * scale
    }
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        for view in [heading, newButton, closeButton, retryButton, projectLabel, projectPicker, modelLabel, modelButton,
                     workspaceLabel, workspacePicker, detail, context, targetLabel, messagesScroll, composeSurface,
                     statusLabel, openButton, backButton, pickerTitle, search, choicesScroll] as [NSView] { addSubview(view) }
        for (button, symbol, title, selector) in [
            (newButton, "square.and.pencil", "新建对话", #selector(freshDraft)),
            (closeButton, "xmark", "关闭对话", #selector(closeChat)),
            (sendButton, "arrow.up", "发送消息", #selector(submit))] {
            button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)
            button.imagePosition = .imageOnly; button.isBordered = false; button.target = self; button.action = selector
            button.setAccessibilityLabel(title); button.toolTip = title
        }
        sendButton.wantsLayer = true
        modelButton.image = NSImage(systemSymbolName: "chevron.down", accessibilityDescription: nil)
        modelButton.imagePosition = .imageTrailing; modelButton.imageHugsTitle = true
        for (button, action) in [(modelButton, #selector(showModels)), (retryButton, #selector(retry)),
                                 (openButton, #selector(openInPaseo)), (backButton, #selector(back))] {
            button.target = self; button.action = action; button.bezelStyle = .rounded
        }
        projectPicker.target = self; projectPicker.action = #selector(projectChanged)
        workspacePicker.target = self; workspacePicker.action = #selector(workspaceChanged)
        projectPicker.setAccessibilityLabel("Project"); workspacePicker.setAccessibilityLabel("工作区")
        modelButton.setAccessibilityLabel("选择配置方案或 Provider 和模型")
        search.delegate = self; search.setAccessibilityLabel("搜索配置方案或模型")
        composeSurface.wantsLayer = true; composeSurface.layer?.cornerRadius = 12; composeSurface.layer?.borderWidth = 0.75
        composeSurface.addSubview(inputScroll); composeSurface.addSubview(shortcut); composeSurface.addSubview(sendButton)
        editor.isRichText = false; editor.importsGraphics = false; editor.allowsUndo = true
        editor.isAutomaticQuoteSubstitutionEnabled = false; editor.isAutomaticDashSubstitutionEnabled = false
        editor.isHorizontallyResizable = false; editor.isVerticallyResizable = true
        editor.textContainer?.widthTracksTextView = true; editor.autoresizingMask = [.width]
        editor.backgroundColor = .textBackgroundColor; editor.delegate = self
        editor.textContainerInset = NSSize(width: 6, height: 6); editor.setAccessibilityLabel("消息")
        editor.submitted = { [weak self] in self?.submit() }
        inputScroll.documentView = editor; inputScroll.drawsBackground = false
        inputScroll.hasVerticalScroller = true; inputScroll.scrollerStyle = .overlay
        for scroll in [messagesScroll, choicesScroll] {
            scroll.hasVerticalScroller = true; scroll.scrollerStyle = .overlay; scroll.drawsBackground = false
        }
        for field in [projectLabel, modelLabel, workspaceLabel, detail, context, targetLabel, shortcut, statusLabel] {
            field.textColor = .secondaryLabelColor; field.lineBreakMode = .byTruncatingTail
        }
        render()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        guard sendButton.superview === composeSurface else { return }
        effectiveAppearance.performAsCurrentDrawingAppearance { self.renderedWidth = 0; self.render() }
    }
    func emit(_ command: ChatCommand) {
        guard command.data != nil else { errorText = "消息过长，请缩短后重试。"; render(); return }
        sendCommand?(command)
    }
    func opened() {
        if session != nil { requestResume() }
        else if options == nil { requestOptions() }
        render()
    }
    func requestOptions(provider: String? = nil) {
        let command = ChatCommand(type: "quick_chat_options", projectId: projectId, providerId: provider)
        optionsCommand = command; optionsStarted = Date(); errorText = nil
        emit(command); render()
    }
    func requestResume() {
        guard (session != nil || mutation != nil), mutationStarted == nil, resumeCommand == nil else { return }
        let command = ChatCommand(type: "quick_chat_resume", sessionId: draftId)
        resumeCommand = command; resumeStarted = Date(); emit(command); render()
    }
    func receive(_ reply: ChatReply) {
        guard reply.isValid else { return }
        if reply.kind == "resync_required" {
            mutationStarted = nil; resumeCommand = nil; resumeStarted = nil
            errorText = "状态需要重新同步。"; if session != nil || mutation != nil { requestResume() } else { requestOptions() }; return
        }
        if reply.kind == "session", let update = reply.session, update.sessionId == draftId {
            session = update
            if update.error != nil { errorText = chatErrorText(update.error) }
            else if mutation == nil { errorText = nil }
            reconcileDelivery(update); render(); return
        }
        guard reply.kind == "result", let requestId = reply.requestId else { return }
        if let command = optionsCommand, requestId == command.requestId {
            optionsCommand = nil; optionsStarted = nil
            guard reply.ok == true, let incoming = reply.options else {
                if reply.error == "invalid_selection", command.projectId != nil {
                    if command.providerId != nil { pickerProvider = nil; if selection?.kind == "model" { selection = nil } }
                    else { projectId = nil; workspaceId = nil; workspaceChosen = false }
                    requestOptions(); return
                }
                errorText = chatErrorText(reply.error); render(); return
            }
            options = incoming; modelProvider = command.providerId; loadedProjectId = command.projectId
            if !incoming.projects.contains(where: { $0.id == projectId }) { projectId = incoming.projects.first?.id; workspaceChosen = false }
            if let selection = selection, selection.kind == "profile", !incoming.profiles.contains(where: { $0.id == selection.profileId }) { self.selection = nil }
            if let selection = selection, selection.kind == "model", !incoming.providers.contains(where: { $0.id == selection.providerId }) { self.selection = nil }
            if command.projectId != projectId { if projectId != nil { requestOptions(); return } }
            if !workspaceChosen { workspaceId = incoming.workspaces.first?.id; workspaceChosen = true }
            if let workspaceId = workspaceId, !incoming.workspaces.contains(where: { $0.id == workspaceId }) { self.workspaceId = nil }
            errorText = nil; remember(); rebuildPopups(); rebuildChoices(); render(); return
        }
        if requestId == resumeCommand?.requestId {
            resumeCommand = nil; resumeStarted = nil
            if reply.ok == true, let update = reply.session, update.sessionId == draftId { session = update; reconcileDelivery(update); errorText = update.error == nil ? nil : chatErrorText(update.error) }
            else { errorText = chatErrorText(reply.error) }
            render(); return
        }
        if let command = mutation, requestId == command.requestId {
            mutationStarted = nil
            if reply.ok == true {
                if session?.agentReady != true, let update = reply.session, update.sessionId == draftId { session = update }
                if editor.string == command.text { editor.string = "" }
                mutation = nil; errorText = nil
                if session?.agentReady == true { requestResume() }
            } else if command.type == "quick_chat_create", reply.draftEditable == true {
                // Only the Node service can confirm that no mutation was attempted.
                // Rotate the draft so late snapshots cannot freeze this editable composer.
                draftId = UUID().uuidString; session = nil; mutation = nil
                resumeCommand = nil; resumeStarted = nil; selection = nil
                requestOptions()
                errorText = chatErrorText(reply.error)
            } else { errorText = chatErrorText(reply.error) }
            render()
        }
    }
    func reconcileDelivery(_ update: ChatSession) {
        guard let command = mutation, let messageId = command.messageId,
              update.messages.contains(where: { $0.role == "user" && $0.messageId == messageId }) else { return }
        if editor.string == command.text { editor.string = "" }
        mutation = nil; mutationStarted = nil; errorText = nil
    }
    func tick() {
        var expired = false
        if let start = optionsStarted, Date().timeIntervalSince(start) > 30 { optionsCommand = nil; optionsStarted = nil; expired = true }
        if let start = mutationStarted, Date().timeIntervalSince(start) > 30 { mutationStarted = nil; expired = true }
        if let start = resumeStarted, Date().timeIntervalSince(start) > 30 { resumeCommand = nil; resumeStarted = nil; expired = true }
        if expired { errorText = "请求等待超时，请同步或重试；不要重复新建任务。"; render() }
    }
    @objc func freshDraft() {
        guard mutationStarted == nil else { return }
        draftId = UUID().uuidString; session = nil; mutation = nil; resumeCommand = nil; resumeStarted = nil
        optionsCommand = nil; optionsStarted = nil; pickerOpen = false; pickerProvider = nil
        editor.string = ""; editor.undoManager?.removeAllActions(); errorText = nil
        renderedMessages = []; renderedWidth = 0; requestOptions(); window?.makeFirstResponder(editor)
    }
    @objc func closeChat() { dismissed?() }
    @objc func projectChanged() {
        projectId = projectPicker.selectedItem?.representedObject as? String
        workspaceId = nil; workspaceChosen = false; if selection?.kind == "model" { selection = nil }
        pickerProvider = nil; remember(); requestOptions()
    }
    @objc func workspaceChanged() {
        let value = workspacePicker.selectedItem?.representedObject as? String
        workspaceId = value == "__new__" ? nil : value; workspaceChosen = true; remember(); render()
    }
    @objc func showModels() {
        guard mutation == nil && session == nil else { return }
        pickerOpen = true; pickerProvider = nil; search.stringValue = ""; rebuildChoices(); render()
        window?.makeFirstResponder(search)
    }
    @objc func back() {
        if pickerProvider != nil { pickerProvider = nil; search.stringValue = ""; rebuildChoices() }
        else { pickerOpen = false; render(); window?.makeFirstResponder(editor) }
    }
    func dismissPicker() -> Bool {
        guard pickerOpen else { return false }; pickerOpen = false; render(); return true
    }
    @objc func retry() {
        guard mutationStarted == nil, optionsCommand == nil, resumeCommand == nil else { return }
        if let command = mutation, mutationStarted == nil { mutationStarted = Date(); errorText = nil; emit(command); render() }
        else if session != nil { requestResume() }
        else { requestOptions(provider: pickerProvider) }
    }
    @objc func submit() {
        let selected = projectId != nil && loadedProjectId == projectId && selection != nil && optionsCommand == nil && options != nil
        guard mutation == nil, chatCanSend(session: session, pending: resumeCommand != nil, selected: selected, text: editor.string) else { return }
        let command: ChatCommand
        if session?.agentReady == true {
            command = ChatCommand(type: "quick_chat_send", sessionId: draftId, messageId: UUID().uuidString, text: editor.string)
        } else {
            command = ChatCommand(type: "quick_chat_create", draftId: draftId, projectId: projectId,
                                  workspaceId: workspaceId, selection: selection, messageId: UUID().uuidString, text: editor.string)
        }
        mutation = command; mutationStarted = Date(); errorText = nil; emit(command); render()
    }
    @objc func openInPaseo() {
        guard let session = session, session.agentReady,
              let destination = conversationURL(session.conversationUrl, agentId: session.agentId) else { return }
        NSWorkspace.shared.open(destination)
    }
    func textDidChange(_ notification: Notification) { editor.needsDisplay = true; render() }
    func textView(_ textView: NSTextView, shouldChangeTextIn affectedCharRange: NSRange, replacementString: String?) -> Bool {
        textView.string.utf16.count - affectedCharRange.length + (replacementString?.utf16.count ?? 0) <= 16000
    }
    func controlTextDidChange(_ obj: Notification) { if obj.object as? NSSearchField === search { rebuildChoices() } }
    func rebuildPopups() {
        projectPicker.removeAllItems(); workspacePicker.removeAllItems()
        for item in options?.projects ?? [] { projectPicker.addItem(withTitle: item.name); projectPicker.lastItem?.representedObject = item.id }
        if let index = projectPicker.itemArray.firstIndex(where: { $0.representedObject as? String == projectId }) { projectPicker.selectItem(at: index) }
        workspacePicker.addItem(withTitle: "＋ 新建工作区（Paseo 自动命名）"); workspacePicker.lastItem?.representedObject = "__new__"
        for item in options?.workspaces ?? [] { workspacePicker.addItem(withTitle: item.name); workspacePicker.lastItem?.representedObject = item.id }
        if let workspaceId = workspaceId, let index = workspacePicker.itemArray.firstIndex(where: { $0.representedObject as? String == workspaceId }) { workspacePicker.selectItem(at: index) }
    }
    @objc func choose(_ sender: ChatChoiceButton) {
        if sender.choiceKind == "provider" {
            pickerProvider = sender.choiceId; search.stringValue = ""; requestOptions(provider: sender.choiceId); rebuildChoices(); return
        }
        if sender.choiceKind == "profile" { selection = ChatSelection(kind: "profile", profileId: sender.choiceId) }
        else { selection = ChatSelection(kind: "model", providerId: pickerProvider, modelId: sender.choiceId) }
        pickerOpen = false; errorText = nil; remember(); render(); window?.makeFirstResponder(editor)
    }
    func remember() { rememberedChanged?(projectId, workspaceChosen ? (workspaceId ?? "__new__") : nil, selection) }
    func rebuildChoices() {
        let document = ListDocument(); let width = max(100, choicesScroll.contentSize.width)
        var y: CGFloat = 4 * scale
        let query = search.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        func section(_ title: String) {
            let field = NSTextField(labelWithString: title); field.font = .systemFont(ofSize: 11 * scale); field.textColor = .secondaryLabelColor
            field.frame = NSRect(x: 8 * scale, y: y, width: width - 16 * scale, height: 20 * scale); document.addSubview(field); y += 24 * scale
        }
        func add(_ name: String, detail: String, kind: String, id: String) {
            guard query.isEmpty || (name + " " + detail).lowercased().contains(query) else { return }
            let button = ChatChoiceButton(title: name, target: self, action: #selector(choose(_:)))
            button.choiceKind = kind; button.choiceId = id; button.isBordered = false; button.alignment = .left
            let text = NSMutableAttributedString(string: name, attributes: [.font: NSFont.systemFont(ofSize: 13 * scale, weight: .medium), .foregroundColor: NSColor.labelColor])
            if !detail.isEmpty { text.append(NSAttributedString(string: "\n" + detail, attributes: [.font: NSFont.systemFont(ofSize: 10 * scale), .foregroundColor: NSColor.secondaryLabelColor])) }
            button.attributedTitle = text; button.lineBreakMode = .byTruncatingTail
            button.cell?.wraps = true; button.cell?.usesSingleLineMode = false
            button.image = NSImage(systemSymbolName: kind == "profile" ? "star" : "cpu", accessibilityDescription: nil)
            button.imagePosition = .imageLeading; button.imageHugsTitle = true
            button.toolTip = name + (detail.isEmpty ? "" : " · " + detail)
            button.setAccessibilityLabel(button.toolTip)
            button.frame = NSRect(x: 4 * scale, y: y, width: width - 8 * scale, height: (detail.isEmpty ? 34 : 48) * scale)
            document.addSubview(button); y += button.frame.height + 2 * scale
        }
        if let provider = pickerProvider {
            pickerTitle.stringValue = options?.providers.first(where: { $0.id == provider })?.name ?? provider
            search.placeholderString = "搜索模型…"
            section(optionsCommand == nil ? "模型" : "正在读取模型…")
            if modelProvider == provider { for model in options?.models ?? [] { add(model.name, detail: model.id, kind: "model", id: model.id) } }
        } else {
            pickerTitle.stringValue = (options?.profiles.isEmpty ?? true) ? "选择 Provider" : "选择配置方案"
            search.placeholderString = "搜索配置方案或 Provider…"
            if let profiles = options?.profiles, !profiles.isEmpty {
                section("配置文件")
                for profile in profiles { add(profile.name, detail: [profile.providerId, profile.modelId, profile.modeId, profile.thinkingOptionId].compactMap { $0 }.joined(separator: " · "), kind: "profile", id: profile.id) }
            }
            section("提供方")
            for provider in options?.providers ?? [] { add(provider.name, detail: "选择模型 ›", kind: "provider", id: provider.id) }
        }
        document.frame = NSRect(x: 0, y: 0, width: width, height: max(y, choicesScroll.contentSize.height))
        choicesScroll.documentView = document
        window?.recalculateKeyViewLoop()
    }
    func renderMessages() {
        let messages = session?.messages ?? []
        let width = max(100, messagesScroll.contentSize.width)
        guard messages != renderedMessages || width != renderedWidth || renderedScale != scale || renderedPartial != (session?.partial ?? false) else { return }
        let oldOffset = messagesScroll.contentView.bounds.origin
        let oldHeight = messagesScroll.documentView?.frame.height ?? 0
        let atBottom = oldOffset.y + messagesScroll.contentSize.height >= oldHeight - 12 * scale
        let document = ListDocument(); var y: CGFloat = 4 * scale
        if session?.partial == true {
            let field = NSTextField(labelWithString: "仅显示近期消息，完整记录请在 Paseo 查看。")
            field.font = .systemFont(ofSize: 10 * scale); field.textColor = .secondaryLabelColor
            field.frame = NSRect(x: 6 * scale, y: y, width: width - 12 * scale, height: 20 * scale); document.addSubview(field); y += 26 * scale
        }
        for message in messages {
            let mine = message.role == "user"
            if !mine {
                let author = NSTextField(labelWithString: "Paseo")
                author.font = .systemFont(ofSize: 10 * scale); author.textColor = .secondaryLabelColor
                author.frame = NSRect(x: 12 * scale, y: y, width: width - 24 * scale, height: 16 * scale)
                document.addSubview(author); y += 18 * scale
            }
            let bubbleWidth = max(80, width - (mine ? 34 : 12) * scale)
            let textWidth = bubbleWidth - 20 * scale
            let field = NSTextField(wrappingLabelWithString: message.text + (message.truncated ? "\n…（内容已截断）" : ""))
            field.font = .systemFont(ofSize: 12 * scale); field.textColor = .labelColor; field.isSelectable = true
            field.preferredMaxLayoutWidth = textWidth
            let rect = (field.stringValue as NSString).boundingRect(with: NSSize(width: textWidth, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: field.font!])
            let height = ceil(rect.height) + 14 * scale
            let bubble = NSView(frame: NSRect(x: mine ? width - bubbleWidth - 4 * scale : 4 * scale, y: y, width: bubbleWidth, height: height))
            bubble.wantsLayer = true; bubble.layer?.cornerRadius = 10 * scale
            bubble.layer?.backgroundColor = (mine ? NSColor.controlBackgroundColor : NSColor.textBackgroundColor).cgColor
            field.frame = NSRect(x: 10 * scale, y: 6 * scale, width: textWidth, height: height - 12 * scale)
            bubble.addSubview(field); document.addSubview(bubble); y += height + 10 * scale
        }
        document.frame = NSRect(x: 0, y: 0, width: width, height: max(y, messagesScroll.contentSize.height))
        messagesScroll.documentView = document
        let offset = atBottom ? max(0, document.frame.height - messagesScroll.contentSize.height) : min(oldOffset.y, max(0, document.frame.height - messagesScroll.contentSize.height))
        messagesScroll.contentView.scroll(to: NSPoint(x: 0, y: offset)); messagesScroll.reflectScrolledClipView(messagesScroll.contentView)
        renderedMessages = messages; renderedWidth = width; renderedScale = scale; renderedPartial = session?.partial ?? false
    }
    func render() {
        heading.stringValue = session != nil || mutation != nil ? "快速对话" : "新对话"
        heading.font = .systemFont(ofSize: 15 * scale, weight: .semibold)
        for field in [projectLabel, modelLabel, workspaceLabel, detail, context, targetLabel, shortcut, statusLabel] { field.font = .systemFont(ofSize: 11 * scale) }
        for control in [projectPicker, workspacePicker, modelButton, retryButton, openButton, backButton] as [NSControl] { control.font = .systemFont(ofSize: 12 * scale) }
        if editor.font?.pointSize != 13 * scale { editor.font = .systemFont(ofSize: 13 * scale) }; editor.textColor = .labelColor
        let started = session?.agentReady == true
        let frozen = mutation != nil || session != nil
        projectPicker.isEnabled = !frozen && optionsCommand == nil && !(options?.projects.isEmpty ?? true)
        workspacePicker.isEnabled = !frozen && optionsCommand == nil && projectId != nil && loadedProjectId == projectId
        modelButton.isEnabled = !frozen && optionsCommand == nil && projectId != nil && loadedProjectId == projectId
        modelLabel.stringValue = (options?.profiles.isEmpty ?? true) ? "Provider / 模型" : "配置方案"
        let profile = options?.profiles.first(where: { $0.id == selection?.profileId })
        modelButton.title = profile?.name ?? selection?.modelId ?? ((options?.profiles.isEmpty ?? true) ? "选择 Provider" : "选择配置方案")
        modelButton.toolTip = modelButton.title
        detail.stringValue = profile.map { [$0.providerId, $0.modelId, $0.modeId, $0.thinkingOptionId].compactMap { $0 }.joined(separator: " · ") } ?? ""
        detail.toolTip = detail.stringValue
        targetLabel.stringValue = workspaceId == nil ? "发送时新建工作区和 Agent，名称由 Paseo 决定" : "在所选工作区中新建 Agent"
        context.stringValue = [options?.projects.first(where: { $0.id == projectId })?.name, session?.workspaceName, profile?.name ?? selection?.modelId].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        context.toolTip = context.stringValue
        if editor.isEditable != (mutation == nil) { editor.isEditable = mutation == nil }
        sendButton.isEnabled = mutation == nil && chatCanSend(session: session, pending: resumeCommand != nil,
            selected: projectId != nil && loadedProjectId == projectId && selection != nil && optionsCommand == nil && options != nil, text: editor.string)
        sendButton.layer?.cornerRadius = 10 * scale
        sendButton.layer?.backgroundColor = (sendButton.isEnabled ? NSColor.labelColor : NSColor.separatorColor).cgColor
        sendButton.contentTintColor = .textBackgroundColor
        newButton.isEnabled = mutationStarted == nil
        retryButton.isEnabled = mutationStarted == nil && optionsCommand == nil && resumeCommand == nil
        retryButton.title = mutation != nil ? "重试" : "同步"
        retryButton.isHidden = errorText == nil && session == nil && mutation == nil
        let destination = session.flatMap { conversationURL($0.conversationUrl, agentId: $0.agentId) }
        openButton.isEnabled = destination != nil; openButton.isHidden = !started
        if let errorText = errorText { statusLabel.stringValue = errorText; statusLabel.textColor = .systemRed }
        else {
            statusLabel.textColor = .secondaryLabelColor
            if mutationStarted != nil { statusLabel.stringValue = started ? "正在发送…" : "正在创建对话…" }
            else if optionsCommand != nil { statusLabel.stringValue = "正在读取配置…" }
            else if resumeCommand != nil { statusLabel.stringValue = "正在同步…" }
            else if mutation != nil { statusLabel.stringValue = "请求结果待确认，请重试或同步。" }
            else if let session = session {
                statusLabel.stringValue = session.connection != "connected" ? "连接中断，正在重连…" : session.status == "waiting_permission" ? "等待授权，请在 Paseo 中处理" : session.status == "running" ? "正在回复…" : session.status == "failed" ? "任务失败，请在 Paseo 中查看" : "已连接本机 Paseo"
            } else { statusLabel.stringValue = (options?.projects.isEmpty ?? false) ? "请先在 Paseo 中添加 Project" : "已连接本机 Paseo" }
        }
        statusLabel.toolTip = statusLabel.stringValue
        composeSurface.layer?.backgroundColor = NSColor.textBackgroundColor.cgColor
        composeSurface.layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.4).cgColor
        for view in [projectLabel, projectPicker, modelLabel, modelButton, workspaceLabel, workspacePicker, detail, targetLabel] as [NSView] { view.isHidden = pickerOpen || started }
        context.isHidden = pickerOpen || !started
        messagesScroll.isHidden = pickerOpen || !started
        composeSurface.isHidden = pickerOpen; statusLabel.isHidden = pickerOpen; openButton.isHidden = pickerOpen || !started
        for view in [backButton, pickerTitle, search, choicesScroll] as [NSView] { view.isHidden = !pickerOpen }
        needsLayout = true; layoutSubtreeIfNeeded(); changedHeight?()
    }
    override func layout() {
        super.layout()
        let s = scale; let width = bounds.width; let usable = max(80, width - 32 * s)
        heading.frame = NSRect(x: 16*s, y: 16*s, width: max(60, usable - 150*s), height: 24*s)
        closeButton.frame = NSRect(x: width-44*s, y: 12*s, width: 32*s, height: 32*s)
        newButton.frame = NSRect(x: width-80*s, y: 12*s, width: 32*s, height: 32*s)
        retryButton.frame = NSRect(x: width-144*s, y: 14*s, width: 60*s, height: 28*s)
        let half = max(36, (usable - 12*s) / 2)
        projectLabel.frame = NSRect(x:16*s,y:52*s,width:half,height:16*s)
        modelLabel.frame = NSRect(x:28*s+half,y:52*s,width:half,height:16*s)
        projectPicker.frame = NSRect(x:14*s,y:72*s,width:half+4*s,height:28*s)
        modelButton.frame = NSRect(x:28*s+half,y:72*s,width:half,height:28*s)
        workspaceLabel.frame = NSRect(x:16*s,y:108*s,width:usable,height:16*s)
        workspacePicker.frame = NSRect(x:14*s,y:128*s,width:usable+4*s,height:28*s)
        detail.frame = NSRect(x:16*s,y:160*s,width:usable,height:16*s)
        targetLabel.frame = NSRect(x:16*s,y:178*s,width:usable,height:16*s)
        context.frame = NSRect(x:16*s,y:52*s,width:usable,height:22*s)
        let footerY = max(0, bounds.height - 26*s)
        let composeY = max(0, footerY - 100*s)
        composeSurface.frame = NSRect(x:14*s,y:composeY,width:max(1,width-28*s),height:90*s)
        inputScroll.frame = NSRect(x:3*s,y:3*s,width:max(1,composeSurface.frame.width-6*s),height:53*s)
        editor.setFrameSize(NSSize(width: inputScroll.contentSize.width, height: max(inputScroll.contentSize.height, editor.frame.height)))
        shortcut.frame = NSRect(x:10*s,y:62*s,width:max(1,composeSurface.frame.width-64*s),height:18*s)
        sendButton.frame = NSRect(x:composeSurface.frame.width-42*s,y:54*s,width:34*s,height:32*s)
        statusLabel.frame = NSRect(x:16*s,y:footerY,width:startedWidth(usable),height:18*s)
        openButton.frame = NSRect(x:width-144*s,y:footerY-2*s,width:128*s,height:22*s)
        messagesScroll.frame = NSRect(x:10*s,y:80*s,width:max(1,width-20*s),height:max(0,composeY-90*s))
        backButton.frame = NSRect(x:12*s,y:50*s,width:60*s,height:28*s)
        pickerTitle.frame = NSRect(x:80*s,y:54*s,width:max(1,usable-68*s),height:22*s)
        pickerTitle.font = .systemFont(ofSize:13*s,weight:.medium)
        search.frame = NSRect(x:16*s,y:88*s,width:usable,height:28*s)
        choicesScroll.frame = NSRect(x:10*s,y:124*s,width:max(1,width-20*s),height:max(0,bounds.height-136*s))
        if pickerOpen { rebuildChoices() } else { renderMessages() }
    }
    func startedWidth(_ usable: CGFloat) -> CGFloat { max(1, usable - (session?.agentReady == true ? 136 * scale : 0)) }
}

final class Buddy: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    var panel: BuddyPanel!
    let pill = PillView()
    let scroll = NSScrollView()
    let listSurface = ListSurface()
    let chatSurface = ListSurface()
    let chatScroll = NSScrollView()
    lazy var chatView = QuickChatView(frame: .zero)
    var anchor = NSPoint.zero
    var expanded = false
    var chatVisible = false
    var trackingMenu = false
    var scale: CGFloat = 1
    var listMinHeight: CGFloat = 140
    var listMaxHeight: CGFloat = 360
    var listContentHeight: CGFloat = 0
    var listPage = 0
    var renderedList: ListRenderState?
    var renderScheduled = false
    var snapshot = Snapshot(connection: "connecting", agents: [])
    let preferences = UserDefaults(suiteName: ProcessInfo.processInfo.environment["PASEO_BUDDY_PREFERENCES_SUITE"] ?? "io.github.jiangliuhong.paseobuddy.native.preferences")!
    var elapsedFields: [(NSTextField, String?, String)] = []
    var inputBuffer = Data()
    var lockFD: Int32 = -1
    var timer: Timer?
    var screenObserver: NSObjectProtocol?
    let environment = ProcessInfo.processInfo.environment
    var decoder = JSONDecoder()
    let dates: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    let wholeSecondDates = ISO8601DateFormatter()
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
        panel.level = .floating; panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.hidesOnDeactivate = false; panel.isReleasedWhenClosed = false
        let root = NSView(frame: panel.frame)
        panel.contentView = root
        pill.focusRingType = .none
        pill.setAccessibilityElement(false); pill.setAccessibilityRole(.group)
        pill.setAccessibilityLabel("Paseo Buddy agent list")
        noticeOrder = Array((preferences.stringArray(forKey: "notifiedTurns") ?? []).suffix(1024))
        seenNotices = Set(noticeOrder)
        notificationCenter.delegate = self
        pill.pressed = { [weak self] in self?.toggle() }
        pill.chatButton.pressed = { [weak self] in self?.toggleChat() }
        pill.dismissed = { [weak self] in
            guard let self = self else { return }
            if self.chatVisible {
                if self.chatView.dismissPicker() { return }
                self.closeChat(); return
            }
            guard self.expanded else { return }
            self.expanded = false; self.layout(); self.render()
            if self.panel.isKeyWindow { self.panel.makeFirstResponder(self.pill) }
        }
        panel.dismissed = pill.dismissed
        pill.menuTracking = { [weak self] tracking in
            guard let self = self else { return }
            self.trackingMenu = tracking
            if !tracking { self.layout(); self.render() }
        }
        pill.moved = { [weak self] target in
            guard let self = self, !self.trackingMenu else { return }
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
        chatSurface.material = .popover; chatSurface.blendingMode = .behindWindow; chatSurface.state = .active
        chatSurface.wantsLayer = true; chatSurface.layer?.cornerRadius = 20; chatSurface.layer?.masksToBounds = true
        chatSurface.layer?.borderWidth = 0.75; chatSurface.updateBorder(); root.addSubview(chatSurface)
        chatScroll.hasVerticalScroller = true; chatScroll.drawsBackground = false; chatScroll.scrollerStyle = .overlay
        chatSurface.addSubview(chatScroll); chatScroll.documentView = chatView
        if let project = preferences.string(forKey: "chatProjectId"), project.utf16.count <= 256 {
            chatView.projectId = project
            if let workspace = preferences.string(forKey: "chatWorkspaceId"), workspace.utf16.count <= 256 {
                chatView.workspaceId = workspace == "__new__" ? nil : workspace; chatView.workspaceChosen = true
            }
        }
        if let data = preferences.data(forKey: "chatSelection"), data.count <= 4096,
           let selection = try? JSONDecoder().decode(ChatSelection.self, from: data), selection.isValid { chatView.selection = selection }
        chatView.rememberedChanged = { [weak self] project, workspace, selection in
            guard let self = self else { return }
            self.preferences.set(project, forKey: "chatProjectId"); self.preferences.set(workspace, forKey: "chatWorkspaceId")
            self.preferences.set(selection.flatMap { try? JSONEncoder().encode($0) }, forKey: "chatSelection")
        }
        chatView.sendCommand = { command in if let data = command.data { FileHandle.standardOutput.write(data) } }
        chatView.changedHeight = { [weak self] in if self?.chatVisible == true { self?.layout() } }
        chatView.dismissed = { [weak self] in self?.closeChat() }
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
                            self.scheduleRender()
                        }
                    } else if let message = try? self.decoder.decode(NotificationMessage.self, from: line) {
                        self.deliver(message.notification)
                    } else if let message = try? self.decoder.decode(ActionResultMessage.self, from: line),
                              let pending = self.readRequests[message.actionResult.requestId], pending.agentId == message.actionResult.agentId {
                        self.readRequests.removeValue(forKey: message.actionResult.requestId)
                        self.actionError = message.actionResult.success ? nil : (message.actionResult.error ?? "Could not mark as read. Please try again.")
                        self.scheduleRender()
                    } else if line.count <= 256 * 1024, let message = try? self.decoder.decode(ChatEnvelope.self, from: line), message.quickChat.isValid {
                        self.chatView.receive(message.quickChat)
                    }
                }
            }
        }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if let parent = Int32(self.environment["PASEO_BUDDY_PARENT_PID"] ?? ""), kill(parent, 0) != 0 { NSApp.terminate(nil); return }
            self.readAppearance()
            self.chatView.tick()
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
        guard snapshot.connection == "connected", agent.status == "completed_unread", agent.canMarkRead != false,
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
    func scheduleRender() {
        guard !renderScheduled else { return }
        renderScheduled = true
        // Merge snapshot bursts instead of rebuilding the native list for each IPC line.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self = self else { return }
            self.renderScheduled = false
            self.render()
        }
    }
    func toggle() {
        chatVisible = false; chatView.pickerOpen = false; expanded.toggle()
        if panel.isKeyWindow { panel.makeFirstResponder(pill.listButton) }
        layout(); render()
    }
    func toggleChat() {
        if chatVisible { closeChat(); return }
        expanded = false; chatVisible = true; layout(); render()
        panel.makeKeyAndOrderFront(nil); panel.makeFirstResponder(chatView.editor)
        chatView.opened()
    }
    func closeChat() {
        chatVisible = false; chatView.pickerOpen = false; layout(); render()
        if panel.isKeyWindow { panel.makeFirstResponder(pill.chatButton); panel.resignKey() }
    }
    func layout() {
        guard !trackingMenu else { return }
        guard let panel = panel else { return }
        pill.scale = scale
        let pillSize = pill.preferredSize
        let screen = NSScreen.screens.first(where: { $0.frame.contains(anchor) }) ?? NSScreen.main
        let frame = screen?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        anchor = clampedPillAnchor(anchor, pillSize: pillSize, screen: frame)
        chatView.scale = scale
        let surfaceSize = chatVisible ? NSSize(width: 410 * scale, height: chatView.preferredHeight) : NSSize(width: 348 * scale, height: fittedListHeight(contentHeight: listContentHeight, minimum: listMinHeight * scale, maximum: listMaxHeight * scale, padding: 20 * scale))
        let geometry = overlayLayout(anchor: anchor, pillSize: pillSize, listSize: surfaceSize, gap: 8 * scale, screen: frame, expanded: expanded || chatVisible)
        panel.setFrame(geometry.panel, display: true)
        pill.scale = scale; pill.expanded = expanded; pill.frame = geometry.pill; pill.needsLayout = true; pill.layoutSubtreeIfNeeded()
        listSurface.frame = geometry.list; listSurface.layer?.cornerRadius = 20 * scale
        listSurface.isHidden = !expanded
        scroll.frame = expanded ? NSRect(origin: .zero, size: geometry.list.size).insetBy(dx: 8 * scale, dy: 10 * scale) : .zero
        chatSurface.frame = geometry.list; chatSurface.layer?.cornerRadius = 20 * scale; chatSurface.isHidden = !chatVisible
        if chatVisible {
            chatScroll.frame = chatSurface.bounds
            chatView.frame = NSRect(x: 0, y: 0, width: chatScroll.contentSize.width, height: chatView.preferredHeight)
            chatView.needsLayout = true; chatView.layoutSubtreeIfNeeded()
        }
        savePosition()
    }
    func elapsed(_ value: String?) -> String {
        guard let value = value else { return "—" }
        guard let start = dates.date(from: value) ?? wholeSecondDates.date(from: value) else { return "—" }
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
        pill.listButton.setAccessibilityValue(connected ? "\(running) running, \(unread) unread, \(waiting) waiting permission" : snapshot.connection)
        if pill.preferredSize != oldPillSize { layout() }
        pill.needsDisplay = true
        guard expanded else { return }
        let page = AgentListPage(agents: snapshot.connection == "connected" ? snapshot.agents : [], requestedIndex: listPage)
        listPage = page.index
        let state = ListRenderState(snapshot: snapshot, scale: scale, page: listPage,
                                    pendingAgents: Set(readRequests.values.map { $0.agentId }), error: actionError, width: scroll.contentSize.width)
        // Retain the document and scroll position across collapse/reopen and geometry changes.
        guard renderedList != state else { return }
        renderedList = state
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
        for host in snapshot.hosts ?? [] where host.connection != "connected" {
            rows.addArrangedSubview(text("\(host.label) · \(host.connection)", width: contentWidth, size: 10, color: .secondaryLabelColor))
        }
        if let actionError = actionError { rows.addArrangedSubview(text(actionError, width: contentWidth, size: 10, color: .systemRed)) }
        if connected && snapshot.agents.isEmpty {
            let incomplete = snapshot.hosts?.contains { $0.connection != "connected" } ?? false
            rows.addArrangedSubview(text(incomplete ? "Connected hosts caught up" : "All caught up", width: contentWidth, size: 13, weight: .medium))
            rows.addArrangedSubview(text(incomplete ? "Offline hosts may have additional activity." : "No running agents or unread completions.", width: contentWidth, size: 11, color: .secondaryLabelColor))
        }
        if connected && page.count > 1 {
            let navigation = NSStackView(); navigation.orientation = .horizontal; navigation.spacing = 8 * scale
            for (title, step, enabled) in [("Previous", -1, page.index > 0), ("Next", 1, page.index + 1 < page.count)] {
                let button = PageButton(title: title, target: nil, action: nil)
                button.target = button; button.action = #selector(PageButton.changePage)
                button.actionKind = "page"; button.agentId = title; button.scale = scale
                button.isEnabled = enabled; button.font = NSFont.systemFont(ofSize: 11 * scale)
                button.pressed = { [weak self] in
                    guard let self = self else { return }
                    self.listPage += step
                    self.scroll.contentView.scroll(to: .zero)
                    self.render()
                }
                if button.focusKey == focusedAction { restoreFocus = button }
                navigation.addArrangedSubview(button)
            }
            navigation.addArrangedSubview(text("\(page.index + 1) / \(page.count)", width: 90 * scale, size: 10, color: .secondaryLabelColor))
            rows.addArrangedSubview(navigation)
        }
        if connected {
            for (status, title, color) in [("running", "Running", NSColor.systemRed), ("completed_unread", "Completed unread", NSColor.systemGreen), ("waiting_permission", "Waiting permission", NSColor.systemOrange)] {
                let agents = page.agents.filter { $0.status == status }
                if agents.isEmpty { continue }
                rows.addArrangedSubview(text("●  \(title)  ·  \(snapshot.agents.filter { $0.status == status }.count)", width: contentWidth, size: 10, weight: .semibold, color: color))
                for agent in agents {
                    let card = AgentCardView(); card.scale = scale
                    let contents = NSStackView(); contents.orientation = .vertical; contents.alignment = .leading; contents.spacing = 6 * scale
                    contents.translatesAutoresizingMaskIntoConstraints = false
                    card.addSubview(contents)
                    if let host = agent.hostLabel { contents.addArrangedSubview(text(host, width: textWidth, size: 10, weight: .medium, color: .secondaryLabelColor, lines: 1)) }
                    contents.addArrangedSubview(text("\(agent.projectName)  ·  \(agent.workspaceName)", width: textWidth, size: 10, weight: .medium, color: .secondaryLabelColor, lines: 1))
                    contents.addArrangedSubview(text(agent.name, width: textWidth, size: 12, weight: .semibold, lines: 2))
                    let footer = NSStackView(); footer.orientation = .horizontal; footer.alignment = .centerY; footer.spacing = 8 * scale
                    let destination = conversationURL(agent.conversationUrl, agentId: agent.conversationAgentId ?? agent.id)
                    let canMarkRead = agent.status == "completed_unread" && agent.canMarkRead != false
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
