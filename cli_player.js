const { spawn } = require("child_process");

const { join } = require("path");
const { readdirSync } = require("fs");


const SONGS_DIR = "./songs";
let output = '';

let songs = undefined;
function listSongs(directory_path) {
  const scanner = spawn("ls", [directory_path]);
  scanner.stdout.on("data", (data) => {
    songs = data.toString().trim().split("\n");
    songs.forEach((song, index) => {
      console.log(`${index}: ${song}`);
    });
  });
  // Input: Folder Path || Output: Content of folder || ls
}

function playSong(song_path) {
   const player = spawn(
      'afplay', [song_path]
   )
  // Input: Name & Path of the song || Output: Play the Song
}
listSongs(SONGS_DIR)
process.stdin.on('data',(data=>{
   const userChoice = Number(data.toString());
   console.log(`You selected song number: ${userChoice}`);
   playSong(SONGS_DIR + '/' + songs[userChoice])

}))