//! The hidden, unmodified `claude` TUI that Bull dictates through: one pseudo console, a VT
//! parser that keeps its screen, and the keys a user would press. Nothing here ever sends Enter
//! except `confirm_trust`, so this Claude never gets a prompt to answer.

use std::io::{Read, Write};
use std::num::NonZeroU16;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};

use crate::connections::lock;
use crate::dictation::DictationError;
use crate::dictation_screen::{ScreenView, view_of};

/// Wide, so a long transcript stays on one row; tall enough for the banner above the box.
const COLS: NonZeroU16 = NonZeroU16::new(400).unwrap();
const ROWS: NonZeroU16 = NonZeroU16::new(40).unwrap();
const READ_BUFFER_BYTES: usize = 16 * 1024;
/// Under `~/.nexron-chat/`: one folder only for this, trusted once in Claude's dialog.
const WORK_FOLDER: &str = "dictation";
/// Ctrl+C clears the input, then asks for a second press, then exits: three end Claude from any
/// input. A plain kill leaves Claude's renderer marked as not started, and the user's next Claude
/// in a terminal falls back to the classic renderer once.
const EXIT_KEYS: [&str; 3] = ["\x03", "\x03", "\x03"];
const EXIT_KEY_GAP: Duration = Duration::from_millis(150);
const EXIT_GRACE: Duration = Duration::from_secs(3);
const EXIT_POLL: Duration = Duration::from_millis(50);

pub const KEY_SPACE: &str = " ";
pub const KEY_ESCAPE: &str = "\x1b";
pub const KEY_DOWN: &str = "\x1b[B";
/// Ctrl+U deletes to the start of the line, Ctrl+K to its end.
pub const KEYS_CLEAR_LINE: &str = "\x15\x0b";
const KEY_ENTER: &str = "\r";

pub struct HiddenClaude {
    pub language: String,
    parser: Arc<Mutex<vt100::Parser>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    is_alive: Arc<AtomicBool>,
    // Closing the master ends the console; it lives as long as this Claude.
    _master: Mutex<Box<dyn MasterPty + Send>>,
}

impl HiddenClaude {
    pub fn spawn(language: &str) -> Result<Self, DictationError> {
        let command = command_of(language)?;
        let size = PtySize { rows: ROWS.get(), cols: COLS.get(), pixel_width: 0, pixel_height: 0 };
        let pair = native_pty_system().openpty(size).map_err(|err| DictationError::Spawn(err.to_string()))?;
        let mut child = pair.slave.spawn_command(command).map_err(|err| DictationError::Spawn(err.to_string()))?;
        drop(pair.slave);
        let reader = pair.master.try_clone_reader().map_err(|err| DictationError::Spawn(err.to_string()))?;
        let writer = pair.master.take_writer().map_err(|err| DictationError::Spawn(err.to_string()))?;
        let parser = Arc::new(Mutex::new(vt100::Parser::new(ROWS, COLS, 0)));
        let is_alive = Arc::new(AtomicBool::new(true));
        let killer = Mutex::new(child.clone_killer());
        let to_screen = Arc::clone(&parser);
        thread::spawn(move || read_into(reader, &to_screen));
        let alive = Arc::clone(&is_alive);
        thread::spawn(move || {
            // The exit code says nothing the screen does not; only that it ended counts.
            let _ = child.wait();
            alive.store(false, Ordering::Relaxed);
        });
        let language = language.to_string();
        Ok(Self { language, parser, writer: Mutex::new(writer), killer, is_alive, _master: Mutex::new(pair.master) })
    }

    pub fn view(&self) -> ScreenView {
        view_of(lock(&self.parser).screen())
    }

    pub fn is_alive(&self) -> bool {
        self.is_alive.load(Ordering::Relaxed)
    }

    pub fn send(&self, keys: &str) -> Result<(), DictationError> {
        let mut writer = lock(&self.writer);
        writer.write_all(keys.as_bytes()).and_then(|()| writer.flush()).map_err(DictationError::Io)
    }

    /// The one Enter this Claude ever gets: on its own folder-trust dialog, with Yes selected.
    pub fn confirm_trust(&self) -> Result<(), DictationError> {
        self.send(KEY_ENTER)
    }

    /// Ends Claude in the background: the keys first, a kill if it is still there afterwards.
    pub fn shut_down(self: Arc<Self>) {
        thread::spawn(move || {
            for key in EXIT_KEYS {
                if self.send(key).is_err() {
                    break;
                }
                thread::sleep(EXIT_KEY_GAP);
            }
            let deadline = Instant::now() + EXIT_GRACE;
            while self.is_alive() && Instant::now() < deadline {
                thread::sleep(EXIT_POLL);
            }
            if self.is_alive() {
                // portable-pty on Windows reports a successful kill as an error; the wait thread
                // tells whether it ended.
                let _ = lock(&self.killer).kill();
            }
        });
    }
}

fn read_into(mut reader: Box<dyn Read + Send>, parser: &Mutex<vt100::Parser>) {
    let mut buffer = vec![0; READ_BUFFER_BYTES];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => return,
            Ok(read) => lock(parser).process(&buffer[..read]),
        }
    }
}

/// `--safe-mode` keeps the user's hooks, MCP servers, plugins, status line and key bindings out
/// (a rebound Space would not record); `--settings` turns voice on in hold mode for this process
/// only and never sends on release, whatever the user's own settings say.
fn command_of(language: &str) -> Result<CommandBuilder, DictationError> {
    let program = crate::claude_program::find().ok_or(DictationError::ClaudeMissing)?;
    let settings = serde_json::json!({
        "voice": { "enabled": true, "mode": "hold", "autoSubmit": false },
        "language": language,
        // Keeps the input steady while recording: no level bar in place of the cursor.
        "prefersReducedMotion": true
    });
    let mut command = CommandBuilder::new(&program.path);
    command.args(["--safe-mode", "--settings", &settings.to_string()]);
    command.cwd(work_folder()?);
    crate::terminal::scrub_inherited_env(&mut command);
    command.env("PATH", &program.search_path);
    command.env("TERM", "xterm-256color");
    // Updates are the terminal's job; this one runs for hours and must not compete with it.
    command.env("DISABLE_AUTOUPDATER", "1");
    Ok(command)
}

fn work_folder() -> Result<PathBuf, DictationError> {
    let home = crate::connections::home_folder().ok_or_else(|| DictationError::Spawn("no home folder".into()))?;
    let folder = home.join(".nexron-chat").join(WORK_FOLDER);
    std::fs::create_dir_all(&folder).map_err(DictationError::Io)?;
    Ok(folder)
}
