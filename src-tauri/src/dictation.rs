//! Hold Space in the composer to dictate, with Claude Code's own dictation. Anthropic offers no
//! speech API and forbids apps to use Claude.ai credentials, so Bull drives an unmodified `claude`
//! TUI in a hidden pseudo console like a user would: it holds Space there (Claude recognises a
//! held key by its auto-repeat), reads the transcript off the input line and clears it again.
//! That Claude never gets Enter, so it never answers anything. It starts on the first dictation,
//! stays warm for the next ones and ends after a while without any.
//!
//! The microphone is this machine's, also for a chat that runs on another one.

use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde::ser::SerializeStruct;
use tauri::State;

use crate::connections::lock;
use crate::dictation_screen::{Prompt, ScreenView, TrustChoice, VoicePhase};
use crate::dictation_session::{HiddenClaude, KEY_DOWN, KEY_ESCAPE, KEY_SPACE, KEYS_CLEAR_LINE};

pub const DICTATION_EVENT: &str = "dictation";

/// A key's auto-repeat as Claude needs it: it recorded with spaces every 50 ms, never with 65 ms.
const REPEAT_INTERVAL: Duration = Duration::from_millis(30);
/// Claude records after about 0.5 s of repeats; this long without means it will not.
const LISTEN_TIMEOUT: Duration = Duration::from_secs(3);
const READY_TIMEOUT: Duration = Duration::from_secs(30);
const POLL: Duration = Duration::from_millis(20);
/// Time for the trust dialog to redraw after a key, so one key is never sent twice.
const TRUST_KEY_PAUSE: Duration = Duration::from_millis(500);
/// The transcript arrives as a whole; unchanged this long, it is the final one.
const TEXT_SETTLE: Duration = Duration::from_millis(250);
/// Back to idle without text: nothing was recognised, unless text still arrives within this.
const EMPTY_SETTLE: Duration = Duration::from_secs(1);
const TRANSCRIPT_TIMEOUT: Duration = Duration::from_secs(20);
const CANCEL_SETTLE: Duration = Duration::from_secs(3);
const CLEAR_SETTLE: Duration = Duration::from_millis(500);
const CLEAR_ATTEMPTS: usize = 3;
/// A Claude process costs a few hundred MB, and on Windows it locks the installed `claude.exe`
/// against updates: unused this long, it ends.
const IDLE_SHUTDOWN: Duration = Duration::from_secs(10 * 60);
const IDLE_CHECK: Duration = Duration::from_secs(30);
const FALLBACK_LANGUAGE: &str = "en";
const MAX_LANGUAGE_CHARS: usize = 16;

#[derive(Debug, thiserror::Error)]
pub enum DictationError {
    #[error("claude is not installed")]
    ClaudeMissing,
    #[error("cannot start claude: {0}")]
    Spawn(String),
    #[error("claude did not get ready: {0}")]
    NotReady(String),
    #[error("claude exited")]
    Exited,
    #[error("claude did not start recording: {0}")]
    NotListening(String),
    #[error("nothing was recognised: {0}")]
    NothingHeard(String),
    #[error("no transcript in time")]
    Timeout,
    #[error("no dictation is running")]
    NotHolding,
    #[error("dictation: {0}")]
    Io(io::Error),
}

impl DictationError {
    /// The frontend translates by this, see `errors.dictation` in the locales.
    fn code(&self) -> &'static str {
        match self {
            Self::ClaudeMissing => "claude_missing",
            Self::Spawn(_) => "spawn_failed",
            Self::NotReady(_) => "not_ready",
            Self::Exited => "exited",
            Self::NotListening(_) => "not_listening",
            Self::NothingHeard(_) => "nothing_heard",
            Self::Timeout => "timeout",
            Self::NotHolding => "not_holding",
            Self::Io(_) => "io",
        }
    }

    /// What Claude or the system said, shown with the translated message.
    fn detail(&self) -> String {
        match self {
            Self::Spawn(detail) | Self::NotReady(detail) | Self::NotListening(detail) | Self::NothingHeard(detail) => {
                detail.clone()
            }
            Self::Io(err) => err.to_string(),
            Self::ClaudeMissing | Self::Exited | Self::Timeout | Self::NotHolding => String::new(),
        }
    }
}

impl Serialize for DictationError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut error = serializer.serialize_struct("DictationError", 2)?;
        error.serialize_field("code", self.code())?;
        error.serialize_field("detail", &self.detail())?;
        error.end()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DictationEvent {
    /// Claude records now: the composer may say so.
    Listening,
    /// Recording never started; the composer stops waiting for it.
    Failed { code: &'static str, detail: String },
}

type Sink = Arc<dyn Fn(DictationEvent) + Send + Sync>;

/// Space held in the hidden Claude by a thread of its own, until `stop` is set.
struct Hold {
    stop: Arc<AtomicBool>,
    /// Whether Claude recorded
    thread: JoinHandle<Result<bool, DictationError>>,
    /// The notice row before the hold, so a notice Claude adds is told apart from what it shows anyway
    baseline: String,
}

impl Hold {
    fn finish(self) -> Result<bool, DictationError> {
        self.stop.store(true, Ordering::Relaxed);
        self.thread.join().unwrap_or(Err(DictationError::Exited))
    }
}

struct Inner {
    /// One operation at a time: a release waits for its press to have started
    op: Mutex<()>,
    claude: Mutex<Option<Arc<HiddenClaude>>>,
    hold: Mutex<Option<Hold>>,
    last_used: Mutex<Instant>,
}

pub struct DictationHost {
    sink: Sink,
    inner: Arc<Inner>,
}

impl DictationHost {
    pub fn new(sink: impl Fn(DictationEvent) + Send + Sync + 'static) -> Self {
        let inner = Arc::new(Inner {
            op: Mutex::new(()),
            claude: Mutex::new(None),
            hold: Mutex::new(None),
            last_used: Mutex::new(Instant::now()),
        });
        let watched = Arc::clone(&inner);
        thread::spawn(move || end_when_idle(&watched));
        Self { sink: Arc::new(sink), inner }
    }

    /// Starts holding Space in a ready Claude; `Listening` follows once it records.
    pub fn start(&self, language: &str) -> Result<(), DictationError> {
        let _op = lock(&self.inner.op);
        *lock(&self.inner.last_used) = Instant::now();
        if let Some(previous) = lock(&self.inner.hold).take() {
            // A hold nobody released is over; only the cleaning up below matters.
            let _ = previous.finish();
        }
        let claude = self.ready_claude(&language_of(language))?;
        settle_to_idle(&claude)?;
        clear_input(&claude)?;
        let baseline = prompt_of(&claude).map(|prompt| prompt.notice).unwrap_or_default();
        let stop = Arc::new(AtomicBool::new(false));
        let (held, should_stop, sink) = (Arc::clone(&claude), Arc::clone(&stop), Arc::clone(&self.sink));
        let thread = thread::spawn(move || hold_space(&held, &should_stop, &*sink));
        *lock(&self.inner.hold) = Some(Hold { stop, thread, baseline });
        Ok(())
    }

    /// Lets go of Space and returns the transcript, with Claude's input empty again.
    pub fn stop(&self) -> Result<String, DictationError> {
        let _op = lock(&self.inner.op);
        *lock(&self.inner.last_used) = Instant::now();
        let hold = lock(&self.inner.hold).take().ok_or(DictationError::NotHolding)?;
        let claude = self.current().ok_or(DictationError::Exited)?;
        let baseline = hold.baseline.clone();
        let result = match hold.finish() {
            Ok(true) => await_transcript(&claude, &baseline),
            Ok(false) => Err(DictationError::NotListening(changed_notice(&claude, &baseline))),
            Err(err) => Err(err),
        };
        let is_timeout = matches!(result, Err(DictationError::Timeout));
        with_cleanup(result, || {
            if is_timeout {
                claude.send(KEY_ESCAPE)?;
            }
            clear_input(&claude)
        })
    }

    /// Lets go of Space and throws away whatever Claude recorded.
    pub fn cancel(&self) -> Result<(), DictationError> {
        let _op = lock(&self.inner.op);
        let Some(hold) = lock(&self.inner.hold).take() else { return Ok(()) };
        // Recorded or not, it is thrown away; the hold only has to have ended.
        let _ = hold.finish();
        let Some(claude) = self.current() else { return Ok(()) };
        settle_to_idle(&claude)?;
        clear_input(&claude)
    }

    pub fn shut_down(&self) {
        if let Some(hold) = lock(&self.inner.hold).take() {
            // Claude ends right after; what the hold did no longer matters.
            let _ = hold.finish();
        }
        if let Some(claude) = lock(&self.inner.claude).take() {
            claude.shut_down();
        }
    }

    fn current(&self) -> Option<Arc<HiddenClaude>> {
        lock(&self.inner.claude).clone().filter(|claude| claude.is_alive())
    }

    /// The running Claude, or a new one when there is none or it dictates another language.
    fn ready_claude(&self, language: &str) -> Result<Arc<HiddenClaude>, DictationError> {
        let running = self.current().filter(|claude| claude.language == language);
        let claude = match running {
            Some(claude) => claude,
            None => {
                let claude = Arc::new(HiddenClaude::spawn(language)?);
                if let Some(old) = lock(&self.inner.claude).replace(Arc::clone(&claude)) {
                    old.shut_down();
                }
                claude
            }
        };
        if let Err(err) = wait_ready(&claude) {
            // The next press starts afresh instead of waiting on a Claude that is stuck.
            if let Some(stuck) = lock(&self.inner.claude).take() {
                stuck.shut_down();
            }
            return Err(err);
        }
        Ok(claude)
    }
}

fn end_when_idle(inner: &Inner) {
    loop {
        thread::sleep(IDLE_CHECK);
        // Busy with a dictation right now: certainly not idle.
        let Ok(_op) = inner.op.try_lock() else { continue };
        let is_idle = lock(&inner.hold).is_none() && lock(&inner.last_used).elapsed() >= IDLE_SHUTDOWN;
        if is_idle && let Some(claude) = lock(&inner.claude).take() {
            claude.shut_down();
        }
    }
}

/// A language code as Claude's `language` setting takes it, else English.
fn language_of(requested: &str) -> String {
    let code = requested.trim().to_ascii_lowercase();
    let is_code = !code.is_empty()
        && code.len() <= MAX_LANGUAGE_CHARS
        && code.chars().all(|c| c.is_ascii_alphabetic() || c == '-');
    if is_code { code } else { FALLBACK_LANGUAGE.to_string() }
}

fn prompt_of(claude: &HiddenClaude) -> Option<Prompt> {
    match claude.view() {
        ScreenView::Prompt(prompt) => Some(prompt),
        ScreenView::Trust(_) | ScreenView::Unknown { .. } => None,
    }
}

/// Until the prompt box shows. The folder-trust dialog of the first start is answered with Yes,
/// the only Enter this Claude ever gets; once.
fn wait_ready(claude: &HiddenClaude) -> Result<(), DictationError> {
    let deadline = Instant::now() + READY_TIMEOUT;
    let mut has_trusted = false;
    loop {
        if !claude.is_alive() {
            return Err(DictationError::Exited);
        }
        match claude.view() {
            ScreenView::Prompt(_) => return Ok(()),
            ScreenView::Trust(TrustChoice::No) if !has_trusted => {
                claude.send(KEY_DOWN)?;
                thread::sleep(TRUST_KEY_PAUSE);
            }
            ScreenView::Trust(TrustChoice::Yes) if !has_trusted => {
                claude.confirm_trust()?;
                has_trusted = true;
            }
            ScreenView::Trust(_) => {}
            ScreenView::Unknown { text } if Instant::now() >= deadline => return Err(DictationError::NotReady(text)),
            ScreenView::Unknown { .. } => {}
        }
        if Instant::now() >= deadline {
            return Err(DictationError::NotReady(String::new()));
        }
        thread::sleep(POLL);
    }
}

/// Spaces at key-repeat speed until told to stop. `Ok(true)` once Claude recorded. Every failure
/// is also an event: the composer waits for `Listening` while Space is still down.
fn hold_space(claude: &HiddenClaude, stop: &AtomicBool, sink: &(dyn Fn(DictationEvent) + Send + Sync)) -> Result<bool, DictationError> {
    reported(hold_until_stopped(claude, stop, sink), sink)
}

fn reported<T>(result: Result<T, DictationError>, sink: &(dyn Fn(DictationEvent) + Send + Sync)) -> Result<T, DictationError> {
    if let Err(err) = &result {
        sink(DictationEvent::Failed { code: err.code(), detail: err.detail() });
    }
    result
}

fn hold_until_stopped(claude: &HiddenClaude, stop: &AtomicBool, sink: &(dyn Fn(DictationEvent) + Send + Sync)) -> Result<bool, DictationError> {
    let started = Instant::now();
    let mut is_listening = false;
    while !stop.load(Ordering::Relaxed) {
        claude.send(KEY_SPACE)?;
        thread::sleep(REPEAT_INTERVAL);
        if !claude.is_alive() {
            return Err(DictationError::Exited);
        }
        if !is_listening && prompt_of(claude).is_some_and(|prompt| prompt.phase == VoicePhase::Listening) {
            is_listening = true;
            sink(DictationEvent::Listening);
        }
        if !is_listening && started.elapsed() >= LISTEN_TIMEOUT {
            let detail = prompt_of(claude).map(|prompt| prompt.notice).unwrap_or_default();
            return Err(DictationError::NotListening(detail));
        }
    }
    Ok(is_listening)
}

/// After the release: the transcript once Claude is idle again and it stopped changing.
fn await_transcript(claude: &HiddenClaude, baseline: &str) -> Result<String, DictationError> {
    let deadline = Instant::now() + TRANSCRIPT_TIMEOUT;
    let mut seen: Option<(String, Instant)> = None;
    while Instant::now() < deadline {
        if !claude.is_alive() {
            return Err(DictationError::Exited);
        }
        let prompt = prompt_of(claude).filter(|prompt| prompt.phase == VoicePhase::Idle);
        let Some(prompt) = prompt else {
            seen = None;
            thread::sleep(POLL);
            continue;
        };
        let since = match &seen {
            Some((text, at)) if *text == prompt.text => *at,
            _ => seen.insert((prompt.text.clone(), Instant::now())).1,
        };
        let settle = if prompt.text.is_empty() { EMPTY_SETTLE } else { TEXT_SETTLE };
        if since.elapsed() >= settle {
            if prompt.text.is_empty() {
                return Err(DictationError::NothingHeard(notice_unless(&prompt.notice, baseline)));
            }
            return Ok(prompt.text);
        }
        thread::sleep(POLL);
    }
    Err(DictationError::Timeout)
}

/// The clean-up after a stop only keeps the next dictation tidy (`start` clears again): its
/// failure never costs the transcript already read.
fn with_cleanup<T>(result: Result<T, DictationError>, cleanup: impl FnOnce() -> Result<(), DictationError>) -> Result<T, DictationError> {
    if let Err(err) = cleanup() {
        eprintln!("dictation: cleaning up after the stop failed: {err}");
    }
    result
}

fn notice_unless(notice: &str, baseline: &str) -> String {
    if notice == baseline { String::new() } else { notice.to_string() }
}

fn changed_notice(claude: &HiddenClaude, baseline: &str) -> String {
    prompt_of(claude).map(|prompt| notice_unless(&prompt.notice, baseline)).unwrap_or_default()
}

/// Ends a recording or transcription still running: Esc cancels it and keeps nothing.
fn settle_to_idle(claude: &HiddenClaude) -> Result<(), DictationError> {
    let is_busy = |prompt: &Prompt| matches!(prompt.phase, VoicePhase::Listening | VoicePhase::Transcribing);
    if !prompt_of(claude).is_some_and(|prompt| is_busy(&prompt)) {
        return Ok(());
    }
    claude.send(KEY_ESCAPE)?;
    wait_for(claude, CANCEL_SETTLE, |prompt| prompt.phase == VoicePhase::Idle);
    Ok(())
}

/// Empties the input, so the next transcript is the only text there. Spaces left over from a
/// short hold count as empty text but go as well.
fn clear_input(claude: &HiddenClaude) -> Result<(), DictationError> {
    for _ in 0..CLEAR_ATTEMPTS {
        claude.send(KEYS_CLEAR_LINE)?;
        if wait_for(claude, CLEAR_SETTLE, |prompt| prompt.text.is_empty()) {
            return Ok(());
        }
    }
    // The next start clears again; a leftover would only show up in front of its transcript.
    eprintln!("dictation: the hidden Claude's input did not clear");
    Ok(())
}

fn wait_for(claude: &HiddenClaude, timeout: Duration, is_done: impl Fn(&Prompt) -> bool) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if prompt_of(claude).is_some_and(|prompt| is_done(&prompt)) {
            return true;
        }
        thread::sleep(POLL);
    }
    false
}

#[tauri::command(async)]
pub fn dictation_start(host: State<'_, DictationHost>, language: String) -> Result<(), DictationError> {
    host.start(&language)
}

#[tauri::command(async)]
pub fn dictation_stop(host: State<'_, DictationHost>) -> Result<String, DictationError> {
    host.stop()
}

#[tauri::command(async)]
pub fn dictation_cancel(host: State<'_, DictationHost>) -> Result<(), DictationError> {
    host.cancel()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn errors_serialize_as_code_and_detail() {
        let json = serde_json::to_string(&DictationError::NothingHeard("No speech detected".into())).unwrap();
        assert_eq!(json, r#"{"code":"nothing_heard","detail":"No speech detected"}"#);
        assert_eq!(serde_json::to_string(&DictationError::Timeout).unwrap(), r#"{"code":"timeout","detail":""}"#);
    }

    #[test]
    fn events_serialize_tagged() {
        assert_eq!(serde_json::to_string(&DictationEvent::Listening).unwrap(), r#"{"type":"listening"}"#);
        let failed = DictationEvent::Failed { code: "not_listening", detail: "x".into() };
        assert_eq!(serde_json::to_string(&failed).unwrap(), r#"{"type":"failed","code":"not_listening","detail":"x"}"#);
    }

    #[test]
    fn takes_only_a_language_code() {
        assert_eq!(language_of("de"), "de");
        assert_eq!(language_of(" EN "), "en");
        assert_eq!(language_of("pt-BR"), "pt-br");
        assert_eq!(language_of(""), FALLBACK_LANGUAGE);
        assert_eq!(language_of(r#"de","autoSubmit":true"#), FALLBACK_LANGUAGE);
    }

    #[test]
    fn a_notice_that_was_there_before_is_no_detail() {
        assert_eq!(notice_unless("◐ medium · /effort", "◐ medium · /effort"), "");
        assert_eq!(notice_unless("No speech detected", "◐ medium · /effort"), "No speech detected");
    }

    #[test]
    fn a_failing_hold_tells_the_composer() {
        let events = Mutex::new(Vec::new());
        let sink = |event| lock(&events).push(event);
        let result: Result<bool, _> = reported(Err(DictationError::Exited), &sink);
        assert!(matches!(result, Err(DictationError::Exited)));
        assert!(reported(Ok(true), &sink).is_ok());
        assert_eq!(*lock(&events), vec![DictationEvent::Failed { code: "exited", detail: String::new() }]);
    }

    #[test]
    fn a_failed_clean_up_keeps_the_transcript() {
        let result = with_cleanup(Ok("Hallo Welt".to_string()), || Err(DictationError::Exited));
        assert_eq!(result.unwrap(), "Hallo Welt");
    }

    #[test]
    fn releasing_without_a_press_says_so() {
        let host = DictationHost::new(|_| {});
        assert!(matches!(host.stop(), Err(DictationError::NotHolding)));
        assert!(host.cancel().is_ok());
    }

    /// Drives the real `claude` on this machine: it must start, record (silence) and come back
    /// with an empty input. Run with `cargo test -- --ignored real_claude`.
    #[test]
    #[ignore = "starts the installed claude and records from the microphone"]
    fn real_claude_records_and_cleans_up() {
        const HOLD: Duration = Duration::from_millis(1500);
        let (sender, events) = mpsc::channel();
        let sender = Mutex::new(sender);
        let host = DictationHost::new(move |event| {
            // The test may be over already.
            let _ = lock(&sender).send(event);
        });
        host.start("de").unwrap();
        assert_eq!(events.recv_timeout(Duration::from_secs(10)).unwrap(), DictationEvent::Listening);
        thread::sleep(HOLD);
        let result = host.stop();
        eprintln!("stop: {result:?}");
        assert!(matches!(result, Ok(_) | Err(DictationError::NothingHeard(_))));
        let claude = host.current().unwrap();
        assert_eq!(prompt_of(&claude).unwrap().text, "");
        host.start("de").unwrap();
        thread::sleep(HOLD);
        host.cancel().unwrap();
        assert_eq!(prompt_of(&claude).unwrap().text, "");
        host.shut_down();
        thread::sleep(Duration::from_secs(4));
        assert!(!claude.is_alive());
    }
}
