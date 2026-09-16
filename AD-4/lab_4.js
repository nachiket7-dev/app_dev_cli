const { readdirSync } = require("fs");
const { join } = require("path");
const { spawn } = require("child_process");

const SONGS_DIR = join(__dirname, "..", "songs");

if (process.stdin.setRawMode) {
  process.stdin.setRawMode(true);
}

let user_input = 0;
let songs = undefined;
let player = undefined;
let song_is_playing = false;

function listSongs(directoryPath) {
  songs = readdirSync(directoryPath);
  process.stdout.write("\x1B[2J");
  process.stdout.write("\x1B[2;1H");

  let menuText = songs
    .map((ele, ind) => {
      if (user_input == ind) {
        return `> ${ele}`;
      } else {
        return `${ele}`;
      }
    })
    .join("\n");
  process.stdout.write(menuText);
}

function playSongs(directoryPath) {
  player = spawn("vlc", ["--intf", "rc", directoryPath], {
    stdio: "pipe"
  });
  // console.log(player)
}

listSongs(SONGS_DIR);

process.stdin.on("data", (data) => {
  console.log(data);
  if (data[0] == 0x0d) {
    if (!song_is_playing) {
      playSongs(join(SONGS_DIR, songs[user_input]));
      song_is_playing = true;
    } else {
      if (player) player.kill("SIGKILL");
      process.exit(0);
      song_is_playing = false;
    }
    return;
  }
  if (data[0] == 3) {
    if (player) player.kill("SIGKILL");
    process.exit(0);
    return;
  }
  if (data[0] == 0x20) {
    // player.kill('SIGSTOP')
    // player.kill('SIGKILL')
    // player.('SIGTERM')
    // player('SIGINT')
    if (player) {
      if (song_is_playing) {
        player.kill("SIGSTOP");
        song_is_playing = false;
      } else {
        player.kill("SIGCONT");
        song_is_playing = true;
      }
    }
  }
  if (data[0] == "0x6E") {
    if (player) player.kill("SIGTERM");
    user_input = Math.min(songs.length - 1, user_input + 1);
    listSongs(SONGS_DIR);
    playSongs(join(SONGS_DIR, songs[user_input]));
  }
  if (data[0] == "0x64") {
    if (player) player.kill("SIGTERM");
    user_input = Math.max(0, user_input - 1);
    listSongs(SONGS_DIR);
    playSongs(join(SONGS_DIR, songs[user_input]));
  }
  if (data[0] == 0x1b && data[1] == 0x5b) {
    if (data[2] == 0x41) {
      user_input = Math.max(0, user_input - 1);
      listSongs(SONGS_DIR);
    }
    if (data[2] == 0x42) {
      user_input = Math.min(songs.length - 1, user_input + 1);
      listSongs(SONGS_DIR);
    }
  }
  //   listSongs(SONGS_DIR);
});