# CLI Music Player Refinement

## Concepts — Terminal Interfaces & Process Management

### What I Learned
Building a terminal-based music player requires bridging low-level operating system streams, terminal rendering control, and asynchronous child process orchestration. In Node.js, standard output normally streams linearly line-by-line, and standard input waits for a newline delimiter (`Enter`). By configuring raw mode input, leveraging ANSI escape sequences, and managing external player processes via Unix pipes, we can transform Node.js into a full-featured, interactive terminal UI.

### Important Concepts
- **`process.stdin.setRawMode(true)`**: Bypasses the terminal line buffer to capture individual keystrokes (like arrow keys, single characters, and spacebar) instantaneously as binary Buffers without waiting for `Enter`.
- **DEC Alternate Screen Buffer (`\x1b[?1049h` / `\x1b[?1049l`)**: Switches the terminal into a dedicated, isolated screen buffer (the same mechanism used by `vim`, `nano`, `less`, and `htop`). This ensures in-place redrawing never pollutes or floods the user's terminal scrollback history.
- **ANSI Escape Sequences**: Special character sequences (e.g. `\x1B[H\x1B[2J` to reposition cursor to top-left and clear the viewport, `\x1b[?25l` / `\x1b[?25h` to hide/show cursor, and ANSI color codes `\x1b[36m`, `\x1b[32m`, `\x1b[1m`) to construct rich, styled interfaces.
- **`child_process.spawn`**: Asynchronously executes external system binaries (`vlc` for audio decoding and playback, `afinfo` on macOS for audio metadata analysis) with piped standard input/output streams.
- **Process Communication & IPC**: Interacting with VLC's Remote Control (`rc`) interface in real-time by writing ASCII commands (`pause\n`, `volume <0-256>\n`, `seek <seconds>\n`) to `vlcPlayProcess.stdin`.
- **Lifecycle & Signal Trapping**: Listening to process events (`close`, `exit`, `error`) to automatically advance playlists, and trapping termination signals (`SIGINT`, `SIGTERM`, `exit`) to ensure all background audio child processes are killed and the terminal cursor is restored.

### How It Relates to the Project
These concepts form the backbone of the application. Raw input and ANSI escape codes enable real-time keyboard navigation, responsive playback controls, and a flicker-free progress bar. Child processes delegate audio playback to a dedicated engine (VLC) while Node.js orchestrates UI rendering, state tracking, and playback logic.

### Key Takeaway
We can build responsive, non-blocking, and visually refined terminal applications in Node.js by combining raw input streams with ANSI control sequences and child process pipe manipulation.

---

## Implementation — Building a CLI Music Player

### Objective
Implement an interactive, feature-rich CLI music player (`cli_player.js`) that plays songs from a directory, provides immediate keyboard-driven audio controls, displays real-time progress and volume indicators, and handles playlist transitions cleanly.

### What I Implemented
- **Song Navigation & Selection**: Up/Down (`↑`/`↓`) arrow navigation with wrap-around selection, and instant track skipping with Next (`n`) and Previous (`b`) keys.
- **In-Place, Flicker-Free UI Redrawing**: Used the terminal alternate screen buffer (`\x1b[?1049h`) with cursor reset (`\x1b[H\x1b[2J`), eliminating infinite scrollback pollution and screen tearing.
- **Dedicated Volume Controls & Mute**:
  - Decrease volume with `-` (minus key, down by 5%).
  - Increase volume with `=` or `+` (up by 5%, convenient single-key tap without requiring Shift).
  - Instant Mute/Unmute toggle with `m`.
  - Visual volume gauge (`Volume: [████████░░] 80%`).
- **Interactive Seeking**: Fast-forward (`→`) and rewind (`←`) by 10 seconds in real-time, synchronizing VLC audio with the UI timeline.
- **Sleek Progress Slider**: Modern Unicode progress bar (`[━━━━━━━●────────────────────────────────────────]`) with an active playhead (`●`), elapsed time, total duration, and percentage indicators.
- **Repeat Modes & Autoplay**:
  - `[🔁 ALL]`: Automatically advances to the next track and loops the entire playlist.
  - `[🔂 ONE]`: Replays the current track automatically upon completion.
  - `[OFF]`: Plays through the playlist once and stops at the end.
- **VLC RC Engine Integration**: Spawned VLC with `--play-and-exit` and piped standard input to reliably detect track end events and prevent idle process hanging.
- **Optimized Timer Loop**: Refactored `setInterval` to stop completely when paused or idle, and during playback only redrawing when the clock second actually increments.
- **Clean Signal Cleanup**: Traps `SIGINT`, `SIGTERM`, and normal exits to kill any active `vlc` process, clear intervals, and restore the main terminal screen buffer (`\x1b[?1049l\x1b[?25h`).

### Concepts Used
- `fs.readdirSync` and `fs.existsSync` for directory scanning and automatic fallback resolution.
- `spawn('vlc', ['-I', 'rc', '--no-video', '--play-and-exit', ...])` for interactive headless audio playback.
- `spawn('afinfo')` for retrieving exact audio track duration metadata on macOS.
- `process.stdin.setRawMode(true)` for capturing raw keystroke Buffer bytes.
- Piped streams (`stdio: ['pipe', 'pipe', 'pipe']`) for sending commands to VLC's standard input.

### Project Connection
This implementation serves as the standalone CLI music player (`cli_player.js`), integrating all concepts explored across lectures and labs (from child process spawning in AD-2, raw mode input in AD-3, to interactive audio controls in AD-4 and AD-5).

### Key Takeaway
Managing state coordination (synchronizing `isPaused`, `totalDuration`, `timeElapsed`, `volume`, and `repeatMode` with external child process lifecycles) is crucial to keeping terminal interfaces responsive, bug-free, and reliable.

---

## Questionnaire

1. **The first arrow-navigation version printed the song list again and again. Why did that happen, and how did you make the list redraw in the same place?**

   **Answer:**  
   Standard `console.log()` and `process.stdout.write()` simply append new lines to the terminal's standard buffer, pushing previous content up into the scrollback history. To redraw in-place, we reposition the cursor to row 1, column 1 using the ANSI escape sequence `\x1b[H` and clear the visible screen using `\x1b[2J` before writing the updated menu frame. Furthermore, to prevent thousands of past frames from piling up in the terminal's scrollback history, we enabled the DEC Alternate Screen Buffer (`\x1b[?1049h`), ensuring the player renders in an isolated viewport without scrollback pollution.

2. **Why do we need both cursor movement and line clearing while redrawing the terminal UI? What problem can happen if you only move the cursor?**

   **Answer:**  
   If you only move the cursor back to the top (`\x1b[H`) without clearing lines (`\x1b[2J` or `\x1b[K`), any newly rendered line that is shorter than the line previously occupying that row will leave trailing characters visible (known as "ghosting"). Line/screen clearing guarantees that old text is removed before new text is painted.

3. **What does the selected-song variable represent? How do you make sure the user cannot move above the first song or below the last song?**

   **Answer:**  
   The `cursor` variable represents the zero-based array index of the currently highlighted track in the `allSongs` array. We prevent out-of-bounds indices by using modular arithmetic with wrap-around:
   - Up Arrow (`↑`): `cursor = ((cursor - 1) % allSongs.length); if (cursor < 0) cursor += allSongs.length;`
   - Down Arrow (`↓`): `cursor = (cursor + 1) % allSongs.length;`
   
   Alternatively, clamping can be achieved using `Math.max(0, cursor - 1)` and `Math.min(allSongs.length - 1, cursor + 1)`.

4. **Why was afplay + SIGSTOP/SIGCONT not a reliable solution for a real pause/resume feature? What changed in the final approach?**

   **Answer:**  
   `afplay` is a basic one-shot command-line player that lacks an interactive command interface or real-time time query mechanism. Freezing it with the OS signal `SIGSTOP` halts the process abruptly at the kernel level without pausing internal audio clocks or reporting position, making synchronization in Node.js very fragile. In the final approach, we use VLC with the Remote Control interface (`-I rc`), allowing us to write the command `pause\n` directly to VLC's standard input for clean, application-level playback pausing.

5. **How would you prove that the pause/resume implementation is correct? Describe a small test you would perform.**

   **Answer:**  
   Play a track with known length (e.g. 60 seconds). Let it play for 5 seconds (progress bar displays `00:05`). Press Spacebar to pause. Wait 10 seconds in real life. While paused:
   1. The audio must be completely silent.
   2. The elapsed time and progress bar must remain frozen at `00:05`.
   3. The background interval must not perform unnecessary screen redraws.
   
   Press Spacebar again to resume. Audio must pick up seamlessly from `00:05`, and 10 seconds later, the display should accurately read `00:15`.

6. **How is the progress percentage calculated? What should happen to the progress value while the song is paused?**

   **Answer:**  
   Progress percentage is calculated as `Math.min(100, (timeElapsed / totalDuration) * 100)`. `totalDuration` is fetched asynchronously using `afinfo`. `timeElapsed` is tracked using `Date.now() - startTime - totalPausedTime`. When the song is paused, we record `pausedAt = Date.now()`, and upon resuming we add `Date.now() - pausedAt` to `totalPausedTime`. This freezes `timeElapsed` completely while paused so the progress percentage does not drift.

7. **When the user starts a new song while another song is already playing, what needs to be stopped or cleaned up? What could happen if you do not do this?**

   **Answer:**  
   The active `vlcPlayProcess` must be terminated (via `SIGKILL`), its event listeners (`close`, `exit`) must be removed (`removeAllListeners()`), and the active `trackingInterval` must be cleared. If not cleaned up:
   1. Multiple VLC processes will run concurrently, playing overlapping audio simultaneously.
   2. Old `close` listeners will trigger stale autoplay events.
   3. Competing intervals will redraw the screen simultaneously, causing severe screen flickering.

8. **Describe one bug or unexpected behaviour you faced while refining this application. What did you initially think was wrong, how did you investigate it, and what was the actual fix?**

   **Answer:**  
   *Bug:* When a song reached the end, the player failed to automatically advance to the next song.  
   *Investigation:* I initially suspected the `cp.on('close')` event logic had a syntax error. Upon debugging child process events, I discovered that `close` was never being fired at all! VLC in Remote Control mode (`-I rc`) is an interactive shell, so after playing a file, it remains running at its command prompt (`>`) waiting for more input.  
   *Fix:* Passed the `--play-and-exit` flag to the VLC spawn command (`spawn('vlc', ['-I', 'rc', '--no-video', '--play-and-exit', songPath])`), which instructs VLC to exit immediately once the audio track finishes, reliably triggering the `close` handler and auto-advancing to the next track.

9. **If you had to add "jump forward 10 seconds" next, which part of the current application would change and what existing playback information would you reuse?**

   **Answer:**  
   We capture the Right Arrow key (`\x1b[C` or `0x1b, 0x5b, 0x43`) in raw mode. We write `seek +10\n` directly to `vlcPlayProcess.stdin`. In JS state, we update `timeElapsed = Math.min(totalDuration, timeElapsed + 10)` and shift `startTime = startTime - 10000` so that our internal timer remains synchronized with VLC's new playback position.

---

## Architecture Documentation

### Flow Overview
The application operates as an event-driven terminal loop: reading raw key inputs from `process.stdin`, updating state machines (cursor, volume, pause state, repeat mode), orchestrating external child processes (`vlc`, `afinfo`), and rendering a flicker-free UI frame to standard output inside an isolated alternate screen buffer.

```mermaid
flowchart TD
    A[User Input via process.stdin (Raw Mode)] --> B{Key Press Handler}
    
    %% Input Routing
    B -->|Up / Down Arrows| C[Update cursor Index (Modulo Wrap)]
    B -->|Enter| D[playSong(cursor)]
    B -->|n / b| NB[Advance Cursor & playSong]
    B -->|Space / p| E[Toggle isPaused]
    B -->|Left / Right Arrows| S[Seek ±10s via VLC stdin & Shift startTime]
    B -->|'-' / '='| V[Adjust Volume ±5% & send VLC volume command]
    B -->|m| M[Toggle Mute & send VLC volume 0/saved]
    B -->|r| R[Cycle Repeat Mode: OFF ➔ ONE ➔ ALL]
    B -->|q / Ctrl+C| Q[cleanupAndExit: Kill VLC, Restore Terminal, Exit]

    %% UI Redraw Trigger
    C --> UI[listSongs: Render Frame]
    R --> UI
    V --> UI
    M --> UI
    S --> UI

    %% Playback Pipeline
    D --> K[Kill Old VLC Process & Clear Listeners]
    NB --> K
    K --> DUR[Fetch Duration via afinfo]
    DUR --> SP[Spawn VLC: -I rc --no-video --play-and-exit]
    SP --> VOL[Send Initial Volume to VLC stdin]
    VOL --> T[startElapsedTracking: Interval @ 200ms]
    
    %% Pause Handling
    E --> P_CMD[Send 'pause\n' to VLC stdin]
    P_CMD --> P_STATE[Freeze / Resume Tracking Timer]
    P_STATE --> UI

    %% Time Tracking & Watchdog
    T -. Every 200ms .-> CHK{Second Changed?}
    CHK -->|Yes| UI
    CHK -->|timeElapsed >= totalDuration| ADV[advanceToNextTrack]

    %% Auto-advance Pipeline
    SP -. Song Finished (VLC exits) .-> CLOSE[cp.on 'close' Event]
    CLOSE --> ADV
    ADV -->|Repeat ONE| D
    ADV -->|Repeat ALL / Next| D
    ADV -->|End of List & OFF| STOP[Stop Playback & Pause]
    STOP --> UI

    %% Terminal Render Pipeline
    UI --> BUF[DEC Alternate Screen: \x1b[?1049h]
    BUF --> HOME[Cursor Home & Clear: \x1b[H\x1b[2J]
    HOME --> DRAW[Draw Title, Song List, Modern Slider, Volume Bar, Controls]
```
