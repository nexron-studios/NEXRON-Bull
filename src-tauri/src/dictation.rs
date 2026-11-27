//! Hold Space in the composer to dictate, with Claude Code's own dictation. Anthropic offers no
//! speech API and forbids apps to use Claude.ai credentials, so Bull drives an unmodified `claude`
//! TUI in a hidden pseudo console like a user would: it holds Space there (Claude recognises a
//! held key by its auto-repeat), reads the transcript off the input line and clears it again.
//! That Claude never gets Enter, so it never answers anything. It needs about 5 s until its prompt
//! box shows and records only after that, so the composer warms it up on focus (`warm`); it stays
//! warm for the next dictations and ends after a while without any.
//!
//! The microphone is this machine's, also for a chat that runs on another one.

use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
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
/// It counts repeats rather than time: it recorded after ~0.1 s at this pace, ~0.2 s at 30 ms.
const REPEAT_INTERVAL: Duration = Duration::from_millis(10);
/// Claude records after about 0.1 s of repeats, 0.35 s at most on its first recording; this long
/// without means it will not.
const LISTEN_TIMEOUT: Duration = Duration::from_secs(3);
/// Reading the 400×40 screen costs far more than sending a key: it is read every third key, as
/// often as at the 30 ms pace before. Listening shows at most two keys later.
const KEYS_PER_LOOK: u32 = 3;
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
/// After a failed warm-up: a Claude that cannot start (missing, logged out, stuck) is not started
/// again on every focus, for up to `READY_TIMEOUT` each.
const WARM_PAUSE: Duration = Duration::from_secs(3 * 60);
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
            Self::Spawn(detail)
            | Self::NotReady(detail)
            | Self::NotListening(detail)
            | Self::NothingHeard(detail) => detail.clone(),
            Self::Io(err) => err.to_string(),
            Self::ClaudeMissing | Self::Exited | Self::Timeout | Self::NotHolding => String::new(),
        }
    }

    /// Whether starting Claude again right away would fail the same way.
    fn repeats(&self) -> bool {
        matches!(self, Self::ClaudeMissing | Self::Spawn(_) | Self::Io(_))
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
pub enum HoldEvent {
    /// Claude records now: the composer may say so.
    Listening,
    /// What Claude shows while it records, still being recognised: the composer shows it until
    /// the final transcript replaces it. Sent only when it changed; empty when it went again.
    Interim { text: String },
    /// The hold failed; the composer stops waiting for it.
    Failed { code: &'static str, detail: String },
}

/// What happened to one hold. `hold` is the composer's id for its press, so an event of an
/// earlier press that arrives late never drives a newer one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DictationEvent {
    pub hold: u64,
    #[serde(flatten)]
    pub event: HoldEvent,
}

type Report<'a> = dyn Fn(HoldEvent) + Send + Sync + 'a;

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

/// The last warm-up that failed: it pauses the next ones, and its error is for the press that
/// waited for it.
struct WarmFailure {
    language: String,
    started: Instant,
    at: Instant,
    /// Gone once a press took it
    error: Option<DictationError>,
}

struct Inner {
    /// One operation at a time: a release waits for its press to have started
    op: Mutex<()>,
    claude: Mutex<Option<Arc<HiddenClaude>>>,
    hold: Mutex<Option<Hold>>,
    /// The last press, release or start of a Claude; a focus alone never counts
    last_used: Mutex<Instant>,
    warm_failure: Mutex<Option<WarmFailure>>,
    /// Set once the window closed: a Claude that finishes starting afterwards ends at once
    is_shut_down: AtomicBool,
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
            warm_failure: Mutex::new(None),
            is_shut_down: AtomicBool::new(false),
        });
        let watched = Arc::clone(&inner);
        thread::spawn(move || end_when_idle(&watched));
        Self {
            sink: Arc::new(sink),
            inner,
        }
    }

    /// Starts a Claude for `language` in the background unless one runs, so that the next press
    /// records at once instead of waiting for Claude to start.
    pub fn warm(&self, language: &str) {
        let inner = Arc::clone(&self.inner);
        let language = language_of(language);
        thread::spawn(move || inner.warm_up(&language));
    }

    /// Starts holding Space in a ready Claude; `Listening` for `hold` follows once it records.
    pub fn start(&self, language: &str, hold: u64) -> Result<(), DictationError> {
        let pressed = Instant::now();
        let _op = lock(&self.inner.op);
        *lock(&self.inner.last_used) = Instant::now();
        let language = language_of(language);
        if let Some(error) = self.inner.warm_failure_since(&language, pressed) {
            return Err(error);
        }
        if let Some(previous) = lock(&self.inner.hold).take() {
            // A hold nobody released is over; only the cleaning up below matters.
            let _ = previous.finish();
        }
        let claude = self.inner.ready_claude(&language)?;
        settle_to_idle(&claude)?;
        clear_input(&claude)?;
        let baseline = prompt_of(&claude)
            .map(|prompt| prompt.notice)
            .unwrap_or_default();
        let stop = Arc::new(AtomicBool::new(false));
        let (held, should_stop, sink) = (
            Arc::clone(&claude),
            Arc::clone(&stop),
            Arc::clone(&self.sink),
        );
        let report = move |event| sink(DictationEvent { hold, event });
        let thread = thread::spawn(move || hold_space(&held, &should_stop, &report));
        *lock(&self.inner.hold) = Some(Hold {
            stop,
            thread,
            baseline,
        });
        Ok(())
    }

    /// Lets go of Space and returns the transcript, with Claude's input empty again.
    pub fn stop(&self) -> Result<String, DictationError> {
        let _op = lock(&self.inner.op);
        *lock(&self.inner.last_used) = Instant::now();
        let hold = lock(&self.inner.hold)
            .take()
            .ok_or(DictationError::NotHolding)?;
        let claude = self.inner.current().ok_or(DictationError::Exited)?;
        let baseline = hold.baseline.clone();
        let result = match hold.finish() {
            Ok(true) => await_transcript(&claude, &baseline),
            Ok(false) => Err(DictationError::NotListening(changed_notice(
                &claude, &baseline,
            ))),
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
        let Some(hold) = lock(&self.inner.hold).take() else {
            return Ok(());
        };
        // Recorded or not, it is thrown away; the hold only has to have ended.
        let _ = hold.finish();
        let Some(claude) = self.inner.current() else {
            return Ok(());
        };
        settle_to_idle(&claude)?;
        clear_input(&claude)
    }

    pub fn shut_down(&self) {
        // Before the slot is emptied: a Claude still starting must not land in it afterwards.
        self.inner.is_shut_down.store(true, Ordering::SeqCst);
        if let Some(hold) = lock(&self.inner.hold).take() {
            // Claude ends right after; what the hold did no longer matters.
            let _ = hold.finish();
        }
        if let Some(claude) = lock(&self.inner.claude).take() {
            claude.shut_down();
        }
    }
}

impl Inner {
    /// A Claude for `language` when none runs. A focus never extends a running Claude's life:
    /// only a new one counts as use, so it can still end idle.
    fn warm_up(&self, language: &str) {
        // A press or another warm-up holds it: that one gets Claude ready already. So does the
        // idle check, for a moment every `IDLE_CHECK`: a focus right then warms nothing, the
        // next one does.
        let Some(_op) = self.try_op() else {
            return;
        };
        // While Space is held, a Claude for another language would end the one recording.
        let is_holding = lock(&self.hold).is_some();
        let is_running = self
            .current()
            .is_some_and(|claude| claude.language == language);
        let is_paused = lock(&self.warm_failure).as_ref().is_some_and(|failure| {
            failure.language == language && failure.at.elapsed() < WARM_PAUSE
        });
        if is_holding || is_running || is_paused || self.is_shut_down.load(Ordering::SeqCst) {
            return;
        }
        let started = Instant::now();
        *lock(&self.last_used) = started;
        let Err(error) = self.ready_claude(language) else {
            return;
        };
        // Only a head start: a later press starts Claude again and reports a failure itself.
        eprintln!("dictation: warming up Claude failed: {error}");
        *lock(&self.warm_failure) = Some(WarmFailure {
            language: language.to_string(),
            started,
            at: Instant::now(),
            error: Some(error),
        });
    }

    /// `op` unless an operation holds it. A panic in one must not end warm-ups and idle checks
    /// for good, so a poisoned lock counts as free, as in `lock`.
    fn try_op(&self) -> Option<MutexGuard<'_, ()>> {
        match self.op.try_lock() {
            Ok(op) => Some(op),
            Err(TryLockError::Poisoned(poisoned)) => Some(poisoned.into_inner()),
            Err(TryLockError::WouldBlock) => None,
        }
    }

    /// The failure of a warm-up that ended while this press waited, when starting again would
    /// only fail the same way or keep it waiting about as long once more: so a press never waits
    /// more than one `READY_TIMEOUT` beyond that. Otherwise the press tries again itself.
    fn warm_failure_since(&self, language: &str, pressed: Instant) -> Option<DictationError> {
        let mut failure = lock(&self.warm_failure);
        let failure = failure
            .as_mut()
            .filter(|failure| failure.language == language && failure.at >= pressed)?;
        let waited = failure.at.duration_since(pressed);
        let took = failure.at.duration_since(failure.started);
        let error = failure.error.take()?;
        let has_waited_most = waited * 2 >= took;
        (error.repeats() || has_waited_most).then_some(error)
    }

    /// Makes `claude` the current one and ends the one before; after the window closed, ends
    /// `claude` instead, since nobody would.
    fn adopt(&self, claude: Arc<HiddenClaude>) -> Result<(), DictationError> {
        let mut slot = lock(&self.claude);
        if self.is_shut_down.load(Ordering::SeqCst) {
            drop(slot);
            claude.shut_down();
            return Err(DictationError::Exited);
        }
        if let Some(old) = slot.replace(claude) {
            old.shut_down();
        }
        Ok(())
    }

    fn current(&self) -> Option<Arc<HiddenClaude>> {
        lock(&self.claude)
            .clone()
            .filter(|claude| claude.is_alive())
    }

    /// The running Claude, or a new one when there is none or it dictates another language.
    /// The caller holds `op`.
    fn ready_claude(&self, language: &str) -> Result<Arc<HiddenClaude>, DictationError> {
        let running = self.current().filter(|claude| claude.language == language);
        let claude = match running {
            Some(claude) => claude,
            None => {
                let claude = Arc::new(HiddenClaude::spawn(language)?);
                self.adopt(Arc::clone(&claude))?;
                claude
            }
        };
        if let Err(err) = wait_ready(&claude) {
            // The next press starts afresh instead of waiting on a Claude that is stuck.
            if let Some(stuck) = lock(&self.claude).take() {
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
        let Some(_op) = inner.try_op() else {
            continue;
        };
        let is_idle =
            lock(&inner.hold).is_none() && lock(&inner.last_used).elapsed() >= IDLE_SHUTDOWN;
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
    if is_code {
        code
    } else {
        FALLBACK_LANGUAGE.to_string()
    }
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
            ScreenView::Unknown { text } if Instant::now() >= deadline => {
                return Err(DictationError::NotReady(text));
            }
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
fn hold_space(
    claude: &HiddenClaude,
    stop: &AtomicBool,
    report: &Report<'_>,
) -> Result<bool, DictationError> {
    reported(hold_until_stopped(claude, stop, report), report)
}

fn reported<T>(
    result: Result<T, DictationError>,
    report: &Report<'_>,
) -> Result<T, DictationError> {
    if let Err(err) = &result {
        report(HoldEvent::Failed {
            code: err.code(),
            detail: err.detail(),
        });
    }
    result
}

fn hold_until_stopped(
    claude: &HiddenClaude,
    stop: &AtomicBool,
    report: &Report<'_>,
) -> Result<bool, DictationError> {
    let started = Instant::now();
    let mut is_listening = false;
    let mut interim = InterimWatch::default();
    let mut keys: u32 = 0;
    while !stop.load(Ordering::Relaxed) {
        claude.send(KEY_SPACE)?;
        thread::sleep(REPEAT_INTERVAL);
        if !claude.is_alive() {
            return Err(DictationError::Exited);
        }
        keys = keys.wrapping_add(1);
        if !keys.is_multiple_of(KEYS_PER_LOOK) {
            continue;
        }
        let prompt = prompt_of(claude);
        if !is_listening
            && prompt
                .as_ref()
                .is_some_and(|prompt| prompt.phase == VoicePhase::Listening)
        {
            is_listening = true;
            report(HoldEvent::Listening);
        }
        if is_listening && let Some(text) = prompt.as_ref().and_then(|p| interim.changed(&p.live)) {
            report(HoldEvent::Interim { text });
        }
        if !is_listening && started.elapsed() >= LISTEN_TIMEOUT {
            let detail = prompt.map(|prompt| prompt.notice).unwrap_or_default();
            return Err(DictationError::NotListening(detail));
        }
    }
    // The release can come between two looks, right after Claude started recording.
    Ok(is_listening
        || prompt_of(claude).is_some_and(|prompt| prompt.phase == VoicePhase::Listening))
}

/// The interim text last reported. The screen is read at key-repeat speed, so only a change goes
/// out; that alone keeps the events down to how often Claude redraws its transcript.
#[derive(Default)]
struct InterimWatch {
    last: String,
}

impl InterimWatch {
    fn changed(&mut self, live: &str) -> Option<String> {
        if live == self.last {
            return None;
        }
        self.last = live.to_string();
        Some(self.last.clone())
    }
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
        let settle = if prompt.text.is_empty() {
            EMPTY_SETTLE
        } else {
            TEXT_SETTLE
        };
        if since.elapsed() >= settle {
            if prompt.text.is_empty() {
                return Err(DictationError::NothingHeard(notice_unless(
                    &prompt.notice,
                    baseline,
                )));
            }
            return Ok(prompt.text);
        }
        thread::sleep(POLL);
    }
    Err(DictationError::Timeout)
}

/// The clean-up after a stop only keeps the next dictation tidy (`start` clears again): its
/// failure never costs the transcript already read.
fn with_cleanup<T>(
    result: Result<T, DictationError>,
    cleanup: impl FnOnce() -> Result<(), DictationError>,
) -> Result<T, DictationError> {
    if let Err(err) = cleanup() {
        eprintln!("dictation: cleaning up after the stop failed: {err}");
    }
    result
}

fn notice_unless(notice: &str, baseline: &str) -> String {
    if notice == baseline {
        String::new()
    } else {
        notice.to_string()
    }
}

fn changed_notice(claude: &HiddenClaude, baseline: &str) -> String {
    prompt_of(claude)
        .map(|prompt| notice_unless(&prompt.notice, baseline))
        .unwrap_or_default()
}

/// Ends a recording or transcription still running: Esc cancels it and keeps nothing.
fn settle_to_idle(claude: &HiddenClaude) -> Result<(), DictationError> {
    let is_busy = |prompt: &Prompt| {
        matches!(
            prompt.phase,
            VoicePhase::Listening | VoicePhase::Transcribing
        )
    };
    if !prompt_of(claude).is_some_and(|prompt| is_busy(&prompt)) {
        return Ok(());
    }
    claude.send(KEY_ESCAPE)?;
    wait_for(claude, CANCEL_SETTLE, |prompt| {
        prompt.phase == VoicePhase::Idle
    });
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

#[tauri::command]
pub fn dictation_warm(host: State<'_, DictationHost>, language: String) {
    host.warm(&language);
}

#[tauri::command(async)]
pub fn dictation_start(
    host: State<'_, DictationHost>,
    language: String,
    hold: u64,
) -> Result<(), DictationError> {
    host.start(&language, hold)
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
    use portable_pty::CommandBuilder;
    use std::sync::mpsc;

    #[test]
    fn errors_serialize_as_code_and_detail() {
        let json =
            serde_json::to_string(&DictationError::NothingHeard("No speech detected".into()))
                .unwrap();
        assert_eq!(
            json,
            r#"{"code":"nothing_heard","detail":"No speech detected"}"#
        );
        assert_eq!(
            serde_json::to_string(&DictationError::Timeout).unwrap(),
            r#"{"code":"timeout","detail":""}"#
        );
    }

    #[test]
    fn events_serialize_tagged() {
        let listening = DictationEvent {
            hold: 7,
            event: HoldEvent::Listening,
        };
        assert_eq!(
            serde_json::to_string(&listening).unwrap(),
            r#"{"hold":7,"type":"listening"}"#
        );
        let failed = DictationEvent {
            hold: 8,
            event: HoldEvent::Failed {
                code: "not_listening",
                detail: "x".into(),
            },
        };
        assert_eq!(
            serde_json::to_string(&failed).unwrap(),
            r#"{"hold":8,"type":"failed","code":"not_listening","detail":"x"}"#
        );
        let interim = DictationEvent {
            hold: 9,
            event: HoldEvent::Interim {
                text: "Hallo Welt".into(),
            },
        };
        assert_eq!(
            serde_json::to_string(&interim).unwrap(),
            r#"{"hold":9,"type":"interim","text":"Hallo Welt"}"#
        );
    }

    #[test]
    fn reports_the_interim_text_only_when_it_changed() {
        let mut watch = InterimWatch::default();
        let reported: Vec<Option<String>> = ["", "Hallo", "Hallo", "Hallo Welt", ""]
            .iter()
            .map(|live| watch.changed(live))
            .collect();
        assert_eq!(
            reported,
            vec![
                None,
                Some("Hallo".to_string()),
                None,
                Some("Hallo Welt".to_string()),
                Some(String::new()),
            ]
        );
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
        assert_eq!(
            notice_unless("◐ medium · /effort", "◐ medium · /effort"),
            ""
        );
        assert_eq!(
            notice_unless("No speech detected", "◐ medium · /effort"),
            "No speech detected"
        );
    }

    #[test]
    fn a_failing_hold_tells_the_composer() {
        let events = Mutex::new(Vec::new());
        let sink = |event| lock(&events).push(event);
        let result: Result<bool, _> = reported(Err(DictationError::Exited), &sink);
        assert!(matches!(result, Err(DictationError::Exited)));
        assert!(reported(Ok(true), &sink).is_ok());
        assert_eq!(
            *lock(&events),
            vec![HoldEvent::Failed {
                code: "exited",
                detail: String::new()
            }]
        );
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

    /// A process in Claude's place that only waits, so the slot holds one that is alive.
    fn waiting_claude(language: &str) -> Arc<HiddenClaude> {
        let command = if cfg!(windows) {
            let mut command = CommandBuilder::new("cmd");
            command.args(["/d", "/c", "ping -n 60 127.0.0.1 >nul"]);
            command
        } else {
            let mut command = CommandBuilder::new("sleep");
            command.arg("60");
            command
        };
        Arc::new(HiddenClaude::spawn_command(language, command).unwrap())
    }

    fn long_ago() -> Instant {
        Instant::now().checked_sub(Duration::from_secs(60)).unwrap()
    }

    #[test]
    fn a_warm_up_leaves_a_running_claude_to_end_idle() {
        let host = DictationHost::new(|_| {});
        let claude = waiting_claude("de");
        host.inner.adopt(Arc::clone(&claude)).unwrap();
        let used = long_ago();
        *lock(&host.inner.last_used) = used;

        host.inner.warm_up("de");

        assert_eq!(*lock(&host.inner.last_used), used);
        assert!(Arc::ptr_eq(&host.inner.current().unwrap(), &claude));
        host.shut_down();
    }

    #[test]
    fn a_warm_up_leaves_a_held_claude_alone() {
        let host = DictationHost::new(|_| {});
        let claude = waiting_claude("en");
        host.inner.adopt(Arc::clone(&claude)).unwrap();
        *lock(&host.inner.hold) = Some(Hold {
            stop: Arc::new(AtomicBool::new(false)),
            thread: thread::spawn(|| Ok(true)),
            baseline: String::new(),
        });
        let used = long_ago();
        *lock(&host.inner.last_used) = used;

        host.inner.warm_up("de");

        assert!(Arc::ptr_eq(&host.inner.current().unwrap(), &claude));
        assert_eq!(*lock(&host.inner.last_used), used);
        host.shut_down();
    }

    #[test]
    fn a_claude_that_finishes_starting_after_the_shut_down_ends() {
        const ENDED_WITHIN: Duration = Duration::from_secs(8);
        let host = DictationHost::new(|_| {});
        host.shut_down();
        let claude = waiting_claude("de");

        let adopted = host.inner.adopt(Arc::clone(&claude));

        assert!(matches!(adopted, Err(DictationError::Exited)));
        assert!(lock(&host.inner.claude).is_none());
        let deadline = Instant::now() + ENDED_WITHIN;
        while claude.is_alive() && Instant::now() < deadline {
            thread::sleep(POLL);
        }
        assert!(!claude.is_alive());
    }

    #[test]
    fn a_press_takes_only_the_failure_of_the_warm_up_it_waited_for() {
        let host = DictationHost::new(|_| {});
        let start = long_ago();
        let at = |secs| start + Duration::from_secs(secs);
        // The warm-up ran from 0 s to 30 s; what a press at `pressed` gets from it.
        let code_for = |language: &str, error, pressed| {
            *lock(&host.inner.warm_failure) = Some(WarmFailure {
                language: language.to_string(),
                started: at(0),
                at: at(30),
                error: Some(error),
            });
            host.inner
                .warm_failure_since("de", pressed)
                .map(|error| error.code())
        };
        let stuck = || DictationError::NotReady("stuck".into());

        let waited_all = code_for("de", stuck(), at(0));
        let taken_already = host.inner.warm_failure_since("de", at(0));
        let waited_a_moment = code_for("de", stuck(), at(29));
        let missing_after_a_moment = code_for("de", DictationError::ClaudeMissing, at(29));
        let came_after = code_for("de", stuck(), at(31));
        let other_language = code_for("en", stuck(), at(0));

        assert_eq!(waited_all, Some("not_ready"));
        assert_eq!(waited_a_moment, None);
        assert_eq!(missing_after_a_moment, Some("claude_missing"));
        assert_eq!(came_after, None);
        assert_eq!(other_language, None);
        assert!(taken_already.is_none());
    }

    #[test]
    fn a_failed_warm_up_pauses_the_next_ones() {
        let host = DictationHost::new(|_| {});
        *lock(&host.inner.warm_failure) = Some(WarmFailure {
            language: "de".into(),
            started: Instant::now(),
            at: Instant::now(),
            error: None,
        });
        let used = long_ago();
        *lock(&host.inner.last_used) = used;

        host.inner.warm_up("de");

        assert!(lock(&host.inner.claude).is_none());
        assert_eq!(*lock(&host.inner.last_used), used);
    }

    /// A process in Claude's place that shows a recording Claude's prompt box and then waits.
    fn listening_claude() -> Arc<HiddenClaude> {
        let command = if cfg!(windows) {
            let mut command = CommandBuilder::new("powershell");
            command.args([
                "-NoProfile",
                "-Command",
                "[Console]::OutputEncoding = [Text.Encoding]::UTF8; \
                 [Console]::Write(\"listening…`r`n───`r`n❯ `r`n───`r`n\"); Start-Sleep 60",
            ]);
            command
        } else {
            let mut command = CommandBuilder::new("sh");
            command.args([
                "-c",
                "printf 'listening…\\r\\n───\\r\\n❯ \\r\\n───\\r\\n'; sleep 60",
            ]);
            command
        };
        Arc::new(HiddenClaude::spawn_command("de", command).unwrap())
    }

    #[test]
    fn a_release_between_two_looks_still_sees_claude_recording() {
        const SHOWN_WITHIN: Duration = Duration::from_secs(10);
        let claude = listening_claude();
        let deadline = Instant::now() + SHOWN_WITHIN;
        while prompt_of(&claude).is_none() {
            assert!(Instant::now() < deadline, "the stand-in drew no prompt box");
            thread::sleep(POLL);
        }
        let stopped = AtomicBool::new(true);

        let recorded = hold_until_stopped(&claude, &stopped, &|_| {});

        assert!(recorded.unwrap());
        claude.shut_down();
    }

    /// Drives the real `claude` on this machine: warmed up, it must record (silence) right away
    /// and come back with an empty input. Run with `cargo test -- --ignored real_claude`.
    #[test]
    #[ignore = "starts the installed claude and records from the microphone"]
    fn real_claude_records_and_cleans_up() {
        const HOLD: Duration = Duration::from_millis(1500);
        // Measured ~0.1 s; the headroom keeps a busy machine from failing it.
        const WARM_RECORDING: Duration = Duration::from_secs(1);
        const SHORT_HOLD: Duration = Duration::from_millis(60);
        let (sender, events) = mpsc::channel();
        let sender = Mutex::new(sender);
        let host = DictationHost::new(move |event| {
            // The test may be over already.
            let _ = lock(&sender).send(event);
        });
        host.warm("de");
        let deadline = Instant::now() + READY_TIMEOUT;
        while host.inner.current().and_then(|c| prompt_of(&c)).is_none() {
            assert!(Instant::now() < deadline, "warming up took too long");
            thread::sleep(POLL);
        }
        let pressed = Instant::now();
        host.start("de", 1).unwrap();
        let listening = DictationEvent {
            hold: 1,
            event: HoldEvent::Listening,
        };
        assert_eq!(
            events.recv_timeout(Duration::from_secs(10)).unwrap(),
            listening
        );
        eprintln!("listening after {:?}", pressed.elapsed());
        assert!(pressed.elapsed() < WARM_RECORDING);
        thread::sleep(HOLD);
        let result = host.stop();
        eprintln!("stop: {result:?}");
        assert!(matches!(
            result,
            Ok(_) | Err(DictationError::NothingHeard(_))
        ));
        let claude = host.inner.current().unwrap();
        assert_eq!(prompt_of(&claude).unwrap().text, "");
        host.start("de", 2).unwrap();
        thread::sleep(HOLD);
        host.cancel().unwrap();
        assert_eq!(prompt_of(&claude).unwrap().text, "");
        // Let go before Claude records: the spaces it typed meanwhile must go again.
        for hold in 3..6 {
            host.start("de", hold).unwrap();
            thread::sleep(SHORT_HOLD);
            host.cancel().unwrap();
            assert_eq!(prompt_of(&claude).unwrap().text, "");
        }
        host.shut_down();
        thread::sleep(Duration::from_secs(4));
        assert!(!claude.is_alive());
    }
}
