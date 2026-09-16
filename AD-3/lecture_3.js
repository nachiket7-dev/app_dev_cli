const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const SONGS_DIR = path.join(__dirname, '..', 'songs')

let songs = undefined
let userSelectionIndex = 0;
let currentProcess = null;
let playingSongName = null;
let lastPlayTime = 0;

function stopSong() {
    if (currentProcess) {
        try {
            currentProcess.kill('SIGKILL')
        } catch (e) {}
        currentProcess = null
    }
}

// Ensure audio is stopped if process exits
process.on('exit', stopSong)
process.on('SIGINT', () => {
    stopSong()
    process.exit(0)
})

// List Available Songs to User2
function listSongs(songDirectoryPath) {
    console.clear()
    songs = fs.readdirSync(songDirectoryPath).filter((file) => file.endsWith(".mp3"))
    songs.forEach((song, ind) => {
        if (ind === userSelectionIndex) {
            console.log(`> ${song}`)
        } else {
            console.log(`  ${song}`)
        }
    })
    console.log("\n")
    if (playingSongName) {
        console.log(`Now Playing: ${playingSongName}`)
    } else {
        console.log("Press Enter to play selected song | Up/Down to navigate | Ctrl+C to exit")
    }
}

// Play Song
function playSong(songFilePath, songName) {
    stopSong()
    playingSongName = songName
    currentProcess = spawn(
        'afplay',
        [songFilePath],
        { stdio: 'ignore' }
    )
    currentProcess.on('exit', () => {
        currentProcess = null
    })
    currentProcess.on('error', (err) => {
        console.error("Playback error:", err)
    })
}

listSongs(SONGS_DIR)

// Take User Song Selection
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
}
process.stdin.resume()
process.stdin.on('data', (rawUserInput) => {
    const str = rawUserInput.toString()

    // Ctrl+C
    if (rawUserInput[0] === 0x03 || str === '\u0003') {
        stopSong()
        process.exit(0)
    }

    // Enter Key (debounced for rapid CR/LF)
    if (rawUserInput[0] === 0x0d || rawUserInput[0] === 0x0a || str === '\r' || str === '\n') {
        const now = Date.now()
        if (now - lastPlayTime > 300) {
            lastPlayTime = now
            if (songs && songs[userSelectionIndex]) {
                const selectedSong = songs[userSelectionIndex]
                playSong(path.join(SONGS_DIR, selectedSong), selectedSong)
            }
        }
    }

    // Up Arrow Key
    if (str === '\u001b[A' || str === '\u001bOA' || (rawUserInput[0] === 0x1b && rawUserInput[rawUserInput.length - 1] === 0x41)) {
        userSelectionIndex = Math.max(0, userSelectionIndex - 1)
    }

    // Down Arrow Key
    if (str === '\u001b[B' || str === '\u001bOB' || (rawUserInput[0] === 0x1b && rawUserInput[rawUserInput.length - 1] === 0x42)) {
        if (songs) {
            userSelectionIndex = Math.min(songs.length - 1, userSelectionIndex + 1)
        }
    }

    listSongs(SONGS_DIR)
})