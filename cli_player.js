const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const songDir = fs.existsSync(path.join(__dirname, 'songs'))
    ? path.join(__dirname, 'songs')
    : path.join(__dirname, '..', 'songs');

let allSongs = null;
let cursor = 0;
let isPaused = true;
let vlcPlayProcess = undefined;
let trackingInterval = null;

let totalDuration = undefined;
let timeElapsed = 0;
let startTime = null;
let pausedAt = null;
let totalPausedTime = 0;

// Volume & Playback Settings
let volume = 80;
let isMuted = false;
let prevVolume = 80;
let repeatMode = 'all'; // 'off' | 'one' | 'all'

function formatTime(seconds) {
    if (seconds === undefined || isNaN(seconds)) return "00:00";
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function getSongDuration(songFilePath) {
    return new Promise((resolve) => {
        const afinfoCP = spawn("afinfo", [songFilePath]);
        let output = "";

        afinfoCP.stdout.on('data', (data) => {
            output += data.toString();
        });

        afinfoCP.on('close', () => {
            if (output.includes("estimated duration: ")) {
                const durationStr = output.split("estimated duration: ")[1].split(".")[0];
                resolve(Number(durationStr) + 1);
            } else {
                resolve(60);
            }
        });

        afinfoCP.on('error', () => {
            resolve(60);
        });
    });
}

function updateTimeElapsed() {
    if (!startTime) {
        timeElapsed = 0;
        return;
    }
    if (isPaused && pausedAt) {
        timeElapsed = Math.max(0, (pausedAt - startTime - totalPausedTime) / 1000);
    } else {
        timeElapsed = Math.max(0, (Date.now() - startTime - totalPausedTime) / 1000);
    }
    if (totalDuration && timeElapsed >= totalDuration) {
        timeElapsed = totalDuration;
    }
}

function startElapsedTracking() {
    startTime = Date.now();
    pausedAt = null;
    totalPausedTime = 0;
    timeElapsed = 0;
    resumeElapsedTracking();
}

function resumeElapsedTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }
    let lastRenderedSec = -1;
    trackingInterval = setInterval(() => {
        if (vlcPlayProcess !== undefined && !isPaused) {
            updateTimeElapsed();
            const currentSec = Math.floor(timeElapsed);
            if (currentSec !== lastRenderedSec) {
                lastRenderedSec = currentSec;
                listSongs(songDir);
            }
            // Watchdog: If song finished and VLC hasn't closed yet, auto-advance
            if (totalDuration && timeElapsed >= totalDuration) {
                advanceToNextTrack();
            }
        }
    }, 200);
}

// Sleek modern progress slider with glowing playhead
function renderProgressBar(percentagePlayed, width = 48) {
    const p = Math.max(0, Math.min(100, percentagePlayed));
    const filled = Math.round((p / 100) * width);
    const head = filled < width ? "\x1b[1;37m●\x1b[0m" : "";
    const done = filled > 0 ? "\x1b[36m" + "━".repeat(Math.max(0, filled - 1)) + "\x1b[0m" : "";
    const rest = "\x1b[90m" + "─".repeat(Math.max(0, width - filled)) + "\x1b[0m";
    return `\x1b[90m[\x1b[0m${done}${head}${rest}\x1b[90m]\x1b[0m`;
}

// Compact, crisp volume bar
function renderVolumeBar(vol, muted) {
    const BAR_WIDTH = 10;
    if (muted) {
        return `\x1b[90m[\x1b[31mMUTED\x1b[90m] \x1b[90m[░░░░░░░░░░]   0%\x1b[0m`;
    }
    const filled = Math.round((vol / 100) * BAR_WIDTH);
    const done = "\x1b[33m" + "█".repeat(filled) + "\x1b[0m";
    const rest = "\x1b[90m" + "░".repeat(BAR_WIDTH - filled) + "\x1b[0m";
    return `\x1b[90m[\x1b[0m${done}${rest}\x1b[90m]\x1b[0m ${String(vol).padStart(3, ' ')}%`;
}

function listSongs(songDirPath) {
    if (!fs.existsSync(songDirPath)) {
        process.stdout.write("\x1B[H\x1B[0JDirectory not found: " + songDirPath + "\n");
        return;
    }
    allSongs = fs.readdirSync(songDirPath).filter(f => !f.startsWith('.'));
    if (allSongs.length === 0) {
        process.stdout.write("\x1B[H\x1B[0JNo songs found in " + songDirPath + "\n");
        return;
    }

    let output = "\x1B[H\x1B[2J\x1B[1m=== CLI MUSIC PLAYER ===\x1B[0m\n\n";

    allSongs.forEach((songName, index) => {
        if (index === cursor) {
            output += `\x1B[32m> ${songName}\x1B[0m\n`;
        } else {
            output += `  ${songName}\n`;
        }
    });

    output += "\n";

    const repeatBadge = repeatMode === 'one'
        ? '\x1b[35m[🔂 ONE]\x1b[0m'
        : (repeatMode === 'all' ? '\x1b[32m[🔁 ALL]\x1b[0m' : '\x1b[90m[OFF]\x1b[0m');

    if (totalDuration !== undefined && totalDuration > 0) {
        const percentagePlayed = Math.min(100, (timeElapsed / totalDuration) * 100);
        const statusLabel = isPaused ? "\x1b[1;33m⏸ PAUSED \x1b[0m" : "\x1b[1;32m▶ PLAYING\x1b[0m";

        output += `${statusLabel}  ${formatTime(timeElapsed)} / ${formatTime(totalDuration)} \x1b[90m(${percentagePlayed.toFixed(1)}%)\x1b[0m   Repeat: ${repeatBadge}\n`;
        output += `${renderProgressBar(percentagePlayed)}\n`;
        output += `Volume:  ${renderVolumeBar(volume, isMuted)}\n\n`;
    } else {
        output += `Select a song and press \x1b[1m[Enter]\x1b[0m to play.   Repeat: ${repeatBadge}\n`;
        output += `Volume:  ${renderVolumeBar(volume, isMuted)}\n\n`;
    }

    output += `\x1b[90mControls: [↑/↓] Select | [Enter] Play | [Space/p] Pause | [←/→] Seek 10s\n`;
    output += `          [-/=] Volume | [m] Mute     | [n/b] Next/Prev | [r] Repeat   | [q] Quit\x1b[0m`;

    process.stdout.write(output);
}

function sendVlcVolume() {
    if (vlcPlayProcess !== undefined) {
        const effectiveVol = isMuted ? 0 : volume;
        const vlcVol = Math.round((effectiveVol / 100) * 256);
        vlcPlayProcess.stdin.write(`volume ${vlcVol}\n`);
    }
}

async function playSong(cursorIndex) {
    cursor = cursorIndex;
    if (vlcPlayProcess !== undefined) {
        const oldProcess = vlcPlayProcess;
        vlcPlayProcess = undefined;
        oldProcess.removeAllListeners('close');
        oldProcess.removeAllListeners('exit');
        try {
            oldProcess.kill('SIGKILL');
        } catch (e) {}
    }

    const songFinalPath = path.join(songDir, allSongs[cursorIndex]);
    totalDuration = await getSongDuration(songFinalPath);

    isPaused = false;
    startElapsedTracking();

    const cp = spawn('vlc', ["-I", "rc", "--no-video", "--play-and-exit", songFinalPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    cp.stdout.resume();
    cp.stderr.resume();

    vlcPlayProcess = cp;
    sendVlcVolume();

    cp.on('close', () => {
        if (vlcPlayProcess === cp) {
            vlcPlayProcess = undefined;
            if (trackingInterval) {
                clearInterval(trackingInterval);
                trackingInterval = null;
            }
            advanceToNextTrack();
        }
    });
}

function advanceToNextTrack() {
    if (repeatMode === 'one') {
        playSong(cursor);
    } else if (repeatMode === 'all') {
        const nextIndex = (cursor + 1) % allSongs.length;
        playSong(nextIndex);
    } else {
        if (cursor < allSongs.length - 1) {
            playSong(cursor + 1);
        } else {
            isPaused = true;
            listSongs(songDir);
        }
    }
}

function cleanupAndExit() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }
    if (vlcPlayProcess !== undefined) {
        const oldProcess = vlcPlayProcess;
        vlcPlayProcess = undefined;
        oldProcess.removeAllListeners('close');
        try {
            oldProcess.kill('SIGKILL');
        } catch (e) {}
    }
    process.stdout.write('\x1b[?1049l\x1b[?25h\x1b[0m\n');
    process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
process.on('exit', () => {
    if (vlcPlayProcess !== undefined) {
        try {
            vlcPlayProcess.kill('SIGKILL');
        } catch (e) {}
    }
    process.stdout.write('\x1b[?1049l\x1b[?25h\x1b[0m');
});

// Switch to alternate screen buffer (like vim/htop) and hide cursor to completely isolate scrollback
process.stdout.write('\x1b[?1049h\x1b[?25l');
listSongs(songDir);

if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (data) => {
    // Arrow keys detection
    if (data[0] === 0x1b) {
        if (data[1] === 0x5b) {
            if (data[2] === 0x41) {
                // up arrow key
                cursor = ((cursor - 1) % allSongs.length);
                if (cursor < 0) {
                    cursor += allSongs.length;
                }
            } else if (data[2] === 0x42) {
                // down arrow key
                cursor = (cursor + 1) % allSongs.length;
            } else if (data[2] === 0x43) {
                // right arrow key: Seek Forward +10s
                if (vlcPlayProcess !== undefined && totalDuration) {
                    timeElapsed = Math.min(totalDuration, timeElapsed + 10);
                    startTime = startTime - 10000;
                    vlcPlayProcess.stdin.write('seek +10\n');
                }
            } else if (data[2] === 0x44) {
                // left arrow key: Seek Backward -10s
                if (vlcPlayProcess !== undefined) {
                    timeElapsed = Math.max(0, timeElapsed - 10);
                    startTime = startTime + 10000;
                    vlcPlayProcess.stdin.write('seek -10\n');
                }
            }
        }

        listSongs(songDir);
        return;
    }

    // Volume Down: '-' (45) or '_' (95)
    if (data[0] === 45 || data[0] === 95) {
        isMuted = false;
        volume = Math.max(0, volume - 5);
        sendVlcVolume();
        listSongs(songDir);
        return;
    }

    // Volume Up: '=' (61) or '+' (43)
    if (data[0] === 61 || data[0] === 43) {
        isMuted = false;
        volume = Math.min(100, volume + 5);
        sendVlcVolume();
        listSongs(songDir);
        return;
    }

    // Mute toggle: 'm' (109)
    if (data[0] === 109) {
        isMuted = !isMuted;
        sendVlcVolume();
        listSongs(songDir);
        return;
    }

    // Repeat mode toggle: 'r' (114)
    if (data[0] === 114) {
        if (repeatMode === 'off') repeatMode = 'one';
        else if (repeatMode === 'one') repeatMode = 'all';
        else repeatMode = 'off';
        listSongs(songDir);
        return;
    }

    // Next track: 'n' (110)
    if (data[0] === 110) {
        cursor = (cursor + 1) % allSongs.length;
        listSongs(songDir);
        playSong(cursor);
        return;
    }

    // Prev track: 'b' (98)
    if (data[0] === 98) {
        cursor = ((cursor - 1) % allSongs.length);
        if (cursor < 0) {
            cursor += allSongs.length;
        }
        listSongs(songDir);
        playSong(cursor);
        return;
    }

    // Enter to play (0x0d or 0x0a)
    if (data[0] === 0x0d || data[0] === 0x0a) {
        playSong(cursor);
        return;
    }

    // Quit: Ctrl+C (0x03) or 'q' (0x71)
    if (data[0] === 0x03 || data[0] === 0x71) {
        cleanupAndExit();
    }

    // Play/Pause: 'p' (112) or Space (32)
    if (data[0] === 112 || data[0] === 32) {
        if (vlcPlayProcess !== undefined) {
            isPaused = !isPaused;
            if (isPaused) {
                pausedAt = Date.now();
                if (trackingInterval) {
                    clearInterval(trackingInterval);
                    trackingInterval = null;
                }
            } else {
                if (pausedAt) {
                    totalPausedTime += Date.now() - pausedAt;
                    pausedAt = null;
                }
                resumeElapsedTracking();
            }
            vlcPlayProcess.stdin.write('pause\n');
            listSongs(songDir);
        } else if (allSongs && allSongs.length > 0) {
            playSong(cursor);
        }
    }
});