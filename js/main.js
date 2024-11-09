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
const VideoType = {
    NOT_VIDEO: 0,
    VIDEO: 1,
    BANGUMI: 2
}
let video_r = /https?:\/\/.*\.bilibili\.com\/video\/([^?/]+).*/g
let bangumi_r = /https?:\/\/.*\.bilibili\.com\/bangumi\/play\/([^?/]+).*/g
let is_video, video_id, is_bangumi, video_type
function getInfo(href) {
    is_video = href.match(video_r)
    video_id = href.replace(video_r, "$1")
    is_bangumi = href.match(bangumi_r)
    if (is_bangumi) {
        video_id = href.replace(bangumi_r, "$1")
    }
    video_type = (is_video || is_bangumi) ? (is_video ? VideoType.VIDEO : VideoType.BANGUMI) : VideoType.NOT_VIDEO
    console.debug(is_video, video_id, is_bangumi, video_type)
}
getInfo(location.href)
let video = undefined
function get_video(delay=0) {
    if (video_type === VideoType.NOT_VIDEO) {
        return
    }
    setTimeout(() => {
        video = document.querySelector("video")
        if (video) {
            init_video(video)
            return
        }
        get_video(delay + 100)
    }, delay)
}
get_video()

function check_href(target, n=0) {
    if (n > 2) return null
    if (!target || !target.tagName) return null
    if (target.tagName.toLowerCase() === "a") {
        return target.href
    }
    return check_href(target.parentElement, n + 1)
}
document.addEventListener("click", e => {
    let target = e.target
    let href = check_href(target)
    if (href !== null) {
        getInfo(href)
        try {
            syncVideo()
        } catch (e) {
            // 有时会抛出无法发送 runtime 消息的问题，不知道原因
            console.warn(e)
        }
    }
})
function syncVideo() {
    if (video_type !== VideoType.NOT_VIDEO) {
        sendVideo(video_id, is_video ? MessageType.VIDEO_SWITCH_VIDEO : MessageType.VIDEO_SWITCH_BANGUMI)
    }
}
syncVideo()

class WindowElement {
    buttons = []
    inputs = []
    resolved = false
    closed = false
    createElementWithClass(tagName, className) {
        const element = document.createElement(tagName);
        element.classList.add(`${this.prefix}-${className}`);
        element.classList.add(this.prefix)
        return element;
    }
    constructor(prefix="syncbilibili") {
        this.prefix = prefix
        this.root = this.createElementWithClass("div", "root")
        this.titleBox =this.createElementWithClass("div", "title-box")
        this.title = this.createElementWithClass("span", "title")
        this.closeBtn = this.createElementWithClass("button", "close-btn")
        this.closeBtn.onclick = () => { this.close() }
        this.titleBox.appendChild(this.title)
        this.titleBox.appendChild(this.closeBtn)
        this.root.appendChild(this.titleBox)
        this.contentBox = this.createElementWithClass("div", "content-box")
        this.content = this.createElementWithClass("span", "content")
        this.contentBox.appendChild(this.content)
        this.root.appendChild(this.contentBox)
        this.inputBox = this.createElementWithClass("div", "input-box")
        this.root.appendChild(this.inputBox)
        this.buttonBox = this.createElementWithClass("div", "button-box")
        this.root.appendChild(this.buttonBox)
    }
    button(name, func=undefined) {
        const btn = this.createElementWithClass("button", "button")
        btn.innerHTML = name
        btn.onclick = () => {
            if (func === undefined) {
                this.close()
                return
            }
            const result = func(this.values())
            if (result !== undefined) {
                this.resolved = true
                this.resolve(result)
            }
        }
        this.buttons.push(btn)
        this.buttonBox.appendChild(btn)
        return this
    }
    setTitle(str) {
        this.title.innerHTML = str
        return this
    }
    setContent(str) {
        this.content.innerHTML = str
        return this
    }
    click(index=0) {
        if (this.buttons.length < index || index < 0) {
            throw "list index out of range"
        }
        this.buttons[index].click()
    }
    input(value=undefined) {
        const ipt = this.createElementWithClass("input", "input")
        if (value !== undefined) {
            ipt.value = value
        }
        this.inputs.push(ipt)
        this.inputBox.appendChild(ipt)
        return this
    }
    values() {
        const values = []
        for (const i of this.inputs) {
            values.push(i.value)
        }
        return values
    }
    close() {
        this.closed = true
        this.root.classList.add("closing")
        if (!this.resolved) {
            this.reject('closed')
        }
        setTimeout(() => {
            this.root.remove()
        }, 200)
    }
    show(root=document.body) {
        root.appendChild(this.root)
        return new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}
// const left_root = document.createElement("div")
// left_root.classList.add("left-root popup-root")
// document.body.appendChild(left_root)
// TODO: 优化弹出提示重叠问题
function popup(title, message, timeout=2000, right=true) {
    const win = new WindowElement()
        .setTitle(title)
        .setContent(message)
        .button("OK")
    offset_window(win, right)
    win.show().then(_ => {}).catch(_ => {})
    if (timeout > 0) {
        setTimeout(() => {
            win.close()
        }, timeout)
    }
}
function confirm(title, message, timeout=10000, right=true, ok="OK", cancel="Cancel", windowFunc=(_) => {}) {
    const win = new WindowElement()
        .setTitle(title)
        .setContent(message)
        .button(ok, () => {
            return true
        })
        .button(cancel, () => {
            return false
        })
    let resolve;
    const promise = new Promise((r, _) => {
        resolve = r
    })
    offset_window(win, right)
    windowFunc.call(win)
    win.show().then(r => {
        resolve(r)
        win.close()
    }).catch(_ => {})
    if (timeout > 0) {
        setTimeout(() => {
            win.close()
        }, timeout)
    }
    return promise
}
function offset_window(win, right=true) {
    if (!right) {
        win.root.style.right = "unset"
        win.root.style.left = "10px"
    }
}
let last_prompt
function prompt(title, message, default_value="", regex, x=5, right=true) {
    let resolve, reject, resolved = false
    let promise = new Promise((s, r) => {
        resolve = s
        reject = r
    })
    if (last_prompt && !last_prompt.closed) {
        last_prompt.close()
    }
    last_prompt = new WindowElement()
        .setTitle(title)
        .setContent(message)
        .input(default_value)
        .button("Cancel")
        .button("OK", values => {
            if (regex !== undefined && !values[0].match(regex)) {
                last_prompt.inputs[0].classList.add("warning")
                setTimeout(() => {
                    last_prompt.inputs[0].classList.remove("warning")
                }, 200)
                return
            }
            return values[0]
        })
    last_prompt.root.style.bottom = `${x}px`
    if (!right) {
        last_prompt.root.style.right = "unset"
        last_prompt.root.style.left = "10px"
        last_prompt.root.style.animationName = "popup-in-left"
        last_prompt.root.classList.add("left")
    }
    last_prompt.inputs[0].onkeydown = e => {
        if (e.key === "Enter") {
            last_prompt.click(1)
        }
    }
    last_prompt.show().then(value => {
        resolved = true
        last_prompt.close()
        resolve(value)
    }).catch(_ => {
        resolve(undefined)
    })
    return promise
}

class FloatingBox {
    createElementWithClass(tagName, className) {
        const element = document.createElement(tagName);
        element.classList.add(`${className}`);
        return element;
    }
    createButton(text) {
        const button = this.createElementWithClass("div", "button")
        button.innerHTML = text
        return button
    }
    constructor() {
        this.parent = document.createElement("div")
        this.root = this.createElementWithClass("div", "floating-box")
        this.floating = this.createElementWithClass("div", "floating")
        this.floating.innerHTML = `<?xml version="1.0" encoding="UTF-8"?><svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 24V11.8756L25.5 17.9378L36 24L25.5 30.0622L15 36.1244V24Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>`
        this.root.appendChild(this.floating)
        this.mainBox = this.createElementWithClass("div", "main-box")
        this.groupInfo = this.createElementWithClass("div", "group-info")
        this.groupName = this.createElementWithClass("span", "group-name")
        this.groupId = this.createElementWithClass("span", "group-id")
        this.createBtn = this.createButton('+')
        this.joinBtn = this.createButton('>')
        this.groupInfo.appendChild(this.groupName)
        this.groupInfo.appendChild(this.groupId)
        this.groupInfo.appendChild(this.createBtn)
        this.groupInfo.appendChild(this.joinBtn)
        this.mainBox.appendChild(this.groupInfo)
        this.messageList = this.createElementWithClass("div", "message-list")
        this.mainBox.appendChild(this.messageList)
        this.inputBox = this.createElementWithClass("div", "input-box")
        this.input = this.createElementWithClass("input", "input")
        this.sendBtn = this.createButton('发送')
        this.sendBtn.classList.add("send-btn")
        this.inputBox.appendChild(this.input)
        this.inputBox.appendChild(this.sendBtn)
        this.mainBox.appendChild(this.inputBox)
        this.root.appendChild(this.mainBox)
        this.parent.appendChild(this.root)
        document.body.appendChild(this.parent)
        let handler = setInterval(() => {
            document.body.appendChild(this.parent)
        }, 100)
        setTimeout(() => {
            clearInterval(handler)
        }, 2000)

        this.groupName.innerText = "Public Group"
        this.groupId.innerText = "10000"
        this.floating.onclick = () => {
            this.load()
            this.root.classList.add("open")
        }
        document.body.onclick = e => {
            if (e.target === this.root || this.root.contains(e.target) || e.target.classList.contains("syncbilibili")) {
                return
            }
            this.root.classList.toggle("open", false)
        }

        document.body.addEventListener("mousemove", e => {
            this.mousex = e.x
            this.mousey = e.y
        })

        this.createBtn.onclick = async () => {
            let [name, key] = await this.sharp_prompt(
                "提示",
                "请输入要创建的组名称和加入密钥，以 # 分隔: ",
                "Example#example_key",
                "请输入正确格式！"
            )
            if (!name) return
            chrome.runtime.sendMessage({action: "create", name: name, password: key}).then(r => {
                if (r.action !== "ok") {
                    popup("错误", r.action)
                    return
                }
                this.groupName.innerText = name
                this.groupId.innerText = r["group_id"]
                this.clear_message()
            })
        }
        this.joinBtn.onclick = async () => {
            let [gid, key] = await this.sharp_prompt(
                "提示",
                "请输入要加入的组ID和加入密钥，以 # 分隔: ",
                "10001#example_key",
                "请输入正确格式！"
            )
            if (!gid) return
            chrome.runtime.sendMessage({action: "join", group_id: gid * 1, password: key}).then(r => {
                if (r.action !== "ok") {
                    switch (r.action) {
                        case "group-not-found":
                            popup("错误", "该组不存在！")
                            this.joinBtn.click()
                            return
                        case "wrong-password":
                            popup("错误", "密码错误！")
                            this.joinBtn.click()
                            return
                        default:
                            console.error(r.action)
                            return
                    }
                }
                this.groupName.innerText = r.group_name
                this.groupId.innerText = gid
                this.clear_message()
            })
        }
        this.sendBtn.onclick = () => {
            let m = this.input.value
            chrome.runtime.sendMessage({action: "send", message: m}).then(r => {
                console.log(r)
                if (r.action === "ok") {
                    // this.message(m, r.username, 0)
                    this.input.value = ""
                }
            })
        }
        this.input.onkeydown = e => {
            if (e.key === "Enter" && !e.ctrlKey) {
                e.preventDefault()
                this.sendBtn.click()
            }
            e.stopPropagation()
        }
        this.inputBox.onkeyup = e => {
            e.stopPropagation()
        }
        this.load()
    }
    load() {
        chrome.runtime.sendMessage({action: "load"}).then(async s => {
            if (s.action === "need-login" || s.action === "invalid-session") {
                const msg = s.action === "need-login" ? "请输入用户名：" : "登录已过期，请重新登录："
                const name = await prompt("提示", msg, "", /[\x00-\xFF]{3,12}/ig)
                chrome.runtime.sendMessage({action: "login", name: name}).then(r => {
                    if (r.action !== "ok") {
                        if (r.action === "invalid-name") {
                            popup("警告", "请输入只包含数字、字母和半角符号的用户名！")
                            this.load()
                        }
                        return
                    }
                    popup("欢迎", `欢迎回来，${name}！`)
                })
                return
            }
            if (s.action === "sync-data") {
                this.groupName.innerHTML = s.group;
                this.groupId.innerHTML = s.group_id;
                this.messageList.innerHTML = "";
                for (const msg of s.messages) {
                    this.message(msg.message, msg.sender, msg.mode);
                }
            }
        })
    }
    message(message, sender, mode) {
        const messageBox = this.createElementWithClass("div", "message-box")
        const nickname = this.createElementWithClass("span", "nickname")
        const msg = this.createElementWithClass("span", "message")
        messageBox.appendChild(nickname)
        messageBox.appendChild(msg)
        if (mode === MessageType.SELF_MESSAGE || mode === MessageType.MEMBER_MESSAGE) {
            nickname.innerText = sender
            msg.innerText = message
            if (mode === MessageType.SELF_MESSAGE) {
                messageBox.classList.add("self")
            }
        } else {
            messageBox.classList.add("info")
            switch (mode) {
                case MessageType.MEMBER_LEAVE:
                    msg.innerText = `${sender} 离开了`
                    break
                case MessageType.MEMBER_JOIN:
                    msg.innerText = `${sender} 加入了`
                    break
                // case MessageType.VIDEO_PAUSE:
                //     msg.innerText = `${sender} 暂停了视频`
                //     break
                // case MessageType.VIDEO_PLAY:
                //     msg.innerText = `${sender} 播放了视频`
                //     break
                // case MessageType.VIDEO_SEEKED:
                //     msg.innerText = `${sender} 将视频跳转到了 ${Math.round(message)}s`
                //     break
                // case MessageType.VIDEO_SWITCH_VIDEO:
                //     msg.innerText = `${sender} 更换了视频为 ${message}`
                //     break
                // case MessageType.VIDEO_SWITCH_BANGUMI:
                //     msg.innerText = `${sender} 更换了番剧为 ${message}`
                //     break
            }
        }
        if (msg.innerText === "") {
            return
        }
        this.messageList.appendChild(messageBox);
        messageBox.scrollIntoView()
    }

    async sharp_prompt(title, msg, _default, warn) {
        const width = window.innerWidth
        const height = window.innerHeight
        let x = height - this.mousey - 100
        if (x < 10) {
            x = 10
        }
        let i = await prompt(title, msg, _default, undefined, x, this.mousex > width / 2)
        if (!i) return [null, null]
        if (i.split("#").length !== 2) {
            popup("警告", warn)
            return [null, null]
        }
        let s = i.split("#")
        return [s[0], s[1]]
    }

    clear_message() {
        this.messageList.innerHTML = ""
    }
}

const floatingBox = new FloatingBox()

function sendVideo(data, type) {
    chrome.runtime.sendMessage({action: "video", type: type, data: data}).then(_ => {})
}
chrome.runtime.sendMessage({action: "active"}).then(r => {
    if (r.action === "disconnect") {
        confirmRetry()
    }
})

function init_video(v) {
    if (!v) {
        console.debug("Failed to get video element.")
        return
    }
    console.debug("Success to get video element.")
    v.addEventListener("pause", () => {
        sendVideo(v.currentTime, MessageType.VIDEO_PAUSE)
    })

    v.addEventListener("play", () => {
        sendVideo(v.currentTime, MessageType.VIDEO_PLAY)
    })

    v.addEventListener("seeked", () => {
        sendVideo(v.currentTime, MessageType.VIDEO_SEEKED)
    })
}
let retry_win = []
function confirmRetry() {
    let win
    confirm(
        "警告",
        "与服务器断开连接...",
        -1,
        true,
        "重试", "取消",
        (w) => {
            w = win
            retry_win.push(w)
        }
    ).then(r => {
        if (r) {
            chrome.runtime.sendMessage({action: "retry"}).then(_ => {})
        }
        retry_win.splice(retry_win.indexOf(win), 1)
    })
}

// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//     listener(request).then(sendResponse)
// })
chrome.runtime.onConnect.addListener(port => {
    port.onMessage.addListener(message => {
        listener(message).then(m => {
            port.postMessage(m)
        })
    })
})
async function listener(request) {
    let action = request.action
    console.log(request)
    switch (action) {
        case "message":
            floatingBox.message(request.message, request.sender, request.mode)
            if (request.mode === MessageType.MEMBER_MESSAGE) {
                if (!floatingBox.root.classList.contains("open")) {
                    let mini = request.message
                    if (mini.length > 15) {
                        mini = mini.substring(0, 15) + "..."
                    }
                    popup("新消息", request.sender + ": " + mini)
                }
                break
            }
            if (request.self) break
            if (request.mode === MessageType.VIDEO_SWITCH_VIDEO || request.mode === MessageType.VIDEO_SWITCH_BANGUMI) {
                if (request.message === video_id) {
                    // 发送同步视频后其他端已载入视频将会再次发送一个相同的 video id，此时双方进度不同步，进行一次同步
                    sendVideo(video.currentTime, MessageType.VIDEO_SEEKED)
                    break
                }
                confirm(
                    "跳转",
                    `${request.sender} 想同步到视频 ${request.message}，是否跳转？`
                ).then(r => {
                    if (!r) {
                        sendVideo('', MessageType.VIDEO_SWITCH_DENY)
                        return
                    }
                    sendVideo('', MessageType.VIDEO_SWITCH_ACCEPT)
                    let prefix = "https://www.bilibili.com/"
                    if (request.mode === MessageType.VIDEO_SWITCH_VIDEO) {
                        location.href = prefix + "video/" + request.message
                    } else {
                        location.href = prefix + "bangumi/play/" + request.message
                    }
                })
                break
            }
            if (video_type === VideoType.NOT_VIDEO) break
            switch (request.mode) {
                case MessageType.VIDEO_PAUSE:
                    if (!video.paused) {
                        video.pause()
                        popup("提示", `${request.sender} 暂停了视频`)
                    }
                    break
                case MessageType.VIDEO_PLAY:
                    if (video.paused) {
                        video.play()
                        popup("提示", `${request.sender} 播放了视频`)
                    }
                    break
                case MessageType.VIDEO_SWITCH_ACCEPT:
                    popup("提示", `${request.sender} 同意了切换视频`)
                    return // 同意/取消 不发送视频进度
                case MessageType.VIDEO_SWITCH_DENY:
                    popup("提示", `${request.sender} 取消了切换视频`)
                    return // 同意/取消 不发送视频进度
            }
            let time = request.message * 1.0
            // 与其他端进度容错：2s
            if (Math.abs(time - video.currentTime) > 2) {
                video.currentTime = time
            }
            break
        case "disconnect":
            confirmRetry()
            break
        case "connected":
            for (let win of retry_win) {
                win.click(1)
            }
            retry_win = []
            popup("提示", "成功连接服务器!")
            break
    }
    return true
}
