let down = false
let count = 0
function makeHeart(x, y) {
    if (count < 2550) {
        count ++
    }
    document.body.style.background = `rgb(${count / 10},${count / 10},${count / 10})`
    let heart = document.createElement("span")
    heart.classList.add("heart")
    heart.style.left = `${x - 25 / 2 + Math.random() * 10}px`
    heart.style.top = `${y - 25 / 2 + Math.random() * 10}px`
    heart.innerHTML = "♥"
    document.body.appendChild(heart)
    setTimeout(() => {
        heart.remove()
    }, 750)
}
let x, y, handler
document.body.addEventListener("mousedown", e => {
    down = true
    makeHeart(e.x, e.y)
    setTimeout(() => {
        if (down) {
            handler = setInterval(() => {
                makeHeart(x, y)
            }, 80)
        }
    }, 1000)
})
document.body.addEventListener("mouseup", e => {
    down = false
    clearInterval(handler)
})
document.body.addEventListener("mousemove", e => {
    x = e.x
    y = e.y
})
