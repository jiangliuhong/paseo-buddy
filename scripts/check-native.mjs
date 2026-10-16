import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nativeSource } from '../build/server/native-source.js';
import { quickChatCommandSchema } from '../build/shared/quick-chat.js';
const chatOptionsFixture = {
 projects:[{id:'project',name:'paseo-buddy'}],workspaces:[{id:'existing',projectId:'project',name:'main'}],
 profiles:[{id:'profile',name:'(My)编码',providerId:'codex',modelId:'model',modeId:'review',thinkingOptionId:'medium'}],
 providers:[{id:'codex',name:'Codex'}],models:[{id:'model',name:'Model',isDefault:true,thinkingOptions:[{id:'medium',name:'Medium'}]}],
};
if(process.platform!=='darwin')throw Error('Native checks require macOS and Apple developer tools');
const root=await mkdtemp(path.join(os.tmpdir(),'buddy-native-check-'));
const renderDirectory=process.argv.includes('--render')?path.resolve('work/native-qa'):null;
if(renderDirectory)await mkdir(renderDirectory,{recursive:true});
try {
 const source=path.join(root,'Check.swift');const binary=path.join(root,'Check');
 const app=nativeSource.slice(0,nativeSource.indexOf('let app = NSApplication.shared'));
 await writeFile(source,app+`\nlet chatOptionsFixtureData = Data(#"${JSON.stringify(chatOptionsFixture)}"#.utf8)\n`+String.raw`
let checkApplication = NSApplication.shared
func renderChat(_ view: QuickChatView, _ name: String) throws {
    guard CommandLine.arguments.count > 1 else { return }
    let rect = NSRect(x:0,y:0,width:410,height:view.preferredHeight)
    let window = NSWindow(contentRect:rect,styleMask:.borderless,backing:.buffered,defer:false)
    window.appearance = NSAppearance(named:name.contains("dark") ? .darkAqua : .aqua)
    window.isReleasedWhenClosed = false
    let surface = NSView(frame:rect); surface.wantsLayer = true
    surface.layer?.cornerRadius = 20; window.contentView = surface
    view.frame = rect; surface.addSubview(view)
    window.effectiveAppearance.performAsCurrentDrawingAppearance {
        surface.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        view.render(); surface.layoutSubtreeIfNeeded()
    }
    guard let bitmap = surface.bitmapImageRepForCachingDisplay(in:surface.bounds) else { preconditionFailure("Missing native bitmap") }
    surface.cacheDisplay(in:surface.bounds,to:bitmap)
    guard let data = bitmap.representation(using:.png,properties:[:]) else { preconditionFailure("Missing native PNG") }
    try data.write(to:URL(fileURLWithPath:CommandLine.arguments[1]).appendingPathComponent(name+".png"))
    view.removeFromSuperview(); window.close()
}
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
        let center = NSPoint(x: hitPill.frame.minX + 4 * factor, y: hitPill.frame.midY)
        precondition(hitRoot.hitTest(center) === hitPill, "Expanded pill must remain clickable")
        precondition(hitPill.hitTest(center) === hitPill, "Pill hit-testing must account for its frame origin")
        let outside = NSPoint(x: hitPill.frame.maxX + 1, y: hitPill.frame.midY)
        precondition(hitPill.hitTest(outside) == nil)
    }
}
// Background clicks must toggle immediately without first activating the accessory panel.
precondition(hitPill.acceptsFirstMouse(for: nil))
precondition(hitPill.chatButton.acceptsFirstMouse(for: nil) && hitPill.listButton.acceptsFirstMouse(for: nil))
for factor: CGFloat in [0.75, 1, 1.5] {
    hitPill.scale = factor; hitPill.frame.size = hitPill.preferredSize
    hitPill.needsLayout = true; hitPill.layoutSubtreeIfNeeded()
    precondition(!hitPill.chatButton.frame.intersects(hitPill.listButton.frame))
    let chatPoint = NSPoint(x: hitPill.frame.minX + hitPill.chatButton.frame.midX, y: hitPill.frame.minY + hitPill.chatButton.frame.midY)
    precondition(hitRoot.hitTest(chatPoint) === hitPill.chatButton)
    let listPoint = NSPoint(x: hitPill.frame.minX + hitPill.listButton.frame.midX, y: hitPill.frame.minY + hitPill.listButton.frame.midY)
    precondition(hitRoot.hitTest(listPoint) === hitPill.listButton)
}
let minimalChatPill = pillContentLayout(showIcon: false, showText: false, textWidth: 0, running: "", unread: "", showQuickChat: true)
precondition(minimalChatPill.quickChatX == 0 && minimalChatPill.controlX == 40 && minimalChatPill.width == 84)
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
// Run the actual native controller against an injected in-memory pipe, never a daemon.
let optionsObject = try JSONSerialization.jsonObject(with: chatOptionsFixtureData) as! [String: Any]
func optionsReply(_ command: ChatCommand, profiles: Bool = true) throws -> ChatReply {
    var options = optionsObject
    if !profiles { options["profiles"] = [] }
    return try JSONDecoder().decode(ChatReply.self, from: JSONSerialization.data(withJSONObject:
        ["kind":"result", "requestId":command.requestId, "ok":true, "error":NSNull(), "options":options]))
}
func sessionFixture(_ draftId: String, delivery: String = "accepted", status: String = "idle", messageId: String? = nil) throws -> ChatSession {
    let rows: [[String: Any]] = messageId.map { [["key":"epoch:0:0","role":"user","text":"你好，测试新对话","messageId":$0,"truncated":false],
        ["key":"epoch:1:1","role":"assistant","text":"这里是 AppKit 组件测试的模拟回复，未连接真实模型。\n\n可以在下方继续输入消息。","truncated":false]] } ?? []
    return try JSONDecoder().decode(ChatSession.self, from: JSONSerialization.data(withJSONObject:
        ["sessionId":draftId,"projectId":"project","workspaceId":"existing","workspaceName":"Paseo 自动命名",
         "agentId":"00000000-0000-4000-8000-000000000002","agentReady":true,"connection":"connected","status":status,
         "delivery":delivery,"epoch":"epoch","messages":rows,"partial":false,"error":NSNull()]))
}
let chat = QuickChatView(frame: NSRect(x:0,y:0,width:410,height:332))
var chatCommands: [ChatCommand] = []
chat.sendCommand = { chatCommands.append($0) }
chat.opened()
precondition(chatCommands.count == 1 && chatCommands[0].type == "quick_chat_options")
chat.receive(try optionsReply(chatCommands.last!))
precondition(chatCommands.last!.projectId == "project")
chat.receive(try optionsReply(chatCommands.last!))
precondition(chat.projectId == "project" && chat.workspaceId == "existing")
precondition(chat.editor.string.isEmpty && !chat.sendButton.isEnabled)
chat.showModels()
let profileChoice = ChatChoiceButton(); profileChoice.choiceKind = "profile"; profileChoice.choiceId = "profile"
chat.choose(profileChoice)
precondition(!chat.pickerOpen && chat.selection?.profileId == "profile")
chat.workspacePicker.selectItem(at:0); chat.workspaceChanged()
chat.editor.string = "你好，测试新对话"; chat.textDidChange(Notification(name:NSText.didChangeNotification))
precondition(chat.sendButton.isEnabled && chat.preferredHeight == 332)
precondition(chat.targetLabel.frame.maxY < chat.composeSurface.frame.minY, "Compact launch controls must not overlap the composer")
try renderChat(chat,"launch")
try renderChat(chat,"launch-dark")
chat.showModels(); try renderChat(chat,"profiles"); _ = chat.dismissPicker()
chat.submit()
let nativeCreate = chatCommands.last!
precondition(nativeCreate.type == "quick_chat_create" && nativeCreate.workspaceId == nil && nativeCreate.selection?.kind == "profile")
precondition(!chat.editor.isEditable && !chat.sendButton.isEnabled)
// A server-certified pre-write rejection unlocks the draft without losing text.
let editableChat = QuickChatView(frame:NSRect(x:0,y:0,width:410,height:332))
editableChat.options = chat.options; editableChat.projectId = "project"; editableChat.loadedProjectId = "project"
editableChat.selection = ChatSelection(kind:"profile",profileId:"deleted"); editableChat.editor.string = "保留这段草稿"
editableChat.sendCommand = { chatCommands.append($0) }; editableChat.submit()
let rejectedCommand = editableChat.mutation!
let editableReply = try JSONDecoder().decode(ChatReply.self,from:JSONSerialization.data(withJSONObject:
    ["kind":"result","requestId":rejectedCommand.requestId,"ok":false,"error":"invalid_selection","draftEditable":true]))
editableChat.receive(editableReply)
precondition(editableChat.mutation == nil && editableChat.session == nil && editableChat.editor.isEditable)
precondition(editableChat.editor.string == "保留这段草稿" && editableChat.draftId != rejectedCommand.draftId)
precondition(editableChat.optionsCommand?.type == "quick_chat_options")
editableChat.receive(try optionsReply(editableChat.optionsCommand!))
precondition(editableChat.modelButton.isEnabled && editableChat.projectPicker.isEnabled)
let createJSON = try JSONSerialization.jsonObject(with: nativeCreate.data!) as! [String: Any]
precondition(createJSON["workspaceId"] is NSNull && createJSON["title"] == nil && createJSON["cwd"] == nil)
let failedReply = try JSONDecoder().decode(ChatReply.self, from: JSONSerialization.data(withJSONObject:
    ["kind":"result","requestId":nativeCreate.requestId,"ok":false,"error":"outcome_unknown"]))
chat.receive(failedReply)
precondition(chat.mutation != nil && !chat.editor.isEditable && chat.editor.string == nativeCreate.text,
             "An unknown creation outcome must preserve the immutable mutation")
chat.retry()
precondition(chatCommands.last!.data == nativeCreate.data, "Explicit retry must retain the exact mutation identity and content")
let acceptedSession = try sessionFixture(chat.draftId, messageId:nativeCreate.messageId)
chat.session = acceptedSession; chat.reconcileDelivery(acceptedSession); chat.render()
precondition(chat.mutation == nil && chat.editor.string.isEmpty && chat.editor.isEditable)
try renderChat(chat,"conversation")
chat.editor.string = "接着聊"; chat.editor.setSelectedRange(NSRange(location:2,length:0))
chat.render()
precondition(chat.editor.string == "接着聊" && chat.editor.selectedRange() == NSRange(location:2,length:0))
chat.submit()
precondition(chatCommands.last!.type == "quick_chat_send" && chatCommands.last!.sessionId == chat.draftId)
let runningChatSession = try sessionFixture(chat.draftId,status:"running")
let waitingChatSession = try sessionFixture(chat.draftId,status:"waiting_permission")
let unknownChatSession = try sessionFixture(chat.draftId,delivery:"unknown")
precondition(!chatCanSend(session:runningChatSession,pending:false,selected:true,text:"x"))
precondition(!chatCanSend(session:waitingChatSession,pending:false,selected:true,text:"x"))
precondition(!chatCanSend(session:unknownChatSession,pending:false,selected:true,text:"x"))
precondition(!chatCanSend(session:nil,pending:false,selected:true,text:String(repeating:"🐾",count:8001)))
chat.mutationStarted = Date(timeIntervalSinceNow:-31); chat.tick()
precondition(chat.mutationStarted == nil && chat.mutation != nil && chat.errorText != nil)
chat.mutation = nil; chat.requestResume()
precondition(chatCommands.last!.type == "quick_chat_resume")
var closed = false; let beforeClose = chatCommands.count; chat.dismissed = { closed = true }; chat.closeChat()
precondition(closed && chatCommands.count == beforeClose && chat.session != nil && chat.editor.string == "接着聊")
let manual = QuickChatView(frame:NSRect(x:0,y:0,width:410,height:332))
manual.sendCommand = { chatCommands.append($0) }; manual.opened()
manual.receive(try optionsReply(chatCommands.last!,profiles:false)); manual.receive(try optionsReply(chatCommands.last!,profiles:false))
manual.showModels()
let providerChoice = ChatChoiceButton(); providerChoice.choiceKind = "provider"; providerChoice.choiceId = "codex"
manual.choose(providerChoice)
precondition(chatCommands.last!.type == "quick_chat_options" && chatCommands.last!.providerId == "codex")
manual.receive(try optionsReply(chatCommands.last!,profiles:false))
let modelChoice = ChatChoiceButton(); modelChoice.choiceKind = "model"; modelChoice.choiceId = "model"
manual.choose(modelChoice); manual.editor.string = "manual"; manual.submit()
precondition(chatCommands.last!.selection == ChatSelection(kind:"model",providerId:"codex",modelId:"model"))
let recoveringChat = QuickChatView(frame:NSRect(x:0,y:0,width:410,height:332))
recoveringChat.options = try JSONDecoder().decode(ChatOptions.self,from:chatOptionsFixtureData)
recoveringChat.projectId = "project"; recoveringChat.loadedProjectId = "project"
recoveringChat.selection = ChatSelection(kind:"profile",profileId:"profile"); recoveringChat.editor.string = "recover"
recoveringChat.sendCommand = { chatCommands.append($0) }; recoveringChat.submit()
let originalRecoverCommand = recoveringChat.mutation!
let resyncSignal = try JSONDecoder().decode(ChatReply.self,from:Data(#"{"kind":"resync_required"}"#.utf8))
recoveringChat.receive(resyncSignal)
precondition(chatCommands.last!.type == "quick_chat_resume" && chatCommands.last!.sessionId == recoveringChat.draftId)
precondition(recoveringChat.mutation!.data == originalRecoverCommand.data, "Resync may read state but must not replay or replace an unconfirmed mutation")
let readCount = chatCommands.count; recoveringChat.retry()
precondition(chatCommands.count == readCount, "An outstanding recovery read disables mutation retry")
for factor: CGFloat in [0.75,1,1.5] {
    manual.scale = factor; manual.frame = NSRect(x:0,y:0,width:410*factor,height:manual.preferredHeight)
    manual.needsLayout = true; manual.layoutSubtreeIfNeeded()
    precondition(!manual.projectPicker.frame.intersects(manual.modelButton.frame))
    precondition(manual.targetLabel.frame.maxY < manual.composeSurface.frame.minY)
}
for command in chatCommands { print("CHAT_COMMAND " + String(data:command.data!,encoding:.utf8)!.trimmingCharacters(in:.newlines)) }
print("Native source compilation, appearance compatibility, compact pill layout, hit-testing, anchor geometry and protocol validation passed")
`);
 execFileSync('/usr/bin/xcrun',['swiftc','-framework','AppKit','-framework','UserNotifications','-target',`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macosx13.0`,'-module-cache-path',path.join(root,'modules'),'-o',binary,source],{stdio:'inherit',timeout:180000});
 const output=execFileSync(binary,renderDirectory?[renderDirectory]:[],{stdio:['ignore','pipe','inherit'],encoding:'utf8',timeout:15000});
 let commands=0;
 for(const line of output.split('\n')) {
  if(line.startsWith('CHAT_COMMAND ')){quickChatCommandSchema.parse(JSON.parse(line.slice('CHAT_COMMAND '.length)));commands++;}
  else if(line)console.log(line);
 }
 if(commands<5)throw Error('Native quick-chat command checks did not run');
 console.log(`Native quick-chat controller and ${commands} cross-runtime command contracts passed`);
} finally {await rm(root,{recursive:true,force:true});}
