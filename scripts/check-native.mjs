import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nativeSource } from '../build/server/native-source.js';
if(process.platform!=='darwin')throw Error('Native checks require macOS and Apple developer tools');
const root=await mkdtemp(path.join(os.tmpdir(),'buddy-native-check-'));
try {
 const source=path.join(root,'Check.swift');const binary=path.join(root,'Check');
 const app=nativeSource.slice(0,nativeSource.indexOf('let app = NSApplication.shared'));
 await writeFile(source,app+String.raw`
let screen = NSRect(x: 0, y: 0, width: 1440, height: 900)
let pill = NSSize(width: 176, height: 44)
let identityDecoder = JSONDecoder()
let legacyAppearance = try identityDecoder.decode(Appearance.self, from: Data(#"{"opacity":0.6,"scale":1.25}"#.utf8))
precondition(legacyAppearance.isValid && legacyAppearance.iconVisible && legacyAppearance.textVisible && legacyAppearance.textValue == "Buddy")
let customAppearance = try identityDecoder.decode(Appearance.self, from: Data(#"{"opacity":1,"scale":1,"showIcon":false,"showText":false,"customText":"小助手 🐾"}"#.utf8))
precondition(customAppearance.isValid && !customAppearance.iconVisible && !customAppearance.textVisible && customAppearance.textValue == "小助手 🐾")
let invalidAppearance = try identityDecoder.decode(Appearance.self, from: Data(#"{"opacity":1,"scale":1,"customText":"two\nlines"}"#.utf8))
precondition(!invalidAppearance.isValid)
precondition(legacyAppearance.minimumListHeight == 140 && legacyAppearance.maximumListHeight == 360)
for raw in [#"{"opacity":1,"scale":1,"listMinHeight":400,"listMaxHeight":360}"#,
            #"{"opacity":1,"scale":1,"listMinHeight":140.5}"#,
            #"{"opacity":1,"scale":1,"listMaxHeight":601}"#] {
    let invalidHeight = try identityDecoder.decode(Appearance.self, from: Data(raw.utf8))
    precondition(!invalidHeight.isValid)
}
for factor: CGFloat in [0.75, 1, 1.5] {
    precondition(fittedListHeight(contentHeight: 0, minimum: 140 * factor, maximum: 360 * factor, padding: 20 * factor) == 140 * factor)
    precondition(fittedListHeight(contentHeight: 180 * factor, minimum: 140 * factor, maximum: 360 * factor, padding: 20 * factor) == 200 * factor)
    precondition(fittedListHeight(contentHeight: 800 * factor, minimum: 140 * factor, maximum: 360 * factor, padding: 20 * factor) == 360 * factor)
}
let noCounters = pillContentLayout(showIcon: true, showText: true, textWidth: 36, running: "", unread: "")
let onlyRunning = pillContentLayout(showIcon: true, showText: true, textWidth: 36, running: "1", unread: "")
let onlyUnread = pillContentLayout(showIcon: true, showText: true, textWidth: 36, running: "", unread: "2")
let bothCounters = pillContentLayout(showIcon: true, showText: true, textWidth: 36, running: "99+", unread: "99+")
precondition(noCounters.width == onlyRunning.width && onlyRunning.width < bothCounters.width)
precondition(onlyUnread.width == noCounters.width && onlyUnread.unreadX != nil)
let bothSmall = pillContentLayout(showIcon: true, showText: true, textWidth: 36, running: "1", unread: "2")
precondition(bothSmall.width >= onlyRunning.width && bothSmall.width - onlyRunning.width <= 4, "Two corner badges need only a compact gap, not a middle content section")
precondition(noCounters.runningX == nil && noCounters.unreadX == nil)
precondition(noCounters.toggleDividerX == noCounters.textX! + noCounters.textWidth + 12)
precondition(noCounters.width == noCounters.controlX + 44, "Only the functional toggle segment remains on the right")
for showIcon in [false, true] {
    for showText in [false, true] {
        for counters in [("", ""), ("1", ""), ("", "99+"), ("99+", "99+"), ("—", "")] {
            let content = pillContentLayout(showIcon: showIcon, showText: showText, textWidth: 500, running: counters.0, unread: counters.1)
            precondition((content.iconX != nil) == showIcon && (content.textX != nil) == showText)
            precondition(content.textWidth <= 140 && content.chevronX + 14 <= content.width - 12)
            precondition(content.width - content.controlX == content.controlWidth && content.controlWidth >= 44)
            if let badgeX = content.runningX {
                precondition(badgeX >= content.controlX && badgeX + content.runningWidth <= content.width - 4)
            }
            if let badgeX = content.unreadX {
                precondition(badgeX >= content.controlX && badgeX + content.unreadWidth <= content.width - 4)
            }
            if let redX = content.runningX, let greenX = content.unreadX {
                precondition(redX + content.runningWidth + 3 <= greenX, "Corner badges must not overlap")
            }
        }
    }
}
let minimal = pillContentLayout(showIcon: false, showText: false, textWidth: 0, running: "", unread: "")
precondition(minimal.width == 44 && minimal.controlX == 0 && minimal.chevronX == 15 && minimal.toggleDividerX == nil)
precondition(pillContentLayout(showIcon: true, showText: true, textWidth: 0, running: "", unread: "").textX == nil)
let widest = pillContentLayout(showIcon: true, showText: true, textWidth: 500, running: "99+", unread: "99+")
for width in [minimal.width, noCounters.width, onlyRunning.width, bothCounters.width, widest.width] {
    for factor: CGFloat in [0.75, 1, 1.5] {
        let anchor = NSPoint(x: 600, y: 0)
        let size = NSSize(width: width * factor, height: 44 * factor)
        let layout = overlayLayout(anchor: anchor, pillSize: size, listSize: NSSize(width: 348 * factor, height: 360 * factor), gap: 8 * factor, screen: screen, expanded: true)
        precondition(layout.pill.offsetBy(dx: layout.panel.minX, dy: layout.panel.minY).origin == anchor, "Dynamic width must preserve the pill anchor")
        precondition(!layout.pill.intersects(layout.list))
    }
}
// NSView.hitTest receives a point in its superview's coordinates. Expansion moves the pill.
let hitRoot = NSView(frame: NSRect(x: 0, y: 0, width: 600, height: 800))
let hitPill = PillView(frame: .zero)
hitRoot.addSubview(hitPill)
for factor: CGFloat in [0.75, 1, 1.5] {
    for origin in [NSPoint.zero, NSPoint(x: 172 * factor, y: 0), NSPoint(x: 172 * factor, y: 368 * factor)] {
        hitPill.frame = NSRect(origin: origin, size: NSSize(width: 176 * factor, height: 44 * factor))
        let center = NSPoint(x: hitPill.frame.midX, y: hitPill.frame.midY)
        precondition(hitRoot.hitTest(center) === hitPill, "Expanded pill must remain clickable")
        precondition(hitPill.hitTest(center) === hitPill, "Pill hit-testing must account for its frame origin")
        let outside = NSPoint(x: hitPill.frame.maxX + 1, y: hitPill.frame.midY)
        precondition(hitPill.hitTest(outside) == nil)
    }
}
// Background clicks must toggle immediately without first activating the accessory panel.
precondition(hitPill.acceptsFirstMouse(for: nil))
let manyAgents = (0..<5000).map { i in
    Agent(id: String(i), projectName: "Project", workspaceName: "Workspace", name: "Agent \(i)",
          status: ["waiting_permission", "running", "completed_unread"][i % 3], startedAt: nil,
          conversationUrl: nil, attentionTimestamp: nil, conversationAgentId: nil, hostLabel: nil, canMarkRead: nil)
}
let expectedOrder = ["running", "completed_unread", "waiting_permission"].flatMap { status in manyAgents.filter { $0.status == status } }
var pagedAgents: [Agent] = []
let firstPage = AgentListPage(agents: manyAgents, requestedIndex: -1)
precondition(firstPage.index == 0 && firstPage.count == 167)
for index in 0..<firstPage.count {
    let page = AgentListPage(agents: manyAgents, requestedIndex: index)
    precondition(page.agents.count <= 30, "AppKit card construction must stay bounded for 5,000 agents")
    pagedAgents.append(contentsOf: page.agents)
}
precondition(pagedAgents == expectedOrder, "Paging must preserve grouping and expose every agent exactly once")
precondition(AgentListPage(agents: manyAgents, requestedIndex: 999).index == 166)
let shrunkPage = AgentListPage(agents: Array(manyAgents.prefix(2)), requestedIndex: 166)
precondition(shrunkPage.index == 0 && shrunkPage.agents.count == 2)
let emptyPage = AgentListPage(agents: [], requestedIndex: 166)
precondition(emptyPage.index == 0 && emptyPage.count == 1 && emptyPage.agents.isEmpty)
let listSnapshot = Snapshot(connection: "connected", agents: manyAgents)
let renderState = ListRenderState(snapshot: listSnapshot, scale: 1, page: 0, pendingAgents: [], error: nil)
precondition(renderState == ListRenderState(snapshot: listSnapshot, scale: 1, page: 0, pendingAgents: [], error: nil))
precondition(renderState != ListRenderState(snapshot: listSnapshot, scale: 1.5, page: 0, pendingAgents: [], error: nil))
precondition(renderState != ListRenderState(snapshot: listSnapshot, scale: 1, page: 1, pendingAgents: [], error: nil))
precondition(renderState != ListRenderState(snapshot: listSnapshot, scale: 1, page: 0, pendingAgents: ["1"], error: nil))
precondition(renderState != ListRenderState(snapshot: listSnapshot, scale: 1, page: 0, pendingAgents: [], error: "Retry"))
precondition(renderState != ListRenderState(snapshot: Snapshot(connection: "disconnected", agents: []), scale: 1, page: 0, pendingAgents: [], error: nil))
precondition(renderState != ListRenderState(snapshot: listSnapshot, scale: 1, page: 0, pendingAgents: [], error: nil, width: 200))
let elapsedBuddy = Buddy()
precondition(elapsedBuddy.elapsed("2026-10-15T10:00:00.000Z") != "—")
precondition(elapsedBuddy.elapsed("2026-10-15T10:00:00Z") != "—")
precondition(elapsedBuddy.elapsed("invalid") == "—")
// Drag bounds use the physical display, not the visible frame that reserves 80pt for the Dock.
let dockReservedFrame = NSRect(x: 0, y: 80, width: 1440, height: 796)
precondition(clampedPillAnchor(NSPoint(x: 100, y: -200), pillSize: pill, screen: screen).y == screen.minY)
precondition(screen.minY < dockReservedFrame.minY)
for factor: CGFloat in [0.75, 1, 1.5] {
    let pillSize = NSSize(width: 176 * factor, height: 44 * factor)
    let listSize = NSSize(width: 348 * factor, height: 360 * factor)
    for display in [screen, NSRect(x: -1440, y: -900, width: 1440, height: 900), NSRect(x: 0, y: 0, width: 600, height: 360)] {
        for target in [NSPoint(x: display.minX - 100, y: display.minY - 100), NSPoint(x: display.maxX, y: display.maxY), NSPoint(x: display.midX, y: display.midY)] {
            let anchor = clampedPillAnchor(target, pillSize: pillSize, screen: display)
            let layout = overlayLayout(anchor: anchor, pillSize: pillSize, listSize: listSize, gap: 8 * factor, screen: display, expanded: true)
            precondition(display.contains(layout.panel), "Expanded panel must stay on the physical display")
            precondition(!layout.pill.intersects(layout.list), "List must never cover the clickable pill")
            precondition(layout.pill.offsetBy(dx: layout.panel.minX, dy: layout.panel.minY).origin == anchor)
            let collapsed = overlayLayout(anchor: anchor, pillSize: pillSize, listSize: listSize, gap: 8 * factor, screen: display, expanded: false)
            precondition(collapsed.panel.origin == anchor, "Collapse must preserve even an anchor below the Dock")
        }
    }
}
let sample = #"{"connection":"connected","agents":[{"id":"a","projectName":"Project","workspaceName":"Workspace","name":"Agent","status":"running","startedAt":null}]}"#.data(using: .utf8)!
let decoded = try JSONDecoder().decode(Snapshot.self, from: sample)
precondition(decoded.agents.count == 1 && decoded.agents[0].status == "running")
precondition(decoded.agents[0].attentionTimestamp == nil)
let readCommand = MarkReadCommand(requestId: "00000000-0000-4000-8000-000000000001", agentId: "a", attentionTimestamp: "2026-10-15T10:00:00.000Z")
let readData = try JSONEncoder().encode(readCommand)
let readJSON = try JSONSerialization.jsonObject(with: readData) as! [String: Any]
precondition(readJSON["type"] as? String == "mark_read" && readJSON["agentId"] as? String == "a")
precondition(readJSON["attentionTimestamp"] as? String == "2026-10-15T10:00:00.000Z")
let replyData = Data(#"{"actionResult":{"requestId":"00000000-0000-4000-8000-000000000001","agentId":"a","success":true,"error":null}}"#.utf8)
let reply = try JSONDecoder().decode(ActionResultMessage.self, from: replyData)
precondition(reply.actionResult.success && reply.actionResult.agentId == "a")
let noticeData = #"{"notification":{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","agentName":"Agent","outcome":"completed"}}"#.data(using: .utf8)!
let notice = try JSONDecoder().decode(NotificationMessage.self, from: noticeData)
precondition(notice.notification.isValid)
precondition(!CompletionNotice(id: "invalid", agentName: "Agent", outcome: "completed").isValid)
precondition(!CompletionNotice(id: String(repeating: "a", count: 64), agentName: "Agent", outcome: "canceled").isValid)
precondition(conversationURL("paseo://h/srv_test/agent/agent_test", agentId: "agent_test") != nil)
precondition(conversationURL("paseo://h/srv_test/agent/a%2Fb%20%3F%23%E4%B8%AD%E6%96%87", agentId: "a/b ?#中文") != nil)
for invalid in ["https://example.com/", "file:///etc/passwd", "paseo://evil/srv_test/agent/agent_test", "paseo://h/srv_test/agent/agent_test?bad=1", "paseo://h/srv_test/agent/agent_test#bad", "paseo://user@h/srv_test/agent/agent_test", "paseo://h:123/srv_test/agent/agent_test", "paseo://h/srv_test/agent/another"] {
    precondition(conversationURL(invalid, agentId: "agent_test") == nil)
}
print("Native source compilation, appearance compatibility, compact pill layout, hit-testing, anchor geometry and protocol validation passed")
`);
 execFileSync('/usr/bin/xcrun',['swiftc','-framework','AppKit','-framework','UserNotifications','-target',`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macosx13.0`,'-module-cache-path',path.join(root,'modules'),'-o',binary,source],{stdio:'inherit',timeout:180000});
 execFileSync(binary,[],{stdio:'inherit',timeout:10000});
} finally {await rm(root,{recursive:true,force:true});}
