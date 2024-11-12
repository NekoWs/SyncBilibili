const MessageType = {
    SELF_MESSAGE: 0,
    MEMBER_MESSAGE: 1,
    MEMBER_LEAVE: 2,
    MEMBER_JOIN: 3,
    VIDEO_PAUSE: 4,
    VIDEO_PLAY: 5,
    VIDEO_SEEKED: 6,
    VIDEO_SWITCH_VIDEO: 7,
    VIDEO_SWITCH_BANGUMI: 8,
    VIDEO_SWITCH_ACCEPT: 9,
    VIDEO_SWITCH_DENY: 10
}
class Message {
    message; sender; timestamp; mode;
    constructor(message, sender, mode) {
        this.message = message;
        this.sender = sender;
        this.timestamp = Date.now();
        this.mode = mode;
    }
}

let ws
let opened = false
function connect() {
    ws = new WebSocket("wss://gomoku.cc:4001")

    ws.addEventListener("close", () => {
        sendMessage({action: "disconnect"})
        console.log("Disconnected...")
        opened = false
    })

    ws.addEventListener("open", () => {
        opened = true
        console.log("Connected!")
        sendMessage({action: "connected"})
    })

    ws.addEventListener("message", e => {
        let data
        try {
            data = JSON.parse(e.data)
        } catch (e) {
            console.error(e)
            return;
        }
        let action = data.action;
        switch (action) {
            case "message":
                message(data.message, data.sender, data.mode)
                // try {
                //     chrome.runtime.sendMessage(data).then(_ => {})
                // } catch (_) {}
                return
        }
        if (data.handler !== undefined) {
            let handler = data.handler
            if (handlers[handler]) {
                handlers[handler](data);
                handlers[handler] = undefined
                let clear = true
                for (const r of handlers) {
                    if (r !== undefined) {
                        clear = false
                    }
                }
                if (clear) {
                    handlers.splice(0)
                }
            }
        }
    })
}
connect()

const messages = []
const handlers = []
let username, session, group, group_id, ping, ping_start

chrome.storage.sync.get(["session"], s => {
    session = s.session
})
chrome.storage.sync.get(["username"], u => {
    username = u.username
})
let keepalive = undefined

function sendJson(data) {
    if (!opened) return
    let promise
    if (!data.handler) {
        data.handler = handlers.length
        let r
        promise = new Promise((resolve, _) => {
            r = resolve
        })
        handlers[data.handler] = r
    }
    ws.send(JSON.stringify(data));
    return promise
}

function sendSession(data) {
    if (!session) return // 若未登录则不发送消息到服务端减少消息量
    data = {session: session, ...data}
    return sendJson(data)
}

let ports = []
/*
    与所有 Port 进行通信
 */
function sendMessage(data) {
    const remove = []
    for (const port of ports) {
        try {
            port.postMessage(data)
        } catch (e) {
            remove.push(port)
        }
    }
    // 在 Port 失效时移除该 Port，通常抛出
    // Uncaught Error: Attempting to use a disconnected port object
    for (const p of remove) {
        ports.splice(ports.indexOf(p), 1)
    }
}

function message(message, sender, mode, ...args) {
    messages.push(new Message(message, sender, mode));
    // chrome.tabs.query({active: true}).then(tabs => {
    //     if (tabs.length < 1) return
    //     for (const tab of tabs) {
    //         if (!tab.url || !tab.url.match(/.*\.bilibili\.com\/video\/.*/g)) continue
    //         let data = {action: "message", message: message, sender: sender, mode: mode}
    //         data = {...data, ...args[0]}
    //         try {
    //             chrome.tabs.sendMessage(tab.id, data).then(_ => {})
    //         } catch (e) {
    //             console.warn(e)
    //         }
    //     }
    // })
    let data = {action: "message", message: message, sender: sender, mode: mode}
    data = {...data, ...args[0]}
    sendMessage(data)
}
function clear_messages() {
    messages.splice(0)
}

function startHeart() {
    clearInterval(keepalive)
    keepalive = setInterval(() => {
        if (!opened) return
        ping_start = Date.now()
        sendSession({mode: "heart"}).then(r => {
            if (r.action === "ok") {
                ping = Date.now() - ping_start
                return;
            }
            if (r.action === "invalid-session") {
                chrome.runtime.sendMessage(r).then(_ => {
                })
            }
        })
    }, 20000)
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    listener(request, sender).then(sendResponse)
    return true
})

async function listener(request, _) {
    let action = request.action
    let r
    console.debug("runtime message", request)
    switch (action) {
        case "load":
            if (session !== undefined) {
                let r = await sendSession({mode: "reconnect"})
                if (!r) return {action: "need-login"}
                if (r.action !== "ok") {
                    console.log(r.action)
                    if (r.action === "invalid-session") {
                        return {action: "invalid-session"}
                    }
                    return
                }
                group = r["group"]
                group_id = r["gid"]
                username = r["name"]
            }
            if (!username) {
                return {action: "need-login"}
            }
            startHeart()
            return {action: "sync-data", messages: messages, group: group, group_id: group_id, username: username, ping: ping}
        case "login":
            username = request.name;
            r = await sendJson({mode: "login", name: username})
            if (r.action === "ok") {
                session = r.session
                chrome.storage.sync.set({session: session, username: username}, () => {
                    console.log("User data saved.")
                })
                startHeart()
                return {action: "ok"}
            }
            return {action: r.action}
        case "send":
            r = await sendSession({mode: "send", message: request.message})
            if (!r) return {action: "need-login"}
            if (r.action !== "ok") {
                console.debug(r.action)
                return r
            }
            message(request.message, username, MessageType.SELF_MESSAGE)
            return {action: "ok", username: username}
        case "video":
            if (group_id === 10000) return
            r = await sendSession({mode: "video", data: request.data, type: request.type})
            if (!r) return {action: "need-login"}
            if (r.action !== "ok") {
                console.debug(r.action)
            }
            message(request.data, username, request.type, {self: true})
            return r
        case "create":
            r = await sendSession({mode: "create", group_name: request.name, password: request.password})
            if (!r) return {action: "need-login"}
            if (r.action === "ok") {
                group = request.name
                group_id = r.group_id
                clear_messages()
            }
            return r
        case "join":
            r = await sendSession({mode: "join", group_id: request.group_id, password: request.password})
            if (!r) return {action: "need-login"}
            if (r.action === "ok") {
                group = r.group_name
                group_id = request.group_id
                clear_messages()
            }
            return r
        case "retry":
            connect()
            return
        case "active":
            ports = []
            chrome.tabs.query({active: true}).then(tabs => {
                if (tabs.length < 1) return
                for (const tab of tabs) {
                    console.log("tab connected", tab)
                    if (!tab.url || !tab.url.match(/https?:\/\/.*\.bilibili\.com\/.*/g)) continue
                    let port
                    try {
                        port = chrome.tabs.connect(tab.id)
                    } catch (e) {
                        console.debug(`Cannot connect tab ${tab}, throw: ${e}`)
                        continue
                    }
                    ports.push(port)
                }
            })
            if (!opened) {
                return {action: "disconnect"}
            }
            return {action: "ok"}
        case "update":
            r = await sendJson({mode: "update"})
            if (r.action === "ok") {
                await chrome.storage.local.set({script: r.script})
                console.debug("Scripts saved.")
                return {action: "ok", script: r.script}
            }
            return {action: r.action}
    }
}
