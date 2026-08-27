const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

// Helper to kill any afplay process synchronously and reliably
function killAllAudio() {
  try {
    execSync("killall -9 afplay 2>/dev/null", { stdio: "ignore" });
  } catch (e) {
    // Ignore error when no afplay process was running
  }
}

// Kill any audio playing from prior runs on startup
killAllAudio();

const songDir = fs.existsSync(path.join(__dirname, "songs"))
  ? path.join(__dirname, "songs")
  : path.join(__dirname, "..", "songs");

let allSongs = [];
let cursor = 0;
let currentMusicSelectionIndex = 0;
let isPaused = true;
let afPlayProcess = null;

function listSongs(songDirPath) {
  if (!fs.existsSync(songDirPath)) {
    fs.mkdirSync(songDirPath, { recursive: true });
  }
  allSongs = fs.readdirSync(songDirPath).filter((file) => !file.startsWith("."));
  if (allSongs.length === 0) return;

  process.stdout.write("\x1b[2;1H");

  const menuText = allSongs
    .map((songName, index) => {
      return `${index === cursor ? "> " : "  "}${songName}`;
    })
    .join("\n");

  process.stdout.write(menuText + "\n");
}

function stopCurrentSong() {
  if (afPlayProcess) {
    try {
      afPlayProcess.kill("SIGKILL");
    } catch (e) {}
    afPlayProcess = null;
  }
  // Synchronously kill any afplay processes on macOS
  killAllAudio();
  isPaused = true;
}

function playSong(songFinalPath) {
  stopCurrentSong();
  afPlayProcess = spawn("vlc", ['vlc', 'rc', songFinalPath], { stdio: "inherit" });
  isPaused = false;
  afPlayProcess.on("close", () => {
    afPlayProcess = null;
    isPaused = true;
  });
}

function cleanupAndExit() {
  stopCurrentSong();
  try {
    process.stdin.setRawMode(false);
  } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", cleanupAndExit);
process.on("SIGTERM", cleanupAndExit);
process.on("exit", () => {
  stopCurrentSong();
});

listSongs(songDir);

process.stdin.setRawMode(true);
process.stdin.resume();

process.stdin.on("data", (data) => {
  // Arrow keys detection
  // up arrow key -> Buffer 1b, 5b, 41(A)
  // down arrow key -> Buffer 1b, 5b, 42(B)
  // right arrow key -> Buffer 1b, 5b, 43(C)
  // left arrow key -> Buffer 1b, 5b, 44(D)
  if (data[0] === 0x1b && data[1] === 0x5b) {
    if (data[2] === 0x41) {
      // up arrow key with modulo wrap
      cursor = (cursor - 1 + allSongs.length) % allSongs.length;
    } else if (data[2] === 0x42) {
      // down arrow key with modulo wrap
      cursor = (cursor + 1) % allSongs.length;
    } else if (data[2] === 0x43) {
      // right arrow key
      console.log(">");
    } else if (data[2] === 0x44) {
      // left arrow key
      console.log("<");
    }

    listSongs(songDir);
    return;
  }

  // Enter key in raw mode (0x0d is \r, 0x0a is \n)
  if (data[0] === 0x0d || data[0] === 0x0a) {
    if (!allSongs || allSongs.length === 0) return;
    currentMusicSelectionIndex = cursor;
    const finalSong = path.join(songDir, allSongs[currentMusicSelectionIndex]);
    playSong(finalSong);
    return;
  }

  // Ctrl+C (0x03), Ctrl+D (0x04), or 'q' (0x71)
  if (data[0] === 0x03 || data[0] === 0x04 || data[0] === 0x71 || data[0] === 0x51) {
    cleanupAndExit();
  }

  // Play / Pause on Spacebar (0x20)
  if (data[0] === 0x20) {
    if (!afPlayProcess) return;
    // to stop/resume the process we will use SIGSTOP/SIGCONT command
    if (isPaused) {
      afPlayProcess.kill("SIGCONT");
      isPaused = false;
    } else {
      afPlayProcess.kill("SIGSTOP");
      isPaused = true;
    }
  }
});